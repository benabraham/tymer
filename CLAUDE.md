# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skills & Rules

- `.claude/rules/preact.md` — enforceable Preact + signals rules; always follow when editing `src/**/*.{js,jsx}`
- `.claude/rules/debugging.md` — reproduce reported bugs through the real UI control path before diagnosing
- `.claude/skills/tymer-preact/SKILL.md` — full rationale and Tymer-specific signals examples; load via the Skill tool when depth is needed

## Project Overview

This is a countdown timer web application built with Preact and Vite called "Tymer". It's a Pomodoro-style timer that supports multiple periods with customizable durations and automatic time tracking persistence via localStorage.

## Development Commands

- `pnpm run dev` - Start development server (Vite) on port 5050
- `pnpm run build` - Build for production to `dist/` folder
- `pnpm run preview` - Preview production build
- `pnpm test` - Run tests with Vitest
- `pnpm run test:coverage` - Run tests with coverage report
- `pnpm run format` - Format code with Prettier
- `pnpm run format:check` - Check code formatting

## Architecture

### Core Libraries

- **Preact**: React-like UI library (smaller than React)
- **@preact/signals**: State management with reactive signals
- **Vite**: Build tool and development server
- **Vitest**: Testing framework
- **Sass**: CSS preprocessing
- **Howler**: Audio library for sound effects
- **date-fns**: Date/time utilities

### Application Structure

**State Management**: Uses Preact signals for reactive state management. The main timer state is in `src/lib/timer.js` with signals like `timerState`, `currentPeriod`, `timerHasFinished`.

**Timer Logic**: Core timer functionality in `src/lib/timer.js` includes:

- Multi-period timer configuration with work/break periods
- Auto-extension when periods complete
- Persistence to localStorage
- Sound effects on period transitions

**Component Architecture**:

- `src/app/main.jsx` - Entry point, renders Timer component
- `src/components/timer/timer.jsx` - Main timer component that initializes timer and renders all sub-components
- `src/components/timer/controls/` - Timer controls (start/pause/reset) and period controls
- `src/components/timer/durations-config/` - Durations-config editor (pick/edit named period configs)
- `src/components/timer/timeline/` - Visual timeline representation
- `src/components/timer/stats/` - Statistics display
- `src/components/timer/debug/` - Debug information components

**Styling**: SCSS files in `src/app/` with component-specific styling using BEM-like naming conventions.

### Key Files

- `src/lib/timer.js` - Core timer logic and state management (580+ lines)
- `src/lib/period-configs.js` - Named period configurations: parsing, persistence, CRUD
- `src/lib/storage.js` - localStorage persistence helpers
- `src/lib/app-update.js` - new-deploy signal (`updateReady`) and the safe-reload policy
- `src/lib/timer-worker.js` - 1 Hz tick worker, bundled by Vite (hashed, not in `public/`)
- `src/app/register-sw.js` - service-worker registration + periodic update checks
- `src/lib/sounds.js` - Audio playback using Howler
- `src/lib/format.js` - Time formatting utilities
- `vite.config.js` - Vite configuration with PWA plugin

### Testing

- Test files use `.test.js` or `.test.jsx` extensions
- Tests located in `src/lib/timer.test.js` and `src/components/timer/timer.test.jsx`
- Test setup in `src/test/setup.js`
- Testing library: Vitest with jsdom environment

### PWA Features

The app is configured as a Progressive Web App with:

- Service worker for offline functionality
- Web app manifest for installability
- Icons and assets in `public/` directory

#### Cache busting / picking up a new deploy

GitHub Pages serves `index.html` with a 10-minute `max-age` and no way to set headers, so freshness is the service worker's job. Every layer must therefore be either content-hashed or revisioned:

