# Tymer's spoken sounds: generate them from the prompt sets in sound-prompts/,
# audition them, then promote them into the app.
#
#   uv run sounds.py generate   tymer-gacrux-brisk --dry-run   # preview, no API calls
#   uv run sounds.py generate   tymer-gacrux-brisk             # fill in what is missing
#   uv run sounds.py regenerate tymer-gacrux-brisk --fresh     # discard and start over
#   uv run sounds.py audition   tymer-gacrux-brisk             # listen to the staged set
#   uv run sounds.py promote    tymer-gacrux-brisk             # into src/assets/sounds/
#
# Or from the repo root, no cd needed — every path below resolves against this
# file rather than the working directory:
#
#   pnpm run sounds:generate tymer-gacrux-brisk --dry-run
#   pnpm run sounds regenerate tymer-gacrux-brisk --fresh
#
# A set name resolves against sound-prompts/, generation stages under
# .staging/<set>/ and promote lands in src/assets/sounds/, so no path has to be
# spelled out. Promote also converts what it copied and refreshes the manifest.
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
import subprocess
import sys
import time
from datetime import datetime, timedelta, timezone
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

# Where normalize_audio.sh writes the .webm copies the app actually loads. A
# take deleted from the source tree has to be deleted here too: the manifest
# generator scans THIS directory, so an orphan left behind keeps playing.
NORMALIZED_DIR = os.path.join(REPO_ROOT, 'public', 'sounds')
NORMALIZE_SCRIPT = os.path.join(REPO_ROOT, 'normalize_audio.sh')
MANIFEST_SCRIPT = os.path.join(REPO_ROOT, 'build-tools', 'generate-sound-manifest.js')

# Subcommands that have a package.json script of their own; the rest are reached
# through the bare `pnpm run sounds <subcommand>` passthrough.
PNPM_SUBCOMMANDS = ('generate', 'promote')

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


def shell_cwd(env):
    """The directory the user typed the command in.

    Not necessarily os.getcwd(): both launchers chdir into the tool's directory
    before exec — `uv run --directory` by definition, and `pnpm run` because the
    script it runs is that same uv command. npm and pnpm export the original as
    INIT_CWD, which is the only way back to where the shell actually is.
    """
    return os.path.realpath(env.get('INIT_CWD') or os.getcwd())


def command_hint(env, subcommand):
    """How to re-invoke this tool for `subcommand` from where the user actually is.

    Nothing here depends on the working directory — every path resolves against
    the script — so the tool runs the same from the repo root as from its own
    directory. The follow-up hints are meant to be pasted straight back into the
    shell, though, so they have to name the form that works from there. Launched
    through pnpm, that means another pnpm script: `sounds:generate` and
    `sounds:promote` exist by name, anything else goes through `sounds`.

    A shell function is invisible from inside the process it launched — and it
    chdirs, so it looks exactly like a real `cd` — which is why the one in
    completions/sounds.bash announces itself in the environment instead.
    """
    launcher = env.get('TYMER_SOUNDS_LAUNCHER')
    if launcher:
        return f'{launcher} {subcommand}'

    package_script = env.get('npm_lifecycle_event')
    if package_script:
        namespace = package_script.split(':')[0]
        if subcommand in PNPM_SUBCOMMANDS:
            return f'pnpm run {namespace}:{subcommand}'
        return f'pnpm run {namespace} {subcommand}'
    if shell_cwd(env) == os.path.realpath(TOOL_DIR):
        return f'uv run sounds.py {subcommand}'
    return f'uv run --directory {TOOL_DIR} sounds.py {subcommand}'


def normalize_hint(env):
    """The same, for the sibling shell script that converts what was promoted."""
    script = os.path.join(REPO_ROOT, 'normalize_audio.sh')
    cwd = shell_cwd(env)
    if cwd == os.path.realpath(REPO_ROOT):
        return './normalize_audio.sh'
    if os.path.commonpath([cwd, REPO_ROOT]) == os.path.realpath(REPO_ROOT):
        return os.path.relpath(script, cwd)
    return script


