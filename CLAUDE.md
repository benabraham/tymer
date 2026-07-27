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

Audio files in `public/` directory:

- `button.wav` - Button interactions
- `period-end.wav` - Period completion
- `timer-end.wav` - Timer completion
- `tick.wav` - Periodic ticks during work periods
