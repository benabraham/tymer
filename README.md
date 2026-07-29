# Tymer!

## Develop

```bash
pnpm i
pnpm run dev
```

## What it does
It's a countdown timer that can
- be started
- be paused (after it has started)
- be resumed (after it has been paused)
- be reset (after it has started or after it finishes)
- be finished (after at least some time was recorded)
- have multiple periods
- have current period duration adjusted
- have current period elapsed time adjusted
- move to the next or previous period
- show the total time elapsed while it was running

It uses localStorage to “keep running” after closing the page and opening it again.

## Build

Builds the app for production to the `dist` folder.

```bash
pnpm run build
```
## Deployment

The app is deployed to GitHub Pages.
https://benabraham.github.io/tymer/

An open page picks up a new deploy on its own — the service worker checks for one every 15 minutes
and when you return to the tab. It reloads as soon as that is safe: right away when the timer is
idle or finished, otherwise the build avatar in the top-right starts pulsing and reloads on click
(or by itself once the session ends). Its tooltip shows which build is running.

## Sounds

Tymer speaks: it announces elapsed time, time remaining, and — with rising
impatience — how far past its period you are. Each event is a directory of
interchangeable takes and one is picked at random per play. The words are
generated rather than recorded, from prompt sets kept in the repo.

- [`sound-prompts/README.md`](sound-prompts/README.md) — how a set is defined,
  and the overtime escalation ladder
- [`build-tools/tts/README.md`](build-tools/tts/README.md) — generating and
  promoting a set

## Tests

```bash
pnpm test               # Run tests with Vitest
pnpm run test:coverage  # Run tests with coverage report
```

## Formatting

```bash
pnpm run format         # Write
pnpm run format:check   # Check only
```
