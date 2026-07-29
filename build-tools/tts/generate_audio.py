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
from google.genai.errors import ClientError
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


class QuotaExhausted(Exception):
    """One API key is out of quota. Callers may retry the block on another key."""


def load_api_keys(env):
    """Collect API keys from the environment, in the order they should be used.

    Accepts GEMINI_API_KEY plus GEMINI_API_KEY_2, _3, ... (one per Google
    account), or GEMINI_API_KEYS as a comma-separated list. Each account carries
    its own free-tier daily quota, so several keys multiply how much of a set
    can be generated in one day. Blanks and duplicates are dropped.
    """
    raw = []
    if env.get('GEMINI_API_KEYS'):
        raw.extend(env['GEMINI_API_KEYS'].split(','))
    if env.get('GEMINI_API_KEY'):
        raw.append(env['GEMINI_API_KEY'])
    index = 2
    while env.get(f'GEMINI_API_KEY_{index}'):
        raw.append(env[f'GEMINI_API_KEY_{index}'])
        index += 1

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

        for chunk in client.models.generate_content_stream(
            model=model,
            contents=contents,
            config=generate_content_config,
        ):
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

                print(f'  Daily quota limit reached on this key!')
                print(f'  Free tier: 15 requests per day for TTS model')
                print(f'  Quota typically resets at midnight Pacific Time')
                print(f'  Estimated time until reset: {reset_msg}')
                raise QuotaExhausted('daily quota reached')

            # Short retry delay - wait and retry
            print(f'  Rate limit hit. Waiting {retry_seconds:.0f} seconds...')
            time.sleep(retry_seconds)

            # Retry the request
            if retry_count < 5:
                return generate_audio(client, block, base_output_dir, retry_count + 1, overwrite)
            print(f'  Rate limit persisted through {retry_count} retries on this key')
            raise QuotaExhausted(f'rate limit persisted through {retry_count} retries')
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

    key_index = 0
    print(f'Using {len(api_keys)} API key(s)\n')
    client = genai.Client(api_key=api_keys[key_index])

    # Process each selected block
    try:
        for i, block in enumerate(selected, 1):
            print(f'[{i}/{len(selected)}] Processing: {block["text"][:50]}...')
            print(f'  Path: {block["path"]}')

            # A key that runs dry doesn't end the run — every remaining key gets
            # this block before we give up, so several accounts' daily quotas add up.
            while True:
                try:
                    generate_audio(client, block, base_output_dir, overwrite=args.overwrite)
                    break
                except QuotaExhausted as exhausted:
                    key_index += 1
                    if key_index >= len(api_keys):
                        print(f'\nAll {len(api_keys)} key(s) exhausted ({exhausted}).')
                        print(f'Generated {i - 1} of {len(selected)} block(s).')
                        print(f'Resume later with:  --only {block["path"]}')
                        sys.exit(1)
                    print(f'  Switching to API key {key_index + 1} of {len(api_keys)}...')
                    client = genai.Client(api_key=api_keys[key_index])
            print()

            # Rate limiting: wait between requests (free tier: 3 requests/minute)
            if i < len(selected):
                print(f'  Waiting {args.delay} seconds for rate limit...')
                time.sleep(args.delay)
                print()

        print('All done!')
    except KeyboardInterrupt:
        print('\n\nInterrupted by user. Exiting gracefully...')
        sys.exit(0)
