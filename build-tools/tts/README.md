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

## Tests

```bash
uv run pytest
```

Covers the set-file parser, prompt composition, filename rules, block selection,
key collection, and that both shipped sets stay in sync with each other.

## Related

- [`sound-prompts/README.md`](../../sound-prompts/README.md) — set-file format and the escalation ladder
- [`../generate-sound-manifest.js`](../generate-sound-manifest.js) — turns generated files into the manifest the app reads
