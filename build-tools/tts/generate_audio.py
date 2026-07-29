# Generates Tymer's spoken sounds from the prompt sets in sound-prompts/.
#
#   uv run generate_audio.py tymer-gacrux-brisk --dry-run       # preview, no API calls
#   uv run generate_audio.py tymer-gacrux-brisk --overwrite      # generate the whole set
#   uv run generate_audio.py tymer-gacrux --only overtime/       # one branch
#
# A set name resolves against sound-prompts/ and output defaults to
# src/assets/sounds/, so neither has to be spelled out. Run ../../normalize_audio.sh
# afterwards to convert to .webm and regenerate the sound manifest.
#
# Needs a Gemini API key in build-tools/tts/.env (see .env.example).
# Format spec: sound-prompts/README.md

import argparse
import filecmp
import httpx
import mimetypes
import os
import re
import shutil
import struct
import sys
import time
from datetime import datetime
from dotenv import load_dotenv
from google import genai
from google.genai import types
from google.genai.errors import ClientError, ServerError
from rich.console import Console
from rich.table import Table

TOOL_DIR = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(os.path.dirname(TOOL_DIR))
PROMPTS_DIR = os.path.join(REPO_ROOT, 'sound-prompts')
DEFAULT_OUTPUT_DIR = os.path.join(REPO_ROOT, 'src', 'assets', 'sounds')

# One request per minute. The free tier allows three, but a 429 retry spends
# from the same budget — at 21s spacing a single retry storm starved the next
# few clips and they failed outright. A full minute keeps every request inside
# a safe window even when the previous one had to retry twice.
DEFAULT_DELAY_SECONDS = 60

# google-genai builds its httpx client with `timeout=None` unless HttpOptions
# says otherwise, and that None reaches the streaming send() — so a stalled SSE
# response blocks the iterator forever. It cost a 31-minute hang on a run that
# was otherwise averaging 25s per clip. httpx applies this per socket operation,
# so it is the gap between audio chunks, not the length of the whole clip.
CHUNK_TIMEOUT_SECONDS = 90

# A stream that trickles forever never trips the per-chunk timeout, so bound the
# whole response too. Clips are a few seconds of speech; a minute is a long tail.
STREAM_DEADLINE_SECONDS = 180

# The SDK ships a retry policy but leaves it OFF: HttpOptions.retry_options
# defaults to None, which retry_args() turns into stop_after_attempt(1). The 503
# "model experiencing high demand" that killed a run was a first-and-only try.
# Switching it on absorbs a short capacity blip in place, before the block ever
# reaches the key rotation below.
SERVER_RETRY_ATTEMPTS = 3

# The SDK's own default list includes 429 — deliberately dropped here. A rate
# limit is the KeyPool's business: it spends from the same per-minute budget as a
# real request, so retrying in place is precisely the storm that the
# one-request-per-minute spacing exists to prevent. It must stay an exception
# that reaches the handler, not something absorbed inside the client.
SERVER_RETRY_STATUS_CODES = [408, 500, 502, 503, 504]

# Retries above cover getting the response; chunk iteration happens after
# _request returns, so a mid-stream stall lands here instead. Hand the block to
# the next key and try again, but not indefinitely — one bad block should not eat
# the run.
MAX_TRANSIENT_ATTEMPTS = 3

# A 503 means the model is out of capacity, and the SDK's exponential backoff has
# already come and gone by the time we see one. Another key does not help — it is
# the same overloaded model — so wait before asking again.
SERVER_BUSY_BACKOFF_SECONDS = 30

# The key lives next to this script, not wherever it happens to be invoked from.
load_dotenv(os.path.join(TOOL_DIR, '.env'))


def staging_dir_for(set_path):
    """Where a set accumulates until it is complete.

    A set takes several days to generate on free-tier quota. Writing straight
    into src/assets/sounds/ would leave the app playing a half-updated bank —
    some events in the new direction, some in the old. Staging keeps a partial
    set out of the way until every clip exists, then --promote moves it across
    in one step.
    """
    name = os.path.basename(set_path)
    if name.endswith('.txt'):
        name = name[:-4]
    return os.path.join(TOOL_DIR, '.staging', name)


def expected_file(block, base_output_dir):
    """The file this block writes. Its presence is what 'already generated' means."""
    folder = os.path.join(base_output_dir, block['path']) if block['path'] else base_output_dir
    return os.path.join(folder, f'{block["name"]}-1.wav')


