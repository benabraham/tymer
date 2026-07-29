# Sound prompt sets

The text Tymer speaks, versioned alongside the app that plays it.

Each `*.txt` file here is one complete **set**: a single voice, a single
character, and one block per sound event. Regenerating a set reproduces the
whole sound bank; adding a second set (different voice, different language)
means adding another file, not editing this one.

| File | Voice | Covers |
| --- | --- | --- |
| `tymer-gacrux.txt` | Gacrux (mature, middle pitch) | all 36 speech events |
| `tymer-gacrux-brisk.txt` | Gacrux | same 36, same words, delivered fast |
| `tymer-kore-strict.txt` | Kore | same 36, reworded, harsher overtime ladder |

All three land in the same event directories, so they merge as interchangeable
takes. Each carries a distinct `@name` (`brisk`, `strict`) so filenames never
collide.

## Format

```
@voice Gacrux                 # file-level defaults, apply to every block
@profile Tymer — the timekeeper
@scene
A quiet home workspace in the late afternoon.
@style Warm, measured
@pace Unhurried
@accent Neutral international English
@context The timekeeper marks the passage of a period out loud.

[overtime/024]                # block path = output directory
@style Insistent              # overrides the file-level value for this block
@pace Brisk, pressing
@text [insistent] You are now twenty-four minutes over the scheduled time.
```

Directives: `@voice` `@profile` `@scene` `@style` `@pace` `@accent` `@context`
`@text` `@name`. `@voice` is required at file level, `@text` in every block; the
rest are optional. Values may span multiple lines, ending at the next line that
starts with `@` or `[`. Lines starting with `#` are comments.

Square-bracket tags inside `@text` are **delivery directions, not spoken words** —
`[gently]`, `[coldly]`, `[commanding]`. The vocabulary is open; the model
interprets them in context.

These fields map onto the structured prompt the TTS model expects
(`# AUDIO PROFILE` / `## THE SCENE` / `### DIRECTOR'S NOTES` / `### SAMPLE CONTEXT` /
`#### TRANSCRIPT`). The `#### TRANSCRIPT` divider is what stops the model from
reading the scene description aloud.

## Multiple takes per event

Repeat a block path to add alternative takes. Each lands as its own file in that
directory, and Tymer picks one at random at playback time:

```
sounds/overtime/024/you-are-now-twenty-four-minutes-over-1.wav
sounds/overtime/024/thats-twenty-four-minutes-past-1.wav
```

One take per event is a valid set — the directory layout simply allows more
later without any code change.

## Regenerating

The generator lives in [`build-tools/tts/`](../build-tools/tts/) — see its README
for setup and quota details. A bare set name resolves against this directory and
output defaults to `src/assets/sounds/`.

```bash
cd build-tools/tts

# preview every composed prompt — no API calls, no key needed
uv run generate_audio.py tymer-gacrux --dry-run

# generate the whole set
uv run generate_audio.py tymer-gacrux --overwrite

# regenerate just one branch
uv run generate_audio.py tymer-gacrux --overwrite --only overtime/
```

Then normalize and convert to the `.webm` files the app actually loads:

```bash
cd ../.. && ./normalize_audio.sh
```

That also regenerates `src/lib/sound-manifest.js`, so new takes become playable
without a further step.

Free-tier quota is roughly 15 requests/day per account against 36 clips per set,
so add keys from other Google accounts to generate more in one day — the tool
switches keys automatically when one runs dry.

## The escalation ladder

`overtime/` and `overtime/break/` are deliberately staged — the same event at a
later minute is the same information delivered with less patience:

| Minutes over | Style | Pace |
| --- | --- | --- |
| 6 | warm, offering | unhurried |
| 12 | matter-of-fact | steady |
| 18 | firmer, polite | slightly clipped |
| 24 | insistent | brisk |
| 30 | stern, disappointed | deliberate |
| 36 | urgent, commanding | fast, forceful |
| 42 | sharp, absolute | clipped, staccato |
| 48 | maximum urgency, pressing hard | driving, never releases |

48 is the top of the ladder: insistent rather than cold. An earlier take played
it quiet, flat and slowed-down — the intended menace read as merely slow, so it
was rewritten to keep pushing instead.

## Not speech

`button`, `timer-end` and `notifications/*` are tones, not spoken lines — they
are not in any set and are not regenerated.