def staging_dir_for(set_path):
    """Where a set accumulates until it is complete.

    A set takes several days to generate on free-tier quota. Writing straight
    into src/assets/sounds/ would leave the app playing a half-updated bank —
    some events in the new direction, some in the old. Staging keeps a partial
    set out of the way until every clip exists, then `promote` moves it across
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


def existing_takes(target):
    """Every already-promoted take with the same set stem as `target`.

    'elapsed/006/brisk-1.wav' matches brisk-1.wav, brisk-2.wav, ... in that
    folder — takes from other sets use a different stem and never match.
    """
    folder = os.path.dirname(target)
    stem = re.sub(r'-\d+$', '', os.path.splitext(os.path.basename(target))[0])
    if not os.path.isdir(folder):
        return []
    return [
        os.path.join(folder, name)
        for name in sorted(os.listdir(folder))
        if re.fullmatch(re.escape(stem) + r'-\d+\.wav', name)
    ]


def set_fully_promoted(blocks, destination):
    """True when every event already holds at least one promoted take of this set.

    From that point on a further batch is purely additive — some events gaining
    an extra take while others wait cannot leave the bank half-updated — so the
    all-clips-staged promote gate no longer serves a purpose and is relaxed.
    """
    return all(existing_takes(expected_file(block, destination)) for block in blocks)


def promote_staging(staging, destination):
    """Copy a completed set into the real asset tree, merging with what is there.

    Sets are promoted one after another into the same directories, and every
    file in an event directory is an interchangeable take. So a name already in
    use is not a conflict to resolve by overwriting — it is another take, and
    the incoming file takes the next free number. A file identical to ANY
    existing take of the same set is skipped — not just the exact target name,
    because an earlier promote may have renamed the clip to -2, -3, ... — which
    keeps re-promoting idempotent instead of piling up copies.

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

            if any(filecmp.cmp(source, take, shallow=False) for take in existing_takes(target)):
                skipped.append(os.path.relpath(target, destination))
                continue
            if os.path.exists(target):
                target = next_free_take(target)

            shutil.copy2(source, target)
            copied.append(os.path.relpath(target, destination))
    return copied, skipped


def wav_files(root):
    """Every .wav under `root`, in a stable order."""
    found = []
    for folder, _, names in os.walk(root):
        found.extend(os.path.join(folder, name) for name in names if name.endswith('.wav'))
    return sorted(found)


def discard_staged_set(staging):
    """Delete a staged set so the next run builds it from scratch. Returns the
    number of clips thrown away.

    Guarded to the tool's own .staging/ tree. This is the only destructive thing
    generation can do, and an explicit output directory is just as likely to be
    src/assets/sounds/ — a whole promoted bank — as a scratch folder.
    """
    staging_root = os.path.realpath(os.path.join(TOOL_DIR, '.staging'))
    target = os.path.realpath(staging)
    inside = target != staging_root and os.path.commonpath([target, staging_root]) == staging_root
    if not inside:
        raise ValueError(f'refusing to delete {staging} — --fresh only ever clears a set under {staging_root}')
    discarded = len(wav_files(staging))
    shutil.rmtree(staging, ignore_errors=True)
    return discarded


def normalized_counterpart(source_path, destination=None):
    """The .webm that normalize_audio.sh produces for a promoted .wav.

    None for anything outside the source tree — there is no counterpart to
    reason about, and guessing one would put a delete somewhere unrelated.
    """
    destination = destination or DEFAULT_OUTPUT_DIR
    relative = os.path.relpath(source_path, destination)
    if relative.startswith(os.pardir):
        return None
    return os.path.join(NORMALIZED_DIR, f'{os.path.splitext(relative)[0]}.webm')


def promoted_takes(blocks, destination):
    """Every already-promoted take belonging to this set, in block order."""
    return [take for block in blocks for take in existing_takes(expected_file(block, destination))]


def clear_promoted_set(blocks, destination):
    """Remove every promoted take of this set, from both trees.

    Replacing a set means the incoming batch IS the set: an earlier, longer batch
    must not survive alongside it as extra takes. Only stems belonging to this
    set match (`existing_takes`), so other voices sharing an event directory are
    left alone.

    The .webm goes with the .wav. generate-sound-manifest.js scans public/sounds/,
    so a normalized orphan is not merely stale — it stays in SOUND_VARIANTS and
    the app keeps playing a take whose source no longer exists.

    Returns (sources, normalized) as lists of removed absolute paths.
    """
    sources, normalized = [], []
    for take in promoted_takes(blocks, destination):
        os.remove(take)
        sources.append(take)
        counterpart = normalized_counterpart(take, destination)
        if counterpart and os.path.exists(counterpart):
            os.remove(counterpart)
            normalized.append(counterpart)
    return sources, normalized