def missing_blocks(blocks, base_output_dir):
    """Blocks with no generated file yet — what a resumed run should cover."""
    return [b for b in blocks if not os.path.exists(expected_file(b, base_output_dir))]


def next_free_take(target):
    """Find a free '-N' filename beside an occupied one.

    'elapsed/006/brisk-1.wav' -> '.../brisk-2.wav' -> '.../brisk-3.wav'
    """
    folder = os.path.dirname(target)
    name = os.path.basename(target)
    stem, extension = os.path.splitext(name)
    stem = re.sub(r'-\d+$', '', stem)

    counter = 2
    while True:
        candidate = os.path.join(folder, f'{stem}-{counter}{extension}')
        if not os.path.exists(candidate):
            return candidate
        counter += 1


def promote_staging(staging, destination):
    """Copy a completed set into the real asset tree, merging with what is there.

    Sets are promoted one after another into the same directories, and every
    file in an event directory is an interchangeable take. So a name already in
    use is not a conflict to resolve by overwriting — it is another take, and
    the incoming file takes the next free number. An identical file is skipped,
    which keeps re-promoting the same set idempotent instead of piling up copies.

    Returns (copied, skipped) as lists of destination-relative paths.
    """
    copied = []
    skipped = []
    for root, _, files in os.walk(staging):
        for name in sorted(files):
            if not name.endswith('.wav'):
                continue
            source = os.path.join(root, name)
            target = os.path.join(destination, os.path.relpath(source, staging))
            os.makedirs(os.path.dirname(target), exist_ok=True)

            if os.path.exists(target):
                if filecmp.cmp(source, target, shallow=False):
                    skipped.append(os.path.relpath(target, destination))
                    continue
                target = next_free_take(target)

            shutil.copy2(source, target)
            copied.append(os.path.relpath(target, destination))
    return copied, skipped


class RateLimited(Exception):
    """A request was refused with 429. `daily` distinguishes a spent daily quota
    from a momentary per-minute throttle."""

    def __init__(self, retry_seconds, daily):
        super().__init__(f'rate limited (retry in {retry_seconds:.0f}s, daily={daily})')
        self.retry_seconds = retry_seconds
        self.daily = daily


class Transient(Exception):
    """The request failed for a reason that says nothing about this key — a
    stalled stream, a dropped connection, an overloaded model.

    Distinct from RateLimited, which is a fact about the key's quota: a Transient
    costs no strike and never retires anything. `wait_seconds` is how long to
    pause before trying again, since a dead socket wants another key immediately
    while an out-of-capacity model wants time to recover.
    """

    def __init__(self, reason, wait_seconds=0):
        super().__init__(reason)
        self.wait_seconds = wait_seconds


class KeyPool:
    """Rotates requests across API keys and drops the ones that stop working.

    Quota is per Google Cloud project, so keys from different accounts have
    entirely separate budgets — both daily and per-minute. Cycling through them
    therefore multiplies throughput rather than merely providing a fallback, and
    the wait between requests can be divided by the number of live keys.

    A key is retired after MAX_STRIKES rate limits, or immediately when the API
    says its daily quota is gone. Retired keys are not tried again this run.
    """

    MAX_STRIKES = 3

    def __init__(self, keys, max_strikes=MAX_STRIKES):
        self.keys = list(keys)
        self.max_strikes = max_strikes
        self.strikes = {key: 0 for key in self.keys}
        self.requests = {key: 0 for key in self.keys}
        self.retired = []
        self.retire_reason = {}
        self._cursor = 0

    def label(self, key):
        return f'key {self.keys.index(key) + 1}'

    def active(self):
        return [key for key in self.keys if key not in self.retired]

    def next_key(self):
        """The next live key, round-robin. None when every key is retired."""
        live = self.active()
        if not live:
            return None
        key = live[self._cursor % len(live)]
        self._cursor += 1
        self.requests[key] += 1
        return key

    def retire(self, key, reason):
        if key not in self.retired:
            self.retired.append(key)
            self.retire_reason[key] = reason

    def record_rate_limit(self, key, daily):
        """Count a 429 against a key. Returns True if that retired it."""
        self.strikes[key] += 1
        if daily:
            self.retire(key, 'daily quota reached')
            return True
        if self.strikes[key] >= self.max_strikes:
            self.retire(key, f'{self.strikes[key]} rate limits')
            return True
        return False

    def all_exhausted(self):
        return not self.active()

    def summary_lines(self):
        lines = []
        for key in self.keys:
            state = self.retire_reason.get(key, 'still available')
            lines.append(
                f'  {self.label(key)} ({key[:6]}...{key[-4:]}): '
                f'{self.requests[key]} request(s), {self.strikes[key]} rate limit(s) — {state}'
            )
        return lines


