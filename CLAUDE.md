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
- `pnpm run format` / `format:check` - Prettier over the whole repo
- `pnpm run lint` / `lint:fix` - Biome (JS/TS/JSON)
- `pnpm run lint:css` / `lint:css:fix` - Stylelint (SCSS)
- `pnpm run lint:sh` - shellcheck
- `pnpm run lint:py` / `format:py` / `format:py:check` - ruff
- `pnpm run typecheck` - `tsc --noEmit`
- `pnpm run knip` - orphan discovery

## Toolchain

### What installs what

The split is the whole design, and it is what `flake.nix` is careful not to blur:

- **The project installs libraries and pins them.** Biome, Prettier
  (+ `prettier-plugin-sh`), Stylelint, TypeScript, lint-staged and
  simple-git-hooks come from `package.json`; ruff from
  `build-tools/tts/pyproject.toml`, pinned exactly because ruff's DEFAULT rule
  set moves between releases (0.16 reports `I001` where 0.15 does not — hence
  the explicit `select` there too).
- **The environment supplies runtimes and standalone binaries**: `node`, `pnpm`,
  `uv`, `shellcheck`. The project does not install these and must not try — no
  postinstall binary downloaders. `nix develop` is _one_ way to get them;
  nvm/corepack, apt and brew are equally fine, and CI uses none of them.
  Versions live in neutral files both the flake and CI read: `.nvmrc` for node,
  `build-tools/tts/.python-version` for the interpreter uv provisions.

`shfmt` is deliberately absent: `prettier-plugin-sh` wraps mvdan/sh as WASM, so
shell formatting needs no binary and rides the Prettier config already there.

### Who owns whitespace

**Prettier, in every language it can parse — including shell.** `biome.json` sets
`formatter.enabled: false` for exactly this reason, so Biome contributes lint
fixes and import sorting only. Stylelint 17 ships no stylistic rules, with one
exception that had to be switched off: `scss/operator-no-newline-after` cannot
tell the `/` in `grid-column: <start> / <end>` from SCSS division, and errors
when Prettier wraps such a declaration at the slash (`src/app/_stats.scss`).

Scope is `.prettierignore`, not a glob. A glob in `package.json` was the previous
design and it silently left **every** `.scss` file unformatted for as long as the
stylesheets existed, because `css` in a brace list does not match `scss`. An
ignore file fails the other way: a new file type is formatted until someone
decides otherwise. Note `.prettierrc` sets `tabWidth: 4` explicitly, which
**overrides** `.editorconfig` — hence the `*.yml`/`*.yaml` override restoring 2,
and the `*.sh` one turning off `spaceRedirects` (on by default, it would rewrite
every `2>/dev/null` in the audio scripts).

### Pre-commit

`.simple-git-hooks.js` installs a one-line `pre-commit` that runs
`pnpm exec lint-staged`; `lint-staged.config.js` holds the actual chains. The
hook is installed by the `prepare` script, so `pnpm install` is the only
bootstrap. simple-git-hooks' own postinstall is denied in `pnpm-workspace.yaml`
so hook installation stays something this repo asks for explicitly.

Two rules govern `lint-staged.config.js`:

1. Within a chain, Biome runs **first** and Prettier **last** (see above).
2. **No two write-capable globs may match the same file.** lint-staged runs
   different globs' chains concurrently, so an overlap means two processes
   rewriting one file at once. This is why `.scss` and `.sh` are single stacked
   entries, and why `tsc` sits at the end of the JS/TS chain rather than in a
   glob of its own — as a function task, so no file list is appended to it.

Escape hatches: `git commit --no-verify`, or `SKIP_SIMPLE_GIT_HOOKS=1`.

Every gate is CI-enforced in `.github/workflows/deploy.yml`, running the same
`package.json` scripts over the whole tree. The hook is the fast loop; CI decides.

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

### Deadlines

Wall-clock targets independent of the session's periods (`src/lib/deadline.ts`) — there can be
several. Each is a 2px dashed white marker over the timeline (`timeline-deadline.tsx`) with a
countdown left of the line, shown at all times: `0:01` one minute before, `-0:01` one minute past.
Once the clock passes a deadline its marker turns `--color-error` and pulses — the red light is
tied to being OVERDUE, not to the alarm, so it keeps pulsing after silencing — and a notification
chime loops until silenced via the little bell-slash button on the alarming marker's label or the
`S` key. The chime is randomly picked ONCE per deadline (keyed by kind/time/label in an in-memory
map — deliberately not persisted, a reload re-picks) and replays back-to-back with no gap; only a
failed play waits before retrying, so muted/locked audio doesn't busy-spin.

- **Set/edited/cleared only through the durations textareas**, via `+` lines — every valid one
  counts (`parseDeadlineLines` in `durations-format.ts`): `+h:mm Label` with NO date is a **daily**
  deadline — it recurs every day at that time; `+today h:mm`, `+tomorrow h:mm`, `+yesterday h:mm`
  and `+30 Dec h:mm` are **absolute**. The mirror serializes an absolute deadline WITH its day
  qualifier even for today (`serializeDeadlineLines`) — a bare `+h:mm` would re-parse as daily,
  silently changing kind. Markers show the time, the day when not today, and the optional label.