def normalize(paths):
    """Convert promoted clips to .webm and refresh the manifest. True on success.

    normalize_audio.sh with no arguments walks the entire bank, so an empty
    selection must never reach it. There can still be a manifest to rebuild in
    that case — a replacing promote may have only deleted — so that half runs on
    its own.
    """
    command = ['node', MANIFEST_SCRIPT] if not paths else ['bash', NORMALIZE_SCRIPT, *paths]
    return subprocess.call(command, cwd=REPO_ROOT) == 0


def audition(paths):
    """Play clips through mpv, handing it the terminal so the usual keys work.

    Several files become one playlist — `>` / `<` step through it, `q` quits.
    A missing mpv is a note rather than a failure: audio that cost quota-days to
    generate is not going to be discarded over an absent player.
    """
    if not paths:
        print('Nothing to play.')
        return False
    player = shutil.which('mpv')
    if player is None:
        print('mpv is not on PATH — skipping playback.')
        return False
    print(f'\nPlaying {len(paths)} clip(s) in mpv — q quits, > / < step through them.')
    subprocess.call([player, '--no-video', *paths])
    return True


def confirm(question, assume_yes=False):
    """Ask before something irreversible.

    An unattended run does not get to have consent assumed for it — it has to
    have said --yes up front.
    """
    if assume_yes:
        return True
    if not sys.stdin.isatty():
        print('Nobody to ask — re-run with --yes if that is what you want.')
        return False
    try:
        return input(f'{question} [y/N] ').strip().lower().startswith('y')
    except EOFError:
        return False


class RateLimited(Exception):
    """A request was refused with 429. `daily` distinguishes a spent daily quota
    from a momentary per-minute throttle."""

    def __init__(self, retry_seconds, daily):
        super().__init__(f'rate limited (retry in {retry_seconds:.0f}s, daily={daily})')
        self.retry_seconds = retry_seconds
        self.daily = daily


def pacific_reset_at():
    """The next midnight Pacific — when free-tier daily quotas come back — as an
    aware datetime. None when the tz database is unavailable, which is the one
    case where the wall-clock time cannot be worked out."""
    from zoneinfo import ZoneInfo

    try:
        pacific = ZoneInfo('America/Los_Angeles')
    except Exception:
        return None
    now = datetime.now(timezone.utc).astimezone(pacific)
    return (now + timedelta(days=1)).replace(hour=0, minute=0, second=0, microsecond=0)


def format_duration(seconds):
    """'3h 12m' / '12m' / '40s' — coarse on purpose, this is a countdown to a wait."""
    seconds = max(0, int(seconds))
    if seconds < 60:
        return f'{seconds}s'
    if seconds < 3600:
        return f'{seconds // 60}m'
    return f'{seconds // 3600}h {seconds % 3600 // 60}m'


def format_local(moment):
    """A reset time is only actionable in the clock the user is looking at, so
    every quota message renders it in local time — with the weekday when it
    lands on another day, since midnight Pacific usually does."""
    local = moment.astimezone()
    if local.date() == datetime.now().date():
        return f'{local:%H:%M}'
    return f'{local:%H:%M} {local:%a %-d %b}'


def quota_reset_notice():
    """'at 09:00 Sat 2 Aug local time — in 3h 12m'."""
    reset = pacific_reset_at()
    if reset is None:
        return 'at midnight Pacific Time'
    left = (reset - datetime.now(timezone.utc)).total_seconds()
    return f'at {format_local(reset)} local time — in {format_duration(left)}'


# Resume a few minutes AFTER the reset rather than on it: the boundary is
# Google's, not ours, and a clock that is a minute fast would spend the first
# request of the new day collecting another 429 and retiring the key again.
QUOTA_RESET_BUFFER_SECONDS = 5 * 60