def load_api_keys(env):
    """Collect API keys from the environment, in the order they should be used.

    GEMINI_API_KEYS holds any number of keys separated by commas, newlines or
    whitespace; GEMINI_API_KEY holds a single one. Both may be set. Each Google
    account carries its own quota, so the list is what multiplies how much of a
    set can be generated in a day. Blanks and duplicates are dropped.
    """
    raw = []
    raw.extend(re.split(r'[,\s]+', env.get('GEMINI_API_KEYS', '')))
    raw.append(env.get('GEMINI_API_KEY', ''))

    keys = []
    for key in raw:
        key = key.strip()
        if key and key not in keys:
            keys.append(key)
    return keys


def resolve_set_file(name):
    """Accept a bare set name, a name with .txt, or any path to a set-file.

    Bare names resolve against sound-prompts/ so the common case is just
    `generate_audio.py tymer-gacrux-brisk`.
    """
    candidates = [name, os.path.join(PROMPTS_DIR, name), os.path.join(PROMPTS_DIR, name + '.txt')]
    for candidate in candidates:
        if os.path.isfile(candidate):
            return candidate

    available = []
    if os.path.isdir(PROMPTS_DIR):
        available = sorted(f[:-4] for f in os.listdir(PROMPTS_DIR) if f.endswith('.txt'))
    raise ValueError(f'no set-file matching {name!r}; available sets: {", ".join(available) or "none"}')


# Directives that may only take a value on the same line as the key (no
# multi-line continuation).
SINGLE_LINE_DIRECTIVES = {'voice', 'name'}

# Directives that may either take a same-line value or a multi-line
# continuation collected from following lines.
MULTI_LINE_DIRECTIVES = {'profile', 'scene', 'style', 'pace', 'accent', 'context', 'text'}

ALL_DIRECTIVES = SINGLE_LINE_DIRECTIVES | MULTI_LINE_DIRECTIVES


def _strip_blank_ends(lines):
    """Strip leading/trailing blank lines from a list of raw lines."""
    lines = list(lines)
    while lines and lines[0].strip() == '':
        lines.pop(0)
    while lines and lines[-1].strip() == '':
        lines.pop()
    return lines


def parse_set_file(path):
    """Parse a set-file into (file_defaults, blocks).

    file_defaults is a dict of directive values that appeared before the
    first [path] block. blocks is a list of dicts, one per [path] block,
    each with the block's directives merged over file_defaults, plus
    'path' (the block's output subdirectory) and 'line' (the block header's
    line number, 1-based).

    Raises ValueError (naming the file and/or line number) on:
      - a missing file-level @voice
      - a block with no resolved @text
      - an unknown @key
      - a malformed [path line (no closing ']')
    """
    with open(path, 'r') as f:
        raw_lines = f.read().splitlines()

    defaults = {}
    raw_blocks = []  # list of {'path', 'line', 'values'}
    current = None  # None while at file level, else the raw block being built

    pending_key = None
    pending_lines = []

    def flush():
        nonlocal pending_key, pending_lines
        if pending_key is not None:
            value = '\n'.join(_strip_blank_ends(pending_lines))
            target = current['values'] if current is not None else defaults
            target[pending_key] = value
        pending_key = None
        pending_lines = []

    for line_num, raw_line in enumerate(raw_lines, 1):
        stripped = raw_line.strip()

        if stripped.startswith('#'):
            # A comment is always a comment, even mid-value — otherwise a
            # banner between sections is silently spoken as part of the
            # preceding @context/@text. It also ends any pending value.
            flush()
            continue

        if pending_key is not None and not (stripped.startswith('@') or stripped.startswith('[')):
            # Inside a multi-line directive value: blank lines are kept
            # (trimmed at the ends) until the next '@', '[' or '#' line.
            pending_lines.append(raw_line)
            continue

        if stripped.startswith('@') or stripped.startswith('['):
            flush()

        if stripped == '':
            continue

        if stripped.startswith('@'):
            rest = stripped[1:]
            parts = rest.split(None, 1)
            key = parts[0] if parts else ''
            same_line_value = parts[1].strip() if len(parts) > 1 else ''

            if key not in ALL_DIRECTIVES:
                raise ValueError(f'{path}: line {line_num}: unknown directive @{key}')

            target = current['values'] if current is not None else defaults
            if key in SINGLE_LINE_DIRECTIVES:
                target[key] = same_line_value
            else:
                pending_key = key
                pending_lines = [same_line_value] if same_line_value else []
            continue

        if stripped.startswith('['):
            if not stripped.endswith(']'):
                raise ValueError(f'{path}: line {line_num}: malformed block header (missing "]"): {stripped}')
            block_path = stripped[1:-1].strip()
            current = {'path': block_path, 'line': line_num, 'values': {}}
            raw_blocks.append(current)
            continue

        raise ValueError(f'{path}: line {line_num}: unexpected line: {stripped}')

    flush()

    if not defaults.get('voice', '').strip():
        raise ValueError(f'{path}: missing required file-level @voice')

    blocks = []
    for raw_block in raw_blocks:
        merged = {**defaults, **raw_block['values']}
        text = merged.get('text', '').strip()
        if not text:
            raise ValueError(f'{path}: line {raw_block["line"]}: block [{raw_block["path"]}] is missing required @text')

        name = merged.get('name', '').strip() or default_name_from_text(merged.get('text', ''))

        blocks.append({
            'path': raw_block['path'],
            'line': raw_block['line'],
            'voice': merged.get('voice', ''),
            'profile': merged.get('profile', ''),
            'scene': merged.get('scene', ''),
            'style': merged.get('style', ''),
            'pace': merged.get('pace', ''),
            'accent': merged.get('accent', ''),
            'context': merged.get('context', ''),
            'text': merged.get('text', ''),
            'name': name,
        })

    return defaults, blocks


