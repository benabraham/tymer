# GEMINI.md

## Project Overview

This project is a web-based countdown timer application named "Tymer". It's designed to be a persistent, stateful timer that remembers its state across page loads, thanks to `localStorage`. The application supports multiple timer "periods" (e.g., for work and break intervals), and provides sound notifications for various timer events.

The frontend is built using **Preact**, a lightweight alternative to React. State management is handled reactively using **@preact/signals**. The application is built and served using **Vite**, and testing is set up with **Vitest**.

The core logic is separated from the UI components. The main timer logic resides in `src/lib/timer.js`, which manages the timer's state, including starting, stopping, pausing, and handling periods. The UI is composed of several Preact components found in `src/components/`.

## Building and Running

### Development

To run the application in development mode with hot-reloading, use the following commands:

```bash
npm install
npm run dev
```

### Production Build

To build the application for production, which creates an optimized build in the `dist/` directory, run:

```bash
npm run build
```

### Testing

To run the test suite, use the following command:

```bash
npm test
```

To run the tests with a coverage report:

```bash
npm run test:coverage
```

## Development Conventions

*   **State Management:** The project uses `@preact/signals` for state management. The main application state is defined in `src/lib/timer.js` and imported into the components.
*   **Component Structure:** The UI is built with Preact components, located in `src/components/`. The main application component is `src/components/timer/timer.jsx`.
*   **Styling:** The project uses SCSS for styling. The main stylesheet is `src/app/index.scss`, which imports other partial SCSS files.
*   **Code Formatting:** The project uses `prettier` for code formatting. You can format the code by running `npm run format`.
*   **Sounds:** The application uses the `howler.js` library to play sounds. Sound files are located in `public/sounds/`. The logic for playing sounds is in `src/lib/sounds.js`.
*   **Persistence:** The timer state is persisted to `localStorage` to maintain the timer's state across browser sessions. The logic for this is in `src/lib/storage.js` and is used within `src/lib/timer.js`.
