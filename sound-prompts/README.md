# Sound prompt sets

The text Tymer speaks, versioned alongside the app that plays it.

Each `*.txt` file here is one complete **set**: a single voice, a single
character, and one block per sound event. Regenerating a set reproduces the
whole sound bank; adding a second set (different voice, different language)
means adding another file, not editing this one.

| File                         | Voice                         | Covers                                                                                                                                                                        |
| ---------------------------- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tymer-gacrux.txt`           | Gacrux (mature, middle pitch) | all 40 speech events                                                                                                                                                          |
| `tymer-gacrux-brisk.txt`     | Gacrux                        | same 40, same words, delivered fast                                                                                                                                           |
| `tymer-kore-strict.txt`      | Kore                          | same 40, reworded, harsher overtime ladder                                                                                                                                    |
| `tymer-laomedeia-diva.txt`   | Laomedeia                     | same 40, telenovela diva — Spanish-seasoned English, volcanic top of the ladder                                                                                               |
| `tymer-despina-tube.txt`     | Despina                       | same 40, London Underground announcer — RP, tannoy PA style, escalating attention-openers                                                                                     |
| `tymer-despina-tube-alt.txt` | Despina                       | alternative takes for the SAME `tube` set — reworded, breath-length pauses, longer deadpan boundary calls                                                                     |
| `tymer-erinome-nasa.txt`     | Erinome                       | same 40, mission-control flight controller — cold procedural voice-loop, alert-level ladder; Apollo radio distortion applied at conversion (`build-tools/audio-presets.conf`) |
| `tymer-iapetus-nasa.txt`     | Iapetus                       | alternative takes for the SAME `nasa` set — reworded, lower voice, same alert ladder verbatim                                                                                 |

All sets land in the same event directories, so they merge as interchangeable
takes. Each carries a distinct `@name` (`gacrux`, `brisk`, `strict`, `diva`, `tube`, `nasa`) so
filenames never collide. The deliberate exceptions are the two `-alt` files:
`tymer-despina-tube-alt.txt` shares `@name tube` and `tymer-iapetus-nasa.txt`
shares `@name nasa`, so their clips promote as extra takes of the existing set
(`tube-2.wav`, `nasa-2.wav`, …) instead of forming a new voice. Because the pair
shares the stem, `promote --replace` of either one clears the promoted takes of
both — promote the alt file additively. A per-set filter preset is keyed by the
same set name, so the alt file inherits it with no config change (`nasa` →
`apollo`).

**`@name` is required.** It is not just collision avoidance — the app derives the
voice set from the filename stem (minus the trailing `-N` take suffix), so
`@name` is what lets the user pick that set alone in the top-left switcher. A set
without one gets text-derived filenames and every clip becomes its own pseudo-set;
`src/lib/sounds.test.js` fails on that rather than shipping it.

## The 40 events — what each one is for

Every set speaks the same 40 events. The wording is the set's own; the _job_ of
each event is fixed and voice-independent. Minute counts are the payload and must
survive every rewording, spoken in the set's idiom but instantly parseable.

(The break banks and the deadline warnings are the newest events: the app-side
scheduling is in place, but their takes are still being generated set by set —
until a set's takes are promoted, those seven keys fall back to the voices that
already have them.)

### `elapsed/006–108` (10) — work progress markers

Fire during **work** periods only (fun counts as work — it is work-shaped, just
unpaid). Neutral, quietly encouraging progress marks at 6, 12, 24, 36, 48, 60,
72, 84, 96, 108 minutes; only the first half of a period gets them. `060` is the
one small ceremony — a full hour, worth a warmer beat.

### `remaining/006–024` (3) — work wind-down

Second half of a work period: 24 = start wrapping up, 12 = home stretch, 6 =
quiet final notice, close and confidential. Forward lean, never pressure — the
overtime ladder handles pressure.

### `elapsed/break/006–012` (2) — break check-ins

A different job than the work markers: **verification, not progress**. The
listener sets a break, then remembers one more thing and keeps working — these
check that the break is actually being taken. Gently teasing, "you did stop
working… didn't you?" at 6, a more knowing second nudge at 12. Never scolding;
the listener being caught working is treated with affection.

### `remaining/break/006–012` (2) — break wind-down

Softer than the work versions — a break needs easing out of, not wrapping up.
12 = "no rush yet" reassurance (the scheduler only plays it on breaks of 48
minutes and up), 6 = "start drifting back". No pressure anywhere; pressure
during rest defeats the rest.

### `deadline/006, 012, 060` (3) — wall-clock deadline warnings

Countdown to the **nearest upcoming deadline** — wall-clock commitments
independent of the periods, and there can be several, so the wording must say
"next" or "nearest", never "the deadline". A different flavor of urgency than
overtime: the deadline is fate, not misbehavior — informative and pressing,
never angry. 60 = planning horizon, 12 = bring it together, 6 = conclude now.

### `overtime/006–048` (8) and `overtime/break/006–048` (8) — the escalation ladder

The same information delivered with less patience each rung — see
[the escalation ladder](#the-escalation-ladder) below. The break flavor pushes
back **toward** work ("the break is over") where the work flavor pushes work to
**stop**.

### `timesup/work|break|fun|finish` (4) — period boundaries

The boundary itself, named for what comes **next**: a rousing call to start
working, warm permission to break, bright send-off to fun, and a settled
end-of-day close for finish.

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
for setup, the three generation modes, and quota details. A bare set name
resolves against this directory; clips stage under `.staging/<set>/` until you
promote them.

```bash
cd build-tools/tts

# preview every composed prompt — no API calls, no key needed
uv run sounds.py generate tymer-gacrux --dry-run

# fill in whatever is still missing; re-run daily until the set is complete
uv run sounds.py generate tymer-gacrux

# redo one branch after editing its prompts
uv run sounds.py regenerate tymer-gacrux --only overtime/
```

Then listen to it, and promote — which converts what it copied to the `.webm`
files the app actually loads and refreshes the manifest:

```bash
uv run sounds.py audition tymer-gacrux
uv run sounds.py promote tymer-gacrux
```

To convert the whole bank by hand instead:

```bash
cd ../.. && ./normalize_audio.sh
```

That also regenerates `src/lib/sound-manifest.js`, so new takes become playable
without a further step.

Free-tier quota is 10 requests/day per account against 40 clips per set,
so add keys from other Google accounts to generate more in one day — the tool
switches keys automatically when one runs dry.

## The escalation ladder

`overtime/` and `overtime/break/` are deliberately staged — the same event at a
later minute is the same information delivered with less patience:

| Minutes over | Style                          | Pace                    |
| ------------ | ------------------------------ | ----------------------- |
| 6            | warm, offering                 | unhurried               |
| 12           | matter-of-fact                 | steady                  |
| 18           | firmer, polite                 | slightly clipped        |
| 24           | insistent                      | brisk                   |
| 30           | stern, disappointed            | deliberate              |
| 36           | urgent, commanding             | fast, forceful          |
| 42           | sharp, absolute                | clipped, staccato       |
| 48           | maximum urgency, pressing hard | driving, never releases |

48 is the top of the ladder: insistent rather than cold. An earlier take played
it quiet, flat and slowed-down — the intended menace read as merely slow, so it
was rewritten to keep pushing instead.

## Not speech

`button`, `timer-end` and `notifications/*` are tones, not spoken lines — they
are not in any set and are not regenerated.