def compose_prompt(block):
    """Build the composed AI-Studio-style prompt text sent to the model.

    Sections are omitted when their resolved value is empty/absent.
    '#### TRANSCRIPT' is always present and always the last section.
    """
    sections = []

    profile = block.get('profile', '').strip()
    if profile:
        sections.append(f'# AUDIO PROFILE: {profile}')

    scene = block.get('scene', '').strip()
    if scene:
        sections.append(f'## THE SCENE\n{scene}')

    style = block.get('style', '').strip()
    pace = block.get('pace', '').strip()
    accent = block.get('accent', '').strip()
    notes_lines = []
    if style:
        notes_lines.append(f'Style: {style}')
    if pace:
        notes_lines.append(f'Pace: {pace}')
    if accent:
        notes_lines.append(f'Accent: {accent}')
    if notes_lines:
        sections.append("### DIRECTOR'S NOTES\n" + '\n'.join(notes_lines))

    context = block.get('context', '').strip()
    if context:
        sections.append(f'### SAMPLE CONTEXT\n{context}')

    text = block.get('text', '')
    sections.append(f'#### TRANSCRIPT\n{text}')

    return '\n\n'.join(sections)


def select_blocks(blocks, only=None, limit=None):
    """Filter blocks by output-path prefix and/or truncate to the first N."""
    result = blocks
    if only:
        result = [b for b in result if b['path'].startswith(only)]
    if limit is not None:
        result = result[:limit]
    return result


def resolve_output_filename(base_name, extension, folder=None, overwrite=False):
    """Pick the file to write for one generated clip.

    Default: never clobber, so repeat runs pile up -1, -2, -3 takes.
    With overwrite: always write the set's own '-1' file, so re-running a set
    replaces its previous takes instead of accumulating stale ones. Takes from
    OTHER sets in the same directory use a different stem and are left alone.
    """
    if overwrite:
        filename = f'{base_name}-1{extension}'
        return os.path.join(folder, filename) if folder else filename
    return get_unique_filename(base_name, extension, folder)


def get_unique_filename(base_name, extension, folder=None):
    """Get a unique filename by adding -1, -2, etc. Always starts with -1."""
    counter = 1
    while True:
        filename = f'{base_name}-{counter}{extension}'
        if folder:
            filename = os.path.join(folder, filename)
        if not os.path.exists(filename):
            return filename
        counter += 1


def save_binary_file(file_name, data):
    f = open(file_name, 'wb')
    f.write(data)
    f.close()
    print(f'File saved to: {file_name}')


def text_to_filename(text):
    """Convert text to lowercase-dash-separated filename."""
    # Remove special characters and brackets
    cleaned = re.sub(r'[^\w\s-]', '', text)
    # Replace whitespace with dashes
    cleaned = re.sub(r'\s+', '-', cleaned.strip())
    # Convert to lowercase
    cleaned = cleaned.lower()
    # Remove multiple consecutive dashes
    cleaned = re.sub(r'-+', '-', cleaned)
    # Remove leading/trailing dashes
    cleaned = cleaned.strip('-')
    return cleaned


