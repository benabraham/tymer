# Tymer TTS generator

Turns the prompt sets in [`sound-prompts/`](../../sound-prompts/) into spoken
audio using Google's `gemini-3.1-flash-tts-preview`.

Vendored here so Tymer can regenerate its own sounds from a fresh clone — the
words and the tool that speaks them stay together.

## Setup

```bash
cd build-tools/tts
uv sync
cp .env.example .env # then add your key(s)
```

Get a key at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

## Use

A set is 40 clips and the free tier meters them per key per day, so generating
one can span several days — how many depends on how many keys you have, see
[Quota](#quota). The tool is built around that: clips accumulate in a **staging
directory** per set, a run generates only what is **still missing**, and nothing
reaches the app until you have listened to it and promoted it.

```bash
cd build-tools/tts

# 1. preview — no API calls, no key needed
uv run sounds.py generate tymer-gacrux-brisk --dry-run

# 2. generate. Re-run daily; it picks up where it left off.
uv run sounds.py generate tymer-gacrux-brisk

# 3. listen to what came back
uv run sounds.py audition tymer-gacrux-brisk

# 4. move it into the app — converts and refreshes the manifest, then clears staging
uv run sounds.py promote tymer-gacrux-brisk
```

Step 2 reports `Already generated: 12/40` and stops early with _"This set is
complete — nothing to generate"_ rather than spending quota re-doing work.

### From the repo root, without the `cd`

Every path the tool uses — `sound-prompts/`, `.env`, `.staging/`, the output
tree — resolves against the script rather than the working directory, so it runs
the same from anywhere. Only `uv` needs telling where the project is:

```bash
pnpm run sounds:generate tymer-gacrux-brisk --dry-run # flags pass through, no `--` needed
pnpm run sounds:promote tymer-gacrux-brisk
pnpm run sounds regenerate tymer-gacrux-brisk --fresh # subcommands without their own script
uv run --directory build-tools/tts sounds.py generate tymer-gacrux-brisk
```

The hints the tool prints back (`Promote it: …`, `Listen to it: …`) adapt to how
it was launched, so they stay copy-pasteable. Both launchers `cd` into
`build-tools/tts` before running, so `os.getcwd()` is no help — the shell's real
directory comes from `INIT_CWD`, which pnpm exports and `uv` does not. A bare
`uv run --directory` from the root is therefore indistinguishable from a real
`cd` and gets the `cd`-relative hint.

### `sounds`, with tab completion

The dev shell puts a `sounds` command on PATH, so inside the repo there is no
`uv run` or `pnpm run` to type — and `<TAB>` completes subcommands, the set names
actually in `sound-prompts/`, and the flags belonging to that particular
subcommand (`--fresh` only after `regenerate`, `--replace` only after `promote`),
plus values for `--audition` and `--only`.

```bash
cd tymer                # direnv loads the shell
sounds gen<TAB> tymer-<TAB> --<TAB>
```

Nothing to install: `.envrc` is `use flake`, and `flake.nix` builds a small
derivation carrying both halves.

**Why the packaging shape matters.** direnv replays environment _variables_; it
cannot export a shell function or a `complete` registration, so sourcing this
file from `.envrc` would define everything in a subshell and lose it. What
direnv can do is put a directory on PATH — and bash-completion's dynamic loader
(`complete -D`) resolves an unknown command by deriving
`<prefix>/share/bash-completion/completions/<cmd>` from each PATH entry ending in
`/bin`. So a derivation with `bin/sounds` _and_
`share/bash-completion/completions/sounds` gets its completion sourced into the
interactive shell on the first `<TAB>`, with no shell config anywhere.

Both installed halves are stubs pointing back at the checkout through
`TYMER_ROOT` (exported by the shell hook), so editing `sounds.py` or this
completion takes effect immediately — no flake rebuild, no direnv reload.

**Without direnv**, source it from a shell rc instead:

```bash
source ~/code/tymer/build-tools/tts/completions/sounds.bash
```

That defines `sounds` as a shell function, resolving the repo from the file's own
location. It is skipped when a real `sounds` is already on PATH — a function
would shadow the dev shell's command silently, and with the wrong tool directory.

Either way the launcher exports `TYMER_SOUNDS_LAUNCHER`, so the printed hints say
`sounds promote …` rather than naming a command you never typed. Set names come
from globbing `sound-prompts/`, not from asking the tool — a Python start-up per
keypress is not what `<TAB>` should cost. Bash only; zsh would need
`bashcompinit`.

## The three ways to generate

They differ only in what they consider already done.

| Command                    | What it does                                                | Use it when                                   |
| -------------------------- | ----------------------------------------------------------- | --------------------------------------------- |
| `generate <set>`           | Generates the clips with no file yet; leaves the rest alone | Every day, until the set is complete          |
| `regenerate <set>`         | Generates every clip again, over this set's take `-1`       | The prompts changed and you want new readings |
| `regenerate <set> --fresh` | Deletes the staged set, then generates all of it            | A previous batch left takes you want gone     |

The difference between the last two is what survives: `regenerate` overwrites
take `-1` and leaves a `brisk-2.wav` from an earlier, longer batch in place;
`--fresh` starts from an empty directory, so nothing does. `--fresh` asks before
deleting (`--yes` skips the question), refuses to run unattended without it, and
only ever clears a set under `.staging/` — never an output directory you named
yourself, which could just as easily be the whole promoted bank.

### Hearing them

`--audition each` plays every clip in mpv as it arrives; `--audition end` plays
the whole run as one mpv playlist when it finishes. Time spent listening counts
toward the inter-request spacing, so auditioning a run costs no extra wall clock.

```bash
uv run sounds.py generate tymer-gacrux-brisk --audition each
uv run sounds.py audition tymer-gacrux-brisk --only overtime/
```

`audition` on its own replays whatever is staged, which is the manual check
before promoting. A missing mpv is a note, never a failure.

## The two ways to promote

```bash
uv run sounds.py promote tymer-gacrux-brisk           # add as alternatives
uv run sounds.py promote tymer-gacrux-brisk --replace # this batch IS the set
```

**Default — add.** Clips land **beside** what is already there as extra takes —
`brisk-1.wav`, `brisk-2.wav` — which is exactly what the app picks between at
random. Nothing is overwritten. Re-promoting an unchanged set is a no-op (a clip
identical to _any_ existing take of the set is skipped, even if an earlier
promote renamed it), so it is safe to repeat. It refuses while any event would
end up with no take of this set at all — neither staged nor already promoted —
so the app never plays a half-updated bank. Otherwise a partial staging is
purely additive and promotes without waiting for the rest: events new to the
set land as first takes, already-promoted events gain extras.

**`--replace`.** Every promoted take of this set is deleted first, so the staged
batch is the whole of it — the way to drop takes rather than accumulate them. It
asks first (`--yes` skips), and requires a complete staging with no relaxed
partial case: it deletes before it copies, so a partial batch would leave events
with nothing. Other voices sharing an event directory are matched by stem and
never touched.

Deleting a take also deletes its `.webm` under `public/sounds/`.
`generate-sound-manifest.js` scans that directory, so an orphan left there is not
merely stale — it stays in `SOUND_VARIANTS` and the app keeps playing a take
whose source no longer exists.

**Either way**, promote then converts **only the clips it copied** to `.webm`,
regenerates `src/lib/sound-manifest.js`, and deletes the staging directory. A
failed conversion leaves staging in place so nothing is lost.

| Flag               | Effect                                                                           |
| ------------------ | -------------------------------------------------------------------------------- |
| `--skip-normalize` | Do not convert or refresh the manifest — do it later with `./normalize_audio.sh` |
| `--keep-staging`   | Leave the staged clips where they are                                            |

## Flags shared by generate and regenerate

| Flag                        | Effect                                                               |
| --------------------------- | -------------------------------------------------------------------- |
| `--dry-run`                 | Print target paths and composed prompts; no API calls, no key needed |
| `--audition {off,each,end}` | Play clips in mpv per clip, or all at the end                        |
| `--only PREFIX`             | Restrict to blocks whose path starts with PREFIX                     |
| `--limit N`                 | Stop after N blocks                                                  |
| `--delay SECONDS`           | Spacing between requests (default 60)                                |

Pass an explicit output directory to bypass staging entirely.

`normalize_audio.sh` takes the same paths promote hands it — files or
directories inside `src/assets/sounds/` — and converts the whole bank when given
none. It regenerates the manifest either way.

## Quota

The free tier allows **10 requests/day per account for this model** (the 429's
`QuotaFailure` reports `quotaValue: 10` for `gemini-3.1-flash-tts`) plus a
per-minute burst limit, and a set is 40 clips — so one key cannot do a whole
set in one day.

Two things soften that:

- **Several keys.** `GEMINI_API_KEYS` takes a list of any length. Quota is per
  Cloud project, so keys from _different Google accounts_ have separate daily
  **and** per-minute budgets — two keys in one project share a budget and buy
  nothing.
- **`--delay 60` by default, divided by the number of live keys.** A 429 spends
  from the same per-minute budget as a real request, so tight spacing turns one
  retry into a cascade. With three keys the actual spacing is 20s, because each
  project is only being asked once a minute.

Requests go round-robin across the live keys. A key is **retired for the rest of
the run** after 3 rate limits, or immediately if the API reports its daily quota
spent — retirement is announced as it happens. Every run ends with a per-key
summary of requests, rate limits, and why any key was dropped.

When every key is out, the run says when the quota comes back **in local time
and as a countdown** — midnight Pacific is a useless thing to read off a clock
in another timezone — and offers to wait for it:

```
ALL 3 KEY(S) HAVE REACHED THEIR QUOTA.
Free-tier quota resets at 09:00 local time — in 1h 20m.

Wait 1h 20m and retry at 09:05 local time? [Y/n]
```

Answering yes (the default) sleeps until 5 minutes past the reset — the boundary
is Google's clock, not ours — then revives every key and picks up at the block
that was in flight, so nothing already generated is redone. Answering no exits
non-zero, as it always did; nothing needs noting down either way, since the same
command later generates whatever is still missing. The offer is skipped when
stdin is not a terminal, so unattended runs still fail fast.

### How many keys are there right now

Not written down here — a number in a README is one edit away from being a lie,
and this one has already been wrong. Ask the tool. Every real run opens with the
count it is about to round-robin over:

```
Using <N> API key(s), round-robin
```

`--dry-run` and an already-complete set both exit before the pool is built, so
neither prints it. To ask without starting a run:

```bash
uv run --directory build-tools/tts python -c \
    'import os, sounds; print(len(sounds.load_api_keys(os.environ)))'
```

**Counting `.env` by eye is how you get it wrong.** `load_api_keys` splits
`GEMINI_API_KEYS` on commas, newlines _and_ whitespace, appends
`GEMINI_API_KEY`, then drops blanks and duplicates — and not every key is an
`AIza…` string, so grepping for that prefix silently undercounts.

From that count the rest follows: `keys × 10` clips a day, so a 40-clip set takes
`ceil(40 / (keys × 10))` days — four or more and it fits in a single run.

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