- **Ownership differs by editor** (same contract shape as the anchor): the live editor owns the
  list — valid lines set exactly those, no `+` line at all clears, `+` lines present but none
  valid keeps (`hasDeadlineLine`). A config apply only SETS when `+` lines are present; absence
  leaves the list alone, so a daily deadline survives config switches. **Reset is the exception**
  — `resetTimer` passes `clearDeadlines: true` down to `setPeriodsFromConfig`, which forwards it
  as `clearOnAbsence`, so after a Reset the list is exactly the active config's `+` lines and
  empty when it has none. Deadlines do not survive a Reset.
- **Only one alarm at a time — the latest expired owns it** (`deadlineAlarmTimestamp` = max overdue
  occurrence). When a newer deadline expires while an older one still rings, a supersede effect
  silences the older one FOR GOOD (it must not resume even if the newer one is later deleted).
  Silencing is per occurrence timestamp (`silencedDeadlines`, persisted, pruned against current
  occurrences): an absolute deadline stays quiet forever, a daily one resolves to a new timestamp
  after midnight and alarms again. A deadline already overdue when it first appears starts
  silenced — typing `+yesterday 17:00` must not blast chimes per keystroke; the alarm is for the
  live crossing (and for reopening the app while un-silenced-overdue). `setDeadlines` batches the
  list write with that silencing so the alarm effect never sees the intermediate state. The loop
  (`playNotification` of the owner's fixed chime) re-checks `deadlineAlarmActive` each round, so
  silence/supersede/clear/mute stops it at the next clip boundary.
- Deadline state persists under its own localStorage keys (`deadlines`, `deadlineSilenced`), NOT in
  the `timerState` blob — it outlives sessions. The module runs its own 1 Hz clock (`deadlineNow`,
  a plain `setInterval`): the timer's worker tick only runs during a session, and a deadline must
  fire, and its daily resolution must roll over at midnight, while idle too.
- Markers map each deadline's clock time into the session's start..end span (start =
  `timestampAnchor ?? now − totalElapsed`) and clamp to the timeline's edges, so a set deadline is
  always visible; unanchored, they slide as the derived start moves with "now".

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

**Voice sets.** Each speech take's filename stem _is_ its set — `elapsed/006/brisk-1.webm` belongs to
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
failure mode described below. Because the index now points into a _filtered_ list, `lastVariantIndex`
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
(derived from `AVAILABLE_SOUNDS` + the 78 notifications + `button`/`timerFinished`/`timesup_*`) is
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
`sounds:generate` / `sounds:promote` shortcuts). Inside the repo it is just `sounds <subcommand>`:
`flake.nix` builds a `tymer-sounds` derivation that direnv puts on PATH, carrying `bin/sounds` and
`share/bash-completion/completions/sounds`. **That second path is load-bearing** — direnv replays
environment variables only and cannot export a shell function or a `complete` registration, but
bash-completion's `complete -D` loader derives `<prefix>/share/bash-completion/completions/<cmd>`
from every PATH entry ending in `/bin`, so shipping both halves gets tab completion with no shell
config. Both halves are stubs resolving through `TYMER_ROOT` (exported by the shell hook) into
`build-tools/tts/completions/sounds.bash`, so edits need no rebuild. That file also defines a
`sounds` function for shells with no direnv — guarded by `command -v sounds`, since a function
would otherwise shadow the dev shell's command with the wrong tool directory. Clips stage under
`.staging/<set>/` and reach the app only via `promote`:

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

Not speech: `notifications/*.ogg` (78 chimes, played before period announcements), `button.webm`,
`timer-end.webm`.

**The notification chimes bypass `normalize_audio.sh` entirely.** That script only walks
`src/assets/sounds/**/*.wav`, so the oggs are copied to `public/sounds/notifications/` by hand —
adding one means writing it to BOTH trees, then `pnpm run sounds:manifest`. They are stock Android
ringtones (`64`–`78` came from a per-vendor ringtone bank), which pad a short chime out to 1.5–3 s
of silence. Trim that silence with a **stream copy**, never a re-encode:
`ffmpeg -ss <start> -i in.ogg -t <len> -c copy out.ogg` cuts at Vorbis packet boundaries and the
decoded PCM stays bit-identical, so the clip survives with no generation loss; it just lands within
~10 ms of the requested point. Re-encoding a lossy source to trim leading silence is the tempting
wrong move. Bump the `78` in `REQUIRED_SOUND_KEYS` and `pickRandomNotificationKey` (`src/lib/sounds.ts`)
in lockstep — the count is not derived from the manifest, and the sounds test fails if it drifts.

PWA precaching uses recursive globs (`sounds/**/*.webm`, `sounds/**/*.ogg`) in `vite.config.js` —
single-`*` globs silently missed `overtime/break/` and every notification.
