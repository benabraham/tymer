# Tymer TTS generator

Turns the prompt sets in [`sound-prompts/`](../../sound-prompts/) into spoken
audio using Google's `gemini-3.1-flash-tts-preview`.

Vendored here so Tymer can regenerate its own sounds from a fresh clone — the
words and the tool that speaks them stay together.

## Setup

```bash
cd build-tools/tts
uv sync
cp .env.example .env      # then add your key(s)
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Use

A set is 36 clips and free-tier quota is ~15/day, so generating one is a
multi-day job. The tool is built around that: clips accumulate in a **staging
directory** per set, each run generates only what is **still missing**, and
nothing reaches the app until the set is complete and you promote it.

```bash
cd build-tools/tts

# 1. preview — no API calls, no key needed
uv run generate_audio.py tymer-gacrux-brisk --dry-run

# 2. generate. Re-run daily; it picks up where it left off.
uv run generate_audio.py tymer-gacrux-brisk

# 3. once complete, move it into the app
uv run generate_audio.py tymer-gacrux-brisk --promote
cd ../.. && ./normalize_audio.sh
```

### From the repo root, without the `cd`

Every path the tool uses — `sound-prompts/`, `.env`, `.staging/`, the output
tree — resolves against the script rather than the working directory, so it runs
the same from anywhere. Only `uv` needs telling where the project is:

```bash
pnpm run sounds:generate tymer-gacrux-brisk --dry-run    # flags pass through, no `--` needed
uv run --directory build-tools/tts generate_audio.py tymer-gacrux-brisk
```

The hints the tool prints back (`Promote it with: …`, `Run … to convert them`)
adapt to how it was launched, so they stay copy-pasteable. Both launchers `cd`
into `build-tools/tts` before running, so `os.getcwd()` is no help — the shell's
real directory comes from `INIT_CWD`, which pnpm exports and `uv` does not. A
bare `uv run --directory` from the root is therefore indistinguishable from a
real `cd` and gets the `cd`-relative hint.

Step 2 reports `Already generated: 12/36` and stops early with *"This set is
complete — nothing to generate"* rather than spending quota re-doing work.
Step 3 refuses to run while anything is missing, so the app never plays a
half-updated bank.

`normalize_audio.sh` produces the `.webm` files the app loads and regenerates
`src/lib/sound-manifest.js`.

### Several sets become random alternatives

Promote a second set into the same tree and its clips land **beside** the first
as extra takes — `brisk-1.wav`, `brisk-2.wav` — which is exactly what the app
picks between at random. Nothing is overwritten. Re-promoting an unchanged set
is a no-op, so it is safe to repeat.

```bash
uv run generate_audio.py tymer-gacrux --promote     # merges with what's there
```

| Flag | Effect |
| --- | --- |
| `--dry-run` | Print target paths and composed prompts; no API calls, no key needed |
| `--promote` | Copy the completed staged set into `src/assets/sounds/`, renaming around existing takes |
| `--regenerate` | Also redo clips that already exist (default: only missing ones) |
| `--overwrite` | Replace this set's own previous takes rather than adding `-2`, `-3` |
| `--only PREFIX` | Restrict to blocks whose path starts with PREFIX |
| `--limit N` | Stop after N blocks |
| `--delay SECONDS` | Spacing between requests (default 60) |

Pass an explicit output directory to bypass staging entirely.

## Quota

The free tier allows roughly **15 requests/day and 3/minute per account**, and a
set is 36 clips — so one key cannot do a whole set in one day.

Two things soften that:

- **Several keys.** `GEMINI_API_KEYS` takes a list of any length. Quota is per
  Cloud project, so keys from *different Google accounts* have separate daily
  **and** per-minute budgets — two keys in one project share a budget and buy
  nothing.
- **`--delay 60` by default, divided by the number of live keys.** A 429 spends
  from the same per-minute budget as a real request, so tight spacing turns one
  retry into a cascade. With three keys the actual spacing is 20s, because each
  project is only being asked once a minute.

Requests go round-robin across the live keys. A key is **retired for the rest of
the run** after 3 rate limits, or immediately if the API reports its daily quota
spent — retirement is announced as it happens. Every run ends with a per-key
summary of requests, rate limits, and why any key was dropped; if they all run
out the run stops there and prints the `--only` path to resume from.

| Keys | Clips/day | 36-clip set |
| --- | --- | --- |
| 1 | ~15 | 3 days |
| 3 | ~45 | one ~12-minute run |

## When it isn't the quota

A rate limit is not the only way a request fails to come back, and the other ways
share a property: they say nothing about the key. They raise `Transient`, which
costs **no strike** and retires nothing, and the block is retried on the next key
up to `MAX_TRANSIENT_ATTEMPTS` (3). After that the block is announced, skipped,
and the run moves on — a plain re-run picks it up like any other missing clip.

`google-genai` defaults leave two holes that both had to be closed explicitly.

**No timeout.** The client is built with `timeout=None` unless `HttpOptions` says
otherwise, and that `None` reaches the streaming `send()`. Audio arrives as a
stream of small chunks, and that stream can simply stop — no error, no close,
nothing — so an unconfigured client waits on a dead socket forever. One such
stall burned 31 minutes of a run that was averaging 25s a clip.

- **`CHUNK_TIMEOUT_SECONDS` (90)** — the gap between chunks, applied per socket
  operation. Not a cap on how long a clip may take, so it never cuts a
  long-but-healthy generation short.
- **`STREAM_DEADLINE_SECONDS` (180)** — the whole response, checked as chunks
  arrive. A stream that trickles indefinitely never trips the per-chunk limit.

**No retries.** `HttpOptions.retry_options` defaults to `None`, which the SDK
resolves to `stop_after_attempt(1)` — the retry machinery is present but disabled.
A single `503 UNAVAILABLE` ("this model is currently experiencing high demand")
was therefore a first-and-only try, and it crashed a run at block 4 of 21.
`SERVER_RETRY_ATTEMPTS` (3) turns it on with exponential backoff so a short
capacity blip is absorbed in place.

`SERVER_RETRY_STATUS_CODES` is `408, 500, 502, 503, 504`. The SDK's own default
list also includes **429, which is deliberately dropped** — a rate limit is the
KeyPool's business, it spends from the same per-minute budget as a real request,
and retrying it inside the client is exactly the storm that the
one-request-per-minute spacing exists to prevent.

A 5xx that outlives those retries still reaches the loop as a `Transient`, this
time carrying `SERVER_BUSY_BACKOFF_SECONDS` (30). Another key does not help
there — it is the same overloaded model — so it waits before asking again.

## Tests

```bash
uv run pytest
```

Covers the set-file parser, prompt composition, filename rules, block selection,
key collection, and that both shipped sets stay in sync with each other.

## Related

- [`sound-prompts/README.md`](../../sound-prompts/README.md) — set-file format and the escalation ladder
- [`../generate-sound-manifest.js`](../generate-sound-manifest.js) — turns generated files into the manifest the app reads
