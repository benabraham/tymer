# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Skills & Rules

- `.claude/rules/preact.md` — enforceable Preact + signals rules; always follow when editing `src/**/*.{js,jsx}`
- `.claude/skills/tymer-preact/SKILL.md` — full rationale and Tymer-specific signals examples; load via the Skill tool when depth is needed

## Project Overview

This is a countdown timer web application built with Preact and Vite called "Tymer". It's a Pomodoro-style timer that supports multiple periods with customizable durations and automatic time tracking persistence via localStorage.

## Development Commands

- `pnpm run dev` - Start development server (Vite) on port 3000
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

### Sound System

Audio files in `public/` directory:

- `button.wav` - Button interactions
- `period-end.wav` - Period completion
- `timer-end.wav` - Timer completion
- `tick.wav` - Periodic ticks during work periods