- **Assets** — JS, CSS and the tick worker are bundled by Vite and content-hashed. Nothing that changes between builds may live in `public/` under a fixed name: `timer-worker.js` used to, and went stale in the HTTP cache. It is now `src/lib/timer-worker.js`, loaded via `new Worker(new URL('./timer-worker.js', import.meta.url), { type: 'module' })`.
- **`index.html`** — precached by Workbox with a content revision, so a new build always produces a different `sw.js`.
- **Registration** — `injectRegister: null` in `vite.config.js`; `src/app/register-sw.js` registers through `virtual:pwa-register` instead. The plugin's injected `registerSW.js` only calls `navigator.serviceWorker.register()` — the new worker activated but the open page kept running the old bundle, which is why deployed changes used to need a cache-disabled refresh. (`virtual:pwa-register` needs the `workbox-window` dependency.)
- **Update checks** — the browser only re-checks `sw.js` on navigation, so `register-sw.js` also calls `registration.update()` every 15 min, on `visibilitychange` and on `online`. Those requests bypass the HTTP cache.
- **Applying the update** — `src/lib/app-update.js` owns the policy. `registerType: 'autoUpdate'` would reload unconditionally; instead `onNeedReload` sets the `updateReady` signal and an `effect` reloads as soon as it is safe: idle or completed, and the durations panel closed. Reloading is lossless (the session is persisted and elapsed is clock-derived) but it would drop half-typed editor text. While a session is running the `BuildInfo` avatar becomes a pulsing button that reloads on click; otherwise the reload happens when the session ends.
- **Build identity** — `__BUILD_COMMIT__` / `__BUILD_TIME__` (UTC) are injected in `vite.config.js` and shown in the `BuildInfo` tooltip, so the running build can be identified without devtools.
- **Runtime caching** — images use `StaleWhileRevalidate`; `CacheFirst` pinned unhashed icons for up to 30 days.

### Period Configuration

The hardcoded default periods live in the `PERIOD_CONFIG` constant in `src/lib/config.js`. It is exposed as the readonly built-in "Default" config.

Users can also create unlimited named period configurations via the durations-config editor (`src/lib/period-configs.js`):

- Each config is a text definition, one period per line: `<Type> <Duration> <Note>` — `Type` is `W`/`B`/`F` (work/break/fun, case-insensitive); `Duration` is minutes (plain number) or `h:mm` (when it contains `:`); `Note` is optional. Empty and unparseable lines are ignored. See `parseConfigText`.
- Configs and the last-selected config are persisted to localStorage (`periodConfigs` / `activeConfigId`). The Reset button restores the active config (`activeConfigPeriods` in `timer.js`).
- Editing is only allowed while no meaningful time has elapsed (`canConfigureDurations` — i.e. when Finish is disabled). Edits save and re-apply to the timeline immediately (no save button).

Once the timer is running with ≥ 1 min elapsed (config editing disabled), the same button becomes **Edit current durations** — a live text editor for the running timeline (`src/lib/durations-format.js`, `current-durations-editor.jsx`):

