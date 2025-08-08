# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- `src/components/timer/timeline/` - Visual timeline representation
- `src/components/timer/stats/` - Statistics display
- `src/components/timer/debug/` - Debug information components

**Styling**: SCSS files in `src/app/` with component-specific styling using BEM-like naming conventions.

### Key Files
- `src/lib/timer.js` - Core timer logic and state management (580+ lines)
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
Default timer has predefined work/break periods (48min work, 12min break pattern) defined in `PERIOD_CONFIG` constant in `src/lib/timer.js:10-24`.

### Sound System
Audio files in `public/` directory:
- `button.wav` - Button interactions
- `period-end.wav` - Period completion
- `timer-end.wav` - Timer completion
- `tick.wav` - Periodic ticks during work periods