MAX_AUTO_NAME_LENGTH = 60


def default_name_from_text(text):
    """Derive a filename stem from the spoken text.

    Bracketed cues like [coldly] are delivery directions, not speech, so they
    are dropped before slugifying. The block path already identifies the event,
    so the stem only has to tell variants apart — truncate it at a word
    boundary rather than carrying a whole sentence into the filename.
    """
    spoken = re.sub(r'\[[^\]]*\]', ' ', text)
    slug = text_to_filename(spoken)
    if len(slug) <= MAX_AUTO_NAME_LENGTH:
        return slug
    cut = slug[:MAX_AUTO_NAME_LENGTH].rsplit('-', 1)[0]
    return cut or slug[:MAX_AUTO_NAME_LENGTH]


def generate_audio(client, block, base_output_dir='sounds', retry_count=0, overwrite=False):
    """Generate audio for a resolved block and save it under the block's path.

    Args:
        client: Gemini API client
        block: A resolved block dict from parse_set_file (must have 'path',
            'voice', 'name' and the fields compose_prompt needs)
        base_output_dir: Base directory for output (default: 'sounds')
        retry_count: Number of retries attempted
    """
    model = 'gemini-3.1-flash-tts-preview'
    folder = block['path']

    prompt_text = compose_prompt(block)

    contents = [
        types.Content(
            role='user',
            parts=[
                types.Part.from_text(text=prompt_text),
            ],
        ),
    ]
    generate_content_config = types.GenerateContentConfig(
        temperature=1,
        response_modalities=[
            'audio',
        ],
        speech_config=types.SpeechConfig(
            voice_config=types.VoiceConfig(
                prebuilt_voice_config=types.PrebuiltVoiceConfig(
                    voice_name=block['voice']
                )
            )
        ),
    )

    # Filename stem: explicit @name, or a slug of the text
    base_filename = block['name']

    # Build full output path
    if folder:
        if base_output_dir:
            full_folder = os.path.join(base_output_dir, folder)
        else:
            full_folder = folder
    else:
        full_folder = base_output_dir

    # Create folder if specified and doesn't exist
    if full_folder and not os.path.exists(full_folder):
        os.makedirs(full_folder)
        print(f'Created folder: {full_folder}')

    # `folder` stays relative — the 429 retry below re-joins it with
    # base_output_dir, so overwriting it here would nest one level per retry.

    try:
        # gemini-3.1 streams the audio as many small PCM chunks (~40ms each),
        # so collect them all and write a single file once the stream ends.
        audio_chunks = []
        audio_mime_type = None
        deadline = time.monotonic() + STREAM_DEADLINE_SECONDS

        for chunk in client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=generate_content_config,
        ):
            if time.monotonic() > deadline:
                raise Transient(f'stream still open after {STREAM_DEADLINE_SECONDS}s')
            if chunk.parts is None:
                continue
            if chunk.parts[0].inline_data and chunk.parts[0].inline_data.data:
                inline_data = chunk.parts[0].inline_data
                audio_chunks.append(inline_data.data)
                audio_mime_type = inline_data.mime_type
            elif text := chunk.text:
                print(text)

        if not audio_chunks:
            print('  WARNING: no audio returned for this prompt')
            return

        data_buffer = b''.join(audio_chunks)
        file_extension = mimetypes.guess_extension(audio_mime_type)
        if file_extension is None:
            file_extension = '.wav'
            data_buffer = convert_to_wav(data_buffer, audio_mime_type)

        file_name = resolve_output_filename(base_filename, file_extension, full_folder, overwrite)
        save_binary_file(file_name, data_buffer)
    except httpx.TimeoutException as e:
        raise Transient(f'no data for {CHUNK_TIMEOUT_SECONDS}s ({type(e).__name__})') from e
    except httpx.TransportError as e:
        # Connection reset, protocol error, DNS — the request never completed.
        raise Transient(f'connection failed ({type(e).__name__})') from e
    except ServerError as e:
        # 5xx that outlived the SDK's retries. Nothing to do with this key, and
        # crashing here would throw away every block still queued behind it.
        raise Transient(f'server error {e.code}', wait_seconds=SERVER_BUSY_BACKOFF_SECONDS) from e
    except ClientError as e:
        if e.code == 429:  # Rate limit error
            error_message = str(e)

            # Parse retry delay from API error
            retry_seconds = None
            try:
                # Try to parse from RetryInfo in error details
                error_dict = eval(str(e).split('. ', 1)[1]) if '. {' in str(e) else {}
                if error_dict:
                    details = error_dict.get('error', {}).get('details', [])
                    for detail in details:
                        if detail.get('@type') == 'type.googleapis.com/google.rpc.RetryInfo':
                            retry_delay_str = detail.get('retryDelay', '')
                            if retry_delay_str.endswith('s'):
                                retry_seconds = float(retry_delay_str[:-1])
                            break
            except Exception:
                pass

            # Also try to parse from error message
            if retry_seconds is None and 'Please retry in' in error_message:
                match = re.search(r'retry in ([\d.]+)s', error_message)
                if match:
                    retry_seconds = float(match.group(1))

            # Default retry delay and ensure minimum wait
            if retry_seconds is None or retry_seconds < 5:
                retry_seconds = max(retry_seconds if retry_seconds else 5, 5)  # Minimum 5 seconds

            # Check if this is truly a long-term daily quota (very long wait) or a short burst limit
            if 'GenerateRequestsPerDayPerProjectPerModel' in error_message and retry_seconds > 3600:
                # Long wait time - probably hit actual daily limit
                from datetime import timezone, timedelta
                from zoneinfo import ZoneInfo

                try:
                    pacific = ZoneInfo('America/Los_Angeles')
                    now_utc = datetime.now(timezone.utc)
                    now_pacific = now_utc.astimezone(pacific)
                    next_midnight_pacific = (now_pacific + timedelta(days=1)).replace(
                        hour=0, minute=0, second=0, microsecond=0
                    )
                    time_until_reset = next_midnight_pacific - now_pacific
                    hours = int(time_until_reset.total_seconds() // 3600)
                    minutes = int((time_until_reset.total_seconds() % 3600) // 60)
                    reset_msg = f'~{hours}h {minutes}m'
                except Exception:
                    hours = int(retry_seconds // 3600)
                    minutes = int((retry_seconds % 3600) // 60)
                    reset_msg = f'~{hours}h {minutes}m'

                print(f'  Daily quota reached (resets in {reset_msg})')
                raise RateLimited(retry_seconds, daily=True)

            # Short retry delay - wait and retry
            print(f'  Rate limit hit. Waiting {retry_seconds:.0f} seconds...')
            time.sleep(retry_seconds)

            # Retry the request
            raise RateLimited(retry_seconds, daily=False)
        else:
            raise

def convert_to_wav(audio_data: bytes, mime_type: str) -> bytes:
    """Generates a WAV file header for the given audio data and parameters.

    Args:
        audio_data: The raw audio data as a bytes object.
        mime_type: Mime type of the audio data.

    Returns:
        A bytes object representing the WAV file header.
    """
    parameters = parse_audio_mime_type(mime_type)
    bits_per_sample = parameters['bits_per_sample']
    sample_rate = parameters['rate']
    num_channels = 1
    data_size = len(audio_data)
    bytes_per_sample = bits_per_sample // 8
    block_align = num_channels * bytes_per_sample
    byte_rate = sample_rate * block_align
    chunk_size = 36 + data_size  # 36 bytes for header fields before data chunk size

    # http://soundfile.sapp.org/doc/WaveFormat/

    header = struct.pack(
        '<4sI4s4sIHHIIHH4sI',
        b'RIFF',          # ChunkID
        chunk_size,       # ChunkSize (total file size - 8 bytes)
        b'WAVE',          # Format
        b'fmt ',          # Subchunk1ID
        16,               # Subchunk1Size (16 for PCM)
        1,                # AudioFormat (1 for PCM)
        num_channels,     # NumChannels
        sample_rate,      # SampleRate
        byte_rate,        # ByteRate
        block_align,      # BlockAlign
        bits_per_sample,  # BitsPerSample
        b'data',          # Subchunk2ID
        data_size         # Subchunk2Size (size of audio data)
    )
    return header + audio_data

def parse_audio_mime_type(mime_type: str) -> dict[str, int | None]:
    """Parses bits per sample and rate from an audio MIME type string.

    Assumes bits per sample is encoded like "L16" and rate as "rate=xxxxx".

    Args:
        mime_type: The audio MIME type string (e.g., "audio/L16;rate=24000").

    Returns:
        A dictionary with "bits_per_sample" and "rate" keys. Values will be
        integers if found, otherwise None.
    """
    bits_per_sample = 16
    rate = 24000

    # Extract rate from parameters
    parts = mime_type.split(';')
    for param in parts: # Skip the main type part
        param = param.strip()
        if param.lower().startswith('rate='):
            try:
                rate_str = param.split('=', 1)[1]
                rate = int(rate_str)
            except (ValueError, IndexError):
                # Handle cases like "rate=" with no value or non-integer value
                pass # Keep rate as default
        elif param.startswith('audio/L'):
            try:
                bits_per_sample = int(param.split('L', 1)[1])
            except (ValueError, IndexError):
                pass # Keep bits_per_sample as default if conversion fails

    return {'bits_per_sample': bits_per_sample, 'rate': rate}


def build_arg_parser():
    parser = argparse.ArgumentParser(
        description='Generate TTS audio clips from a structured set-file.',
    )
    parser.add_argument('set_file', help='Set name (resolved in sound-prompts/) or a path to a set-file')
    parser.add_argument(
        'output_dir', nargs='?', default=None,
        help='Where to write (default: the set\'s staging dir under build-tools/tts/.staging/)',
    )
    parser.add_argument(
        '--promote', action='store_true',
        help='Copy the completed staged set into src/assets/sounds/ and exit (no API calls)',
    )
    parser.add_argument(
        '--regenerate', action='store_true',
        help='Also re-generate blocks that already have a file (default: only missing ones)',
    )
    parser.add_argument('--limit', type=int, default=None, help='Only process the first N selected blocks')
    parser.add_argument('--only', default=None, help='Only process blocks whose path starts with this prefix')
    parser.add_argument(
        '--delay', type=float, default=DEFAULT_DELAY_SECONDS,
        help=f'Seconds to sleep between API requests (default: {DEFAULT_DELAY_SECONDS})',
    )
    parser.add_argument('--dry-run', action='store_true', help='Print what would be generated; make no API calls')
    parser.add_argument(
        '--overwrite',
        action='store_true',
        help="Replace this set's own previous takes instead of adding -2, -3, ... alongside them",
    )
    return parser


if __name__ == '__main__':
    args = build_arg_parser().parse_args()

    try:
        set_path = resolve_set_file(args.set_file)
        defaults, blocks = parse_set_file(set_path)
    except ValueError as e:
        print(f'Error: {e}')
        sys.exit(1)

    staging = staging_dir_for(set_path)
    base_output_dir = os.path.expanduser(args.output_dir) if args.output_dir else staging

    print(f'Set: {set_path} ({len(blocks)} blocks, voice: {defaults.get("voice")})')
    print(f'Output directory: {base_output_dir}')

    if args.promote:
        outstanding = missing_blocks(blocks, staging)
        if outstanding:
            print(f'\nRefusing to promote: {len(outstanding)} of {len(blocks)} clip(s) still missing.')
            print('Generate the rest first — promoting now would leave the bank half-updated.')
            for block in outstanding[:10]:
                print(f'  missing: {block["path"]}')
            if len(outstanding) > 10:
                print(f'  ... and {len(outstanding) - 10} more')
            sys.exit(1)
        copied, skipped = promote_staging(staging, DEFAULT_OUTPUT_DIR)
        print(f'\nPromoted {len(copied)} clip(s) into {DEFAULT_OUTPUT_DIR}')
        if skipped:
            print(f'{len(skipped)} already present and identical — skipped')
        renamed = [c for c in copied if not c.endswith('-1.wav')]
        if renamed:
            print(f'{len(renamed)} landed beside an existing take as an alternative:')
            for name in renamed[:5]:
                print(f'  {name}')
            if len(renamed) > 5:
                print(f'  ... and {len(renamed) - 5} more')
        print('Run ../../normalize_audio.sh to convert them and refresh the manifest.')
        sys.exit(0)

    selected = select_blocks(blocks, only=args.only, limit=args.limit)

    already = len(blocks) - len(missing_blocks(blocks, base_output_dir))
    if not args.regenerate:
        selected = missing_blocks(selected, base_output_dir)

    print(f'Already generated: {already}/{len(blocks)}')
    print(f'Selected {len(selected)} block(s) to process\n')

    if not selected:
        if already == len(blocks):
            print('This set is complete — nothing to generate.')
            print(f'Promote it with:  uv run generate_audio.py {args.set_file} --promote')
        else:
            print('Nothing to do for this selection (use --regenerate to redo existing clips).')
        sys.exit(0)

    # Display selected blocks in a table
    console = Console()
    table = Table(show_header=True, header_style="bold magenta")
    table.add_column("#", style="dim", width=3)
    table.add_column("Path", style="cyan")
    table.add_column("Text", style="white")

    for i, block in enumerate(selected, 1):
        table.add_row(str(i), block['path'], block['text'])

    console.print(table)
    print()

    if args.dry_run:
        for i, block in enumerate(selected, 1):
            full_folder = os.path.join(base_output_dir, block['path']) if block['path'] else base_output_dir
            print(f'[{i}/{len(selected)}] {full_folder}')
            print(f'  Voice: {block["voice"]}')
            print(f'  Filename stem: {block["name"]}')
            print('  --- prompt ---')
            print(compose_prompt(block))
            print('  --------------\n')
        sys.exit(0)

    api_keys = load_api_keys(os.environ)
    if not api_keys:
        print('Error: no API key found. Put GEMINI_API_KEY in build-tools/tts/.env')
        sys.exit(1)

    pool = KeyPool(api_keys)
    clients = {}
    print(f'Using {len(api_keys)} API key(s), round-robin\n')

    def report(done, stopped_at=None):
        print('\nAPI keys:')
        for line in pool.summary_lines():
            print(line)
        if pool.all_exhausted():
            print(f'\nALL {len(api_keys)} KEY(S) HAVE REACHED THEIR QUOTA.')
            print('Free-tier quota resets at midnight Pacific Time.')
        print(f'\nGenerated {done} of {len(selected)} block(s).')
        if skipped_blocks:
            print(f'{len(skipped_blocks)} block(s) skipped after repeated failures — re-run to pick them up:')
            for path in skipped_blocks:
                print(f'  {path}')
        if stopped_at:
            print(f'Resume later with:  --only {stopped_at}')

    done = 0
    skipped_blocks = []
    current = None
    try:
        for i, block in enumerate(selected, 1):
            current = block
            print(f'[{i}/{len(selected)}] Processing: {block["text"][:50]}...')
            print(f'  Path: {block["path"]}')

            # Try the block on each live key in turn before giving up on it.
            failures = 0
            while True:
                key = pool.next_key()
                if key is None:
                    report(done, stopped_at=block['path'])
                    sys.exit(1)
                if key not in clients:
                    clients[key] = genai.Client(
                        api_key=key,
                        http_options=types.HttpOptions(
                            timeout=CHUNK_TIMEOUT_SECONDS * 1000,  # milliseconds
                            retry_options=types.HttpRetryOptions(
                                attempts=SERVER_RETRY_ATTEMPTS,
                                http_status_codes=SERVER_RETRY_STATUS_CODES,
                            ),
                        ),
                    )

                try:
                    generate_audio(clients[key], block, base_output_dir, overwrite=args.overwrite)
                    done += 1
                    break
                except Transient as transient:
                    failures += 1
                    print(f'  {pool.label(key)}: {transient}')
                    if failures >= MAX_TRANSIENT_ATTEMPTS:
                        print(f'  Giving up on {block["path"]} after {failures} attempts — moving on.')
                        skipped_blocks.append(block['path'])
                        break
                    if transient.wait_seconds:
                        print(f'  Waiting {transient.wait_seconds}s for it to recover...')
                        time.sleep(transient.wait_seconds)
                    print(f'  Retrying on the next key ({failures}/{MAX_TRANSIENT_ATTEMPTS})...')
                except RateLimited as limited:
                    retired = pool.record_rate_limit(key, limited.daily)
                    if retired:
                        print(f'  {pool.label(key)} retired: {pool.retire_reason[key]}')
                    else:
                        print(f'  {pool.label(key)} rate limited '
                              f'({pool.strikes[key]}/{pool.max_strikes} strikes)')

                    if pool.all_exhausted():
                        report(done, stopped_at=block['path'])
                        sys.exit(1)

                    # With one key left there is nobody to hand the block to, so
                    # waiting out the limit is the only way forward.
                    if len(pool.active()) == 1 and not retired:
                        print(f'  Waiting {limited.retry_seconds:.0f}s before retrying...')
                        time.sleep(limited.retry_seconds)
                    else:
                        print(f'  Handing this block to another key...')
            print()

            # Each key has its own per-minute budget, so the wait shrinks with
            # the number of live keys — three keys means a third of the spacing.
            if i < len(selected):
                spacing = args.delay / max(1, len(pool.active()))
                print(f'  Waiting {spacing:.0f}s ({len(pool.active())} key(s) live)...')
                time.sleep(spacing)
                print()

        print('\nAll done!')
        report(done)
    except KeyboardInterrupt:
        print('\n\nInterrupted by user.')
        # The interrupted block itself, not selected[done] — a skipped stall
        # makes `done` stop tracking how far through the list we are.
        report(done, stopped_at=current['path'] if current else None)
        sys.exit(0)