- Format per line: `<Type> <elapsed>/<total> <Note>`. Each time value is integer minutes (no `:`), `h:m`/`h:mm` (one `:`), or `h:mm:ss` (two `:`). `elapsed` is omitted when 0; on render `elapsed` shows `h:mm:ss` and `total` shows minutes/`h:mm`. See `parseCurrentDurationsText` / `serializeCurrentDurations`.
- Opening **pauses** the timer; closing resumes it only if it had been running (`applyCurrentDurations` reconciles the current period's start timestamp so no time is lost). Edits apply live; external period-control/keyboard changes mirror back into the textarea via the `currentDurationsText` signal.
- Keyboard: `E` opens the durations panel, `Esc` closes it (works while the textarea is focused). The Start/Pause button is disabled while the panel is open.

#### Anchored start mode

A session can be pinned to a wall-clock time (`Schedule.pin`/`unpin`/`isAnchored`/`timestampAnchor` in `src/lib/schedule.js`; `pinTimer`/`unpinTimer`/`togglePinTimer`/`canTogglePin` in `timer.js`):

- Configs and the live "current durations" editor both accept an optional `@h:mm` first line — parsed by `parseConfigAnchor` / `parseDurationsAnchor`, serialized back by `formatAnchorToken`. Applying a config with an `@` header arms the anchor; a future time auto-starts at that moment (armed), a past time just sits until Start is pressed (the first period then absorbs the whole gap since the anchor, auto-extending). In the live editor the anchor takes an optional day qualifier — `@h:mm` (today only; a time later than now is invalid, never silently yesterday), `@yesterday h:mm`, `@30 Dec h:mm` (most recent occurrence of that date) — and the mirror serializes anchors from before today WITH their qualifier, so re-parsing the text always resolves to the same day. Invalid typed anchors leave the anchor state unchanged: a future-resolving time, an anchor newer than the past periods' typed elapsed allows (derived current elapsed would go negative), and a half-edited `@` line (`hasAnchorLine`) all keep the previous anchor — only fully deleting the anchor line unpins. A typed anchor resolving into the same minute as the current anchor keeps its exact timestamp (seconds preserved). The current period's typed elapsed is ignored while anchored — it's derived from the anchor instead (`reconcileToAnchor`).
- Affordances: the timeline's start-time label doubles as the pin toggle (click, or `P` key) — shows a thumbtack when pinned; a thumbtack button in the top-left controls (`theme-switcher.jsx`) toggles the same, disabled when `canTogglePin` is false. Start times before today are qualified with "yesterday" or a short date (`formatDayMarker` in `format.js`), in both the timeline start label and the armed indicator. `TimerControls` shows an `ArmedIndicator` when idle + anchored ("Starts at H:MM · in Xm" for a future anchor, "Start from H:MM" for a past one); the Start button reads "Start now" when armed-future.
- Any user-facing pause (`pauseTimer`) unpins; `pauseForEditing`/`resumeAfterEditing` (used by the live editor and the timeline period-edit form) do not.
- While anchored, elapsed is clock-owned — the current period's elapsed is derived from the anchor (`reconcileToAnchor`) — so manual elapsed adjustment (`adjustElapsed`, `moveElapsedTimeToPreviousPeriod`) instead **transfers recorded time with the previous period** (`Period.amendRecordedDuration`), keeping the anchor and total elapsed fixed: forward shrinks the previous period's record and grows the current period's derived elapsed; backward does the reverse, floored at 0. The transfer slides the **boundary** between the two periods, not the current period's **end**: its duration follows its elapsed by the same amount (`Period.shiftDuration`, applied before the elapsed refresh so a forward transfer never reads as an overrun), so `state.remaining` — and every projected clock time from there to the end of the session — is unchanged. `shiftDuration` moves `state.duration` and `config.userIntendedDuration` by the same delta rather than collapsing them (unlike `extendDuration`), so an auto-extension gap survives and the move is exactly reversible; both floor at `MIN_PERIOD_MS`. **`moveElapsedTimeToPreviousPeriod` ("move time to previous" / `Backspace`) is the exception** — it passes `adjustElapsed(delta, { keepDuration: true })`, keeping the current period's LENGTH instead of its end, so it starts and therefore ends later, exactly as that button behaves unanchored. The previous period's record can't shrink below `MIN_PERIOD_MS` (`canAdjustElapsed*` guards this), and there's nothing to transfer with on the first period (`currentPeriodIndex === 0`), so adjustment is a no-op there. **Any caller computing an `adjustElapsed` delta must measure it against `adjustableElapsed`, never `timerDurationElapsed`** — while anchored the session total is nailed to the wall clock and cannot move, so a delta derived from it never converges (the reference is unaffected by the adjustment) and bleeds sub-minute time out of the previous period's record on every keypress. `adjustableElapsed` is the current period's elapsed while anchored, the session total otherwise — **floored to a whole minute in both modes**: a running reference never sits on a whole minute, and `getNextMultipleOf3Delta` snaps such a value to the boundary just below it, so without the floor the plain ←/→ keys only shave off seconds the next tick re-adds and the elapsed can never actually step (it also made anchored deltas fractional, corrupting the previous period's record). This is what the plain ←/→ snap-to-3 keys use; `End` uses the current period's elapsed directly. Period boundaries behave exactly like normal mode — an overrun period auto-extends and later periods just shift; the anchor only fixes the session start and the completed periods' record. Moving elapsed **backward while NOT anchored** hands the auto-extension back (`Period.relaxAutoExtension`, via `updateCurrentPeriod({ relax: true })`): `state.duration` returns to `config.userIntendedDuration`, floored at the remaining elapsed, so a forward/back round trip is lossless. Without it the extension outlived the elapsed that earned it and every projected clock time drifted later on each bounce. The anchored branch does not need it — it manages duration explicitly in both directions via `shiftDuration`. Any clock gap (late Start on a past anchor, device sleep/reload, time spent in the live editor) lands entirely on the current period, so an anchored session never self-finishes and no wall-clock time since the anchor is lost (the user ends it via Finish). Consequently, any past `@` time is valid in the live editor no matter how old, and `resumeTimer` reconciles when a paused session is anchored (reachable by typing `@h:mm` while paused).

### Sound System

Sources are WAV files in `src/assets/sounds/`; `./normalize_audio.sh` converts them to
`public/sounds/**/*.webm` (Opus, −18 LUFS) — the app only ever loads the `.webm` copies, via
absolute `/tymer/sounds/...` URLs. It takes optional file/directory arguments inside
`src/assets/sounds/` and converts the whole bank when given none; `sounds.py promote` passes it just
the clips it copied, since re-encoding 230-odd files for a handful of new takes is minutes of ffmpeg.

**Events, takes, and the manifest.** A sound event is a directory of interchangeable takes, and one
is chosen at random per play. A browser cannot list a directory, so `build-tools/generate-sound-manifest.js`
scans `public/sounds/` and writes `src/lib/sound-manifest.js` — `SOUND_VARIANTS`, keyed
`elapsed_6`, `overtime_break_12`, `timesup_work`, `notification_1`, `button`, `timerFinished`, whose
values are arrays of `{ src, set }`; plus `SOUND_SETS`, the distinct set names found on disk.
`normalize_audio.sh` regenerates it at the end, so it cannot go stale; `pnpm run sounds:manifest`
rebuilds it alone. **Both layouts resolve to the same key** — flat `elapsed/006.webm` and
`elapsed/006/<take>.webm` merge into `elapsed_6` — so takes can be added without moving what is
already there.

`buildSoundConfig` in `src/lib/sounds.js` holds an ARRAY of `{ set, howl }` per key and `playByKey`
picks via `pickVariant` (`src/lib/pick-variant.js`), which never returns the previous index for that
key — so a repeated event does not replay the same take twice in a row. Last-index bookkeeping is a
module-level `Map`, deliberately not a signal (it is never rendered).

**Voice sets.** Each speech take's filename stem *is* its set — `elapsed/006/brisk-1.webm` belongs to
`brisk`, `brisk-2.webm` to the same set (a trailing `-<N>` take suffix is stripped). So the sets a
prompt file promotes are already distinguishable on disk and nothing has to move; the generator just
records the set alongside the path. **This makes `@name` in a prompt set load-bearing** — a set
without one gets text-derived filenames and each clip becomes its own pseudo-set, which the coverage
test below fails on. Files that carry no set — the flat layouts, `notifications/*.ogg`,
`button.webm`, `timer-end.webm` — get `set: null` and belong to every set.

`src/lib/sound-set.js` owns the selection: `activeSoundSet` (persisted under `soundSet`, default
`ALL_SETS === 'all'`), `soundSetOptions`, `cycleSoundSet`, and a computed `soundSetLabel` — no
hand-maintained name list anywhere, so a fifth voice appears in the UI with no code edit. The
switcher is the masks button in the top-left controls (`sound-set-switcher.jsx`, `V` key); it renders
every option's label stacked in one CSS grid cell with the inactive ones `visibility: hidden`, so the
button is permanently as wide as the longest name and does not jump as the set cycles.

`pickCandidates({ variants, set })` filters at play time (Howls stay eagerly built, so switching is
instant and reloads nothing). **An empty filter falls back to the full pool** rather than returning
nothing: set-less keys match no set and must keep playing under every selection, and a
half-promoted set degrades to the other voices instead of going silent — silence is exactly the
failure mode described below. Because the index now points into a *filtered* list, `lastVariantIndex`
is keyed `` `${soundKey}|${set}` ``; a stale index from another set would be meaningless.

**The manifest is the only source of sound paths.** `getVariants(key)` returns
`SOUND_VARIANTS[key] ?? []` (and `getVariantPaths` maps that to bare `src` strings for `soundConfig`,
the build-time preload export — preloading covers every set regardless of what is selected). There is
no hardcoded fallback. There used to be one, and it was a
trap rather than a safety net: the flat paths it fell back to (`elapsed/006.webm`,
`timesup/work.webm`, `overtime/break/006.webm`, …) all stopped existing when the bank was
restructured into take directories, so a missing key produced a `Howl` on a 404 that sat in
`state === 'loading'` forever, in silence. An empty list instead reaches `playByKey`'s existing
not-found branch, which logs and records a failed `soundPlaybackLog` entry. `REQUIRED_SOUND_KEYS`
(derived from `AVAILABLE_SOUNDS` + the 63 notifications + `button`/`timerFinished`/`timesup_*`) is
what `buildSoundConfig` iterates, and `src/lib/sounds.test.js` guards it three ways: every required
key has a manifest entry, every manifest path exists on disk, and every set in `SOUND_SETS` covers
every speech key. The second assertion is the one that catches a bank restructure; the third catches
a half-promoted set and a prompt file that forgot its `@name`.

`AVAILABLE_SOUNDS` in `src/lib/sound-discovery.js` defines which minute marks exist per bank
(`elapsed`, `remaining`, `overtime`, `overtimeBreak`) and is what `SoundScheduler` schedules from.
The overtime ladder ends at 48 — the old 60-minute buzz was retired.

**Spoken text is generated, not recorded.** The words live in `sound-prompts/*.txt`, one file per
set (one voice, one character, one block per event), rendered by the vendored Gemini TTS tool in
`build-tools/tts/`. See `sound-prompts/README.md` for the set format and `build-tools/tts/README.md`
for the workflow.

`build-tools/tts/sounds.py` is a subcommand CLI (`pnpm run sounds <subcommand>`, plus
`sounds:generate` / `sounds:promote` shortcuts). `build-tools/tts/completions/sounds.bash` is
sourced from the user's shell: it defines a `sounds` function — completion attaches to a command
word, and `uv`/`pnpm` own theirs — and tab-completes subcommands, the set names found in
`sound-prompts/`, and per-subcommand flags. Clips stage under `.staging/<set>/` and reach the app
only via `promote`:

- **`generate`** fills in clips with no file yet — the resumable everyday run, since free-tier quota
  makes a 33-clip set a multi-day job. **`regenerate`** redoes every clip over the set's take `-1`;
  **`regenerate --fresh`** deletes the staged set first, so takes from an earlier, longer batch do
  not survive. `--fresh` confirms before deleting and only ever clears a directory under `.staging/`.
- **`audition`** (and `--audition each|end` during a run) plays clips through mpv. Listening time is
  subtracted from the inter-request spacing, so it costs no extra wall clock.
- **`promote`** merges the staged set in as extra takes by default — a second set, or a second batch
  of the same one, lands beside what is there rather than overwriting. **`promote --replace`**
  deletes every promoted take of that set first, so the staged batch becomes the whole of it; it
  therefore requires a complete staging and asks before deleting. Both then convert only the copied
  clips, refresh the manifest, and clear staging (`--skip-normalize` / `--keep-staging` opt out).

**A deleted take must lose its `.webm` too.** `--replace` removes the counterpart under
`public/sounds/` for every source it deletes, because `generate-sound-manifest.js` scans that
directory: an orphan there is not stale, it stays in `SOUND_VARIANTS` and keeps playing.

Not speech: `notifications/*.ogg` (63 chimes, played before period announcements), `button.webm`,
`timer-end.webm`.

PWA precaching uses recursive globs (`sounds/**/*.webm`, `sounds/**/*.ogg`) in `vite.config.js` —
single-`*` globs silently missed `overtime/break/` and every notification.