def wait_for_quota_reset():
    """Offer to sleep until the daily quota is back. True if we waited and the
    run should carry on, False if the user declined or there is nobody to ask."""
    reset = pacific_reset_at()
    if reset is None or not sys.stdin.isatty():
        return False

    resume = reset + timedelta(seconds=QUOTA_RESET_BUFFER_SECONDS)
    left = (resume - datetime.now(timezone.utc)).total_seconds()
    prompt = (f'\nWait {format_duration(left)} and retry at {format_local(resume)} '
              f'local time? [Y/n] ')
    try:
        answer = input(prompt).strip().lower()
    except EOFError:
        return False
    if answer and not answer.startswith('y'):
        return False

    while True:
        left = (resume - datetime.now(timezone.utc)).total_seconds()
        if left <= 0:
            break
        # One line, rewritten in place — a three-hour wait would otherwise
        # bury the run's output under a couple of hundred countdown lines.
        print(f'  Waiting for quota — {format_duration(left)} left '
              f'(resuming at {format_local(resume)})...   ', end='\r', flush=True)
        time.sleep(min(left, 30))
    print('\nQuota should be back — resuming.\n')
    return True


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

    def revive(self):
        """Put every retired key back in rotation — for after a daily reset has
        been waited out. Request counts stay, since they describe the whole run;
        strikes do not, since they described a budget that no longer exists."""
        self.retired = []
        self.retire_reason = {}
        self.strikes = {key: 0 for key in self.keys}

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


def generate_clip(client, block, base_output_dir='sounds', overwrite=False):
    """Generate audio for a resolved block and save it under the block's path.

    Returns the file written, so the caller can play it back or count it — None
    when the model returned no audio at all.

    Args:
        client: Gemini API client
        block: A resolved block dict from parse_set_file (must have 'path',
            'voice', 'name' and the fields compose_prompt needs)
        base_output_dir: Base directory for output (default: 'sounds')
        overwrite: Write over this set's take -1 rather than adding -2, -3, ...
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
            return None

        data_buffer = b''.join(audio_chunks)
        file_extension = mimetypes.guess_extension(audio_mime_type)
        if file_extension is None:
            file_extension = '.wav'
            data_buffer = convert_to_wav(data_buffer, audio_mime_type)

        file_name = resolve_output_filename(base_filename, file_extension, full_folder, overwrite)
        save_binary_file(file_name, data_buffer)
        return file_name
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
        if e.code != 429:
            raise

        # A 429 body is structured (e.details is the parsed response JSON):
        # google.rpc.QuotaFailure names the exact quota that was hit, and
        # google.rpc.RetryInfo suggests a wait. The quotaId is the ONLY
        # reliable daily-vs-burst signal — a spent DAILY quota has been
        # observed arriving with `retryDelay: 12s`, so the length of the
        # suggested wait says nothing about which limit it was.
        error = e.details.get('error', e.details) if isinstance(e.details, dict) else {}
        details = error.get('details') or []
        message = error.get('message', '') or str(e)

        violations = [
            violation
            for detail in details
            if detail.get('@type', '').endswith('google.rpc.QuotaFailure')
            for violation in detail.get('violations', [])
        ]

        retry_seconds = None
        for detail in details:
            if detail.get('@type', '').endswith('google.rpc.RetryInfo'):
                delay = detail.get('retryDelay', '')
                if delay.endswith('s'):
                    try:
                        retry_seconds = float(delay[:-1])
                    except ValueError:
                        pass
        if retry_seconds is None:
            match = re.search(r'retry in ([\d.]+)s', message)
            if match:
                retry_seconds = float(match.group(1))
        retry_seconds = max(retry_seconds or 0, 5)

        daily_violations = [v for v in violations if 'PerDay' in v.get('quotaId', '')]
        # Message fallback for a body with no structured violations
        if daily_violations or (not violations and 'PerDay' in message):
            limits = ', '.join(
                f"{v.get('quotaValue', '?')}/day for {v.get('quotaDimensions', {}).get('model', 'this model')}"
                for v in daily_violations
            ) or 'daily limit'
            print(f'  Daily quota spent for this key ({limits}) — resets {quota_reset_notice()}')
            raise RateLimited(retry_seconds, daily=True)

        quota_names = ', '.join(sorted({v['quotaId'] for v in violations if v.get('quotaId')}))
        print(f'  Rate limit hit ({quota_names or "no quotaId in the reply"}). Waiting {retry_seconds:.0f} seconds...')
        time.sleep(retry_seconds)
        raise RateLimited(retry_seconds, daily=False)

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


SET_HELP = 'Set name (resolved in sound-prompts/) or a path to a set-file'


def build_arg_parser():
    parser = argparse.ArgumentParser(
        prog='sounds.py',
        description="Generate, audition and promote Tymer's spoken sounds.",
    )
    commands = parser.add_subparsers(dest='command', required=True, metavar='<command>')

    # generate and regenerate differ only in what they consider already done, so
    # everything else about them is one shared surface.
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument('set_file', help=SET_HELP)
    common.add_argument(
        'output_dir', nargs='?', default=None,
        help="Where to write (default: the set's staging dir under build-tools/tts/.staging/)",
    )
    common.add_argument('--only', default=None, help='Only process blocks whose path starts with this prefix')
    common.add_argument('--limit', type=int, default=None, help='Only process the first N selected blocks')
    common.add_argument(
        '--delay', type=float, default=DEFAULT_DELAY_SECONDS,
        help=f'Seconds to sleep between API requests (default: {DEFAULT_DELAY_SECONDS})',
    )
    common.add_argument('--dry-run', action='store_true', help='Print what would be generated; make no API calls')
    common.add_argument(
        '--audition', choices=('off', 'each', 'end'), default='off',
        help='Play clips in mpv as they arrive (each) or all together once the run ends (end)',
    )

    commands.add_parser(
        'generate', parents=[common],
        help='Generate the clips that are still missing — the resumable everyday run',
    )

    regenerate = commands.add_parser(
        'regenerate', parents=[common],
        help="Generate every clip again, writing over this set's take -1",
    )
    regenerate.add_argument(
        '--fresh', action='store_true',
        help='Delete the staged set first, so nothing of the previous batch survives',
    )
    regenerate.add_argument('-y', '--yes', action='store_true', help='Skip the confirmation --fresh asks for')

    listen = commands.add_parser('audition', help='Play the staged set through mpv')
    listen.add_argument('set_file', help=SET_HELP)
    listen.add_argument('--only', default=None, help='Only play blocks whose path starts with this prefix')

    promote = commands.add_parser(
        'promote',
        help='Copy the staged set into src/assets/sounds/, convert it, and clear staging',
    )
    promote.add_argument('set_file', help=SET_HELP)
    promote.add_argument(
        '--replace', action='store_true',
        help="Replace this set's promoted takes entirely instead of landing beside them as alternatives",
    )
    promote.add_argument(
        '--skip-normalize', action='store_true',
        help='Do not convert to .webm or refresh the manifest',
    )
    promote.add_argument('--keep-staging', action='store_true', help='Leave the staged clips in place afterwards')
    promote.add_argument('-y', '--yes', action='store_true', help='Skip the confirmation --replace asks for')
    return parser


def run_audition(args, blocks, staging):
    """Listen to what is staged — the manual verification step before promoting."""
    selected = select_blocks(blocks, only=args.only)
    takes = [take for block in selected for take in existing_takes(expected_file(block, staging))]
    if not takes:
        print(f'\nNothing staged under {staging}.')
        print(f'Generate a batch first:  {command_hint(os.environ, "generate")} {args.set_file}')
        sys.exit(0)
    audition(takes)


def run_promote(args, blocks, staging):
    """Move a staged set into the app, convert it, and clear the staging dir."""
    outstanding = missing_blocks(blocks, staging)
    if len(outstanding) == len(blocks):
        print('\nNothing staged — there is nothing to promote.')
        print(f'Generate a batch first:  {command_hint(os.environ, "generate")} {args.set_file}')
        sys.exit(0)

    if args.replace:
        # Replacing deletes before it copies, block by block over the whole set,
        # so a partial batch would leave the events it has nothing for silent.
        if outstanding:
            print(f'\nRefusing to replace: {len(outstanding)} of {len(blocks)} clip(s) still missing.')
            print('Replacing removes the promoted takes first — a partial batch would leave events with none.')
            for block in outstanding[:10]:
                print(f'  missing: {block["path"]}')
            if len(outstanding) > 10:
                print(f'  ... and {len(outstanding) - 10} more')
            print(f'\nAdd them beside what is there instead:  {command_hint(os.environ, "promote")} {args.set_file}')
            sys.exit(1)

        doomed = promoted_takes(blocks, DEFAULT_OUTPUT_DIR)
        question = f'\nDelete {len(doomed)} promoted take(s) of this set and replace them with the staged batch?'
        if doomed and not confirm(question, args.yes):
            print('Left as it is.')
            sys.exit(1)
        sources, normalized = clear_promoted_set(blocks, DEFAULT_OUTPUT_DIR)
        print(f'\nRemoved {len(sources)} promoted take(s) and {len(normalized)} normalized copy(ies).')
    else:
        if outstanding and not set_fully_promoted(blocks, DEFAULT_OUTPUT_DIR):
            print(f'\nRefusing to promote: {len(outstanding)} of {len(blocks)} clip(s) still missing.')
            print('Generate the rest first — promoting now would leave the bank half-updated.')
            for block in outstanding[:10]:
                print(f'  missing: {block["path"]}')
            if len(outstanding) > 10:
                print(f'  ... and {len(outstanding) - 10} more')
            sys.exit(1)
        if outstanding:
            print(f'\nPartial batch — {len(blocks) - len(outstanding)} of {len(blocks)} staged.')
            print('Every event already has a take of this set, so promoting these as extras.')

    copied, skipped = promote_staging(staging, DEFAULT_OUTPUT_DIR)
    print(f'\nPromoted {len(copied)} clip(s) into {DEFAULT_OUTPUT_DIR}')
    if skipped:
        print(f'{len(skipped)} already present and identical — skipped')
    renamed = [name for name in copied if not name.endswith('-1.wav')]
    if renamed:
        print(f'{len(renamed)} landed beside an existing take as an alternative:')
        for name in renamed[:5]:
            print(f'  {name}')
        if len(renamed) > 5:
            print(f'  ... and {len(renamed) - 5} more')

    if args.skip_normalize:
        print(f'\nNot converted. Run {normalize_hint(os.environ)} to convert them and refresh the manifest.')
        if args.replace:
            print('Until then the manifest still lists the takes just deleted, and the app will 404 on them.')
    else:
        print()
        if not normalize([os.path.join(DEFAULT_OUTPUT_DIR, name) for name in copied]):
            print('\nNormalization failed — leaving staging in place so nothing is lost.')
            sys.exit(1)

    if args.keep_staging:
        print(f'\nStaging kept at {staging}')
    else:
        shutil.rmtree(staging, ignore_errors=True)
        print(f'\nCleared staging: {staging}')


def run_generation(args, blocks, staging):
    """generate: fill in what is missing. regenerate: do the lot again, over take -1.

    `--fresh` turns the second into a true restart by throwing the staged batch
    away first — the difference being whether takes from a previous, longer batch
    (-2, -3, ...) survive.
    """
    overwrite = args.command == 'regenerate'
    base_output_dir = os.path.expanduser(args.output_dir) if args.output_dir else staging

    if getattr(args, 'fresh', False):
        if args.output_dir:
            print('\nError: --fresh clears the staged set; it will not delete an output directory you named yourself.')
            sys.exit(1)
        staged = len(wav_files(staging))
        if not staged:
            print('\nNothing staged yet — generating the set from scratch.')
        else:
            if not confirm(f'\nDelete {staged} staged clip(s) in {staging} and start over?', args.yes):
                print('Left as it is.')
                sys.exit(1)
            try:
                print(f'Discarded {discard_staged_set(staging)} staged clip(s).')
            except ValueError as e:
                print(f'Error: {e}')
                sys.exit(1)

    print(f'Output directory: {base_output_dir}')

    selected = select_blocks(blocks, only=args.only, limit=args.limit)

    already = len(blocks) - len(missing_blocks(blocks, base_output_dir))
    if not overwrite:
        selected = missing_blocks(selected, base_output_dir)

    print(f'Already generated: {already}/{len(blocks)}')
    print(f'Selected {len(selected)} block(s) to process\n')

    if not selected:
        if already == len(blocks):
            print('This set is complete — nothing to generate.')
            print(f'Listen to it:  {command_hint(os.environ, "audition")} {args.set_file}')
            print(f'Promote it:    {command_hint(os.environ, "promote")} {args.set_file}')
        else:
            print('Nothing to do for this selection.')
            print(f'Redo clips that already exist:  {command_hint(os.environ, "regenerate")} {args.set_file}')
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

    def report(done):
        """Close out a run — however it ended.

        There is no resume hint: a re-run skips whatever is already on disk, so
        picking up where this left off is just the same command again. The old
        hint named `--only <path>`, which is a prefix filter rather than a
        starting point — following it would have regenerated that one clip and
        called the set done.
        """
        print('\nAPI keys:')
        for line in pool.summary_lines():
            print(line)
        if pool.all_exhausted():
            print(f'\nALL {len(api_keys)} KEY(S) HAVE REACHED THEIR QUOTA.')
            print(f'Free-tier quota resets {quota_reset_notice()}.')
        print(f'\nGenerated {done} of {len(selected)} block(s).')
        if skipped_blocks:
            print(f'{len(skipped_blocks)} block(s) skipped after repeated failures:')
            for path in skipped_blocks:
                print(f'  {path}')

    done = 0
    skipped_blocks = []
    produced = []
    # Blocks still to generate. Running out of quota does not end the run any
    # more — it parks whatever is left here and offers to wait for the reset.
    pending = list(selected)
    try:
        while pending:
            queue, pending, exhausted = pending, [], False

            for i, block in enumerate(queue, 1):
                position = len(selected) - len(queue) + i
                print(f'[{position}/{len(selected)}] Processing: {block["text"][:50]}...')
                print(f'  Path: {block["path"]}')

                # Try the block on each live key in turn before giving up on it.
                failures = 0
                request_finished = None
                while True:
                    key = pool.next_key()
                    if key is None:
                        exhausted = True
                        break
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
                        written = generate_clip(clients[key], block, base_output_dir, overwrite=overwrite)
                        request_finished = time.monotonic()
                        done += 1
                        if written:
                            produced.append(written)
                            if args.audition == 'each':
                                audition([written])
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
                            exhausted = True
                            break

                        # With one key left there is nobody to hand the block to, so
                        # waiting out the limit is the only way forward.
                        if len(pool.active()) == 1 and not retired:
                            print(f'  Waiting {limited.retry_seconds:.0f}s before retrying...')
                            time.sleep(limited.retry_seconds)
                        else:
                            print(f'  Handing this block to another key...')

                # This block never got generated, so it goes back at the head of
                # the queue along with everything after it.
                if exhausted:
                    pending = queue[i - 1:]
                    break
                print()

                # Each key has its own per-minute budget, so the wait shrinks with
                # the number of live keys — three keys means a third of the spacing.
                if i < len(queue):
                    spacing = args.delay / max(1, len(pool.active()))
                    # Whatever happened since the request came back — auditioning,
                    # most of all — was spent on the same clock the spacing meters.
                    if request_finished is not None:
                        spacing = max(0, spacing - (time.monotonic() - request_finished))
                    if spacing:
                        print(f'  Waiting {spacing:.0f}s ({len(pool.active())} key(s) live)...')
                        time.sleep(spacing)
                        print()

            if not exhausted:
                break

            # Out of quota with work left. Report where the run stands, then
            # offer to sit out the reset rather than making the user come back
            # and reissue the command at midnight Pacific themselves.
            report(done)
            if not wait_for_quota_reset():
                sys.exit(1)
            pool.revive()

        print('\nAll done!')
        report(done)
        if args.audition == 'end':
            audition(produced)
        if not missing_blocks(blocks, base_output_dir):
            print(f'\nThis set is complete.')
            print(f'Listen to it:  {command_hint(os.environ, "audition")} {args.set_file}')
            print(f'Promote it:    {command_hint(os.environ, "promote")} {args.set_file}')
    except KeyboardInterrupt:
        print('\n\nInterrupted by user.')
        report(done)
        sys.exit(0)


def main(args):
    try:
        set_path = resolve_set_file(args.set_file)
        defaults, blocks = parse_set_file(set_path)
    except ValueError as e:
        print(f'Error: {e}')
        sys.exit(1)

    staging = staging_dir_for(set_path)
    print(f'Set: {set_path} ({len(blocks)} blocks, voice: {defaults.get("voice")})')

    if args.command == 'promote':
        run_promote(args, blocks, staging)
    elif args.command == 'audition':
        run_audition(args, blocks, staging)
    else:
        run_generation(args, blocks, staging)


if __name__ == '__main__':
    main(build_arg_parser().parse_args())
