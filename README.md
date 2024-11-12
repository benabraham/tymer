<h1 style="color:red;background-color:yellow">Tymer!</h1>

## Develop

```bash
npm i
npm run dev
```

## What it does
It's a countdown timer that can
- be started
- be paused (after it has started)
- be resumed (after it has been paused)
- be reset (after it has started or after it finishes)
- have multiple periods
- have current period duration adjusted
- show the total time elapsed while it was running

It uses localStorage to “keep running” after closing the page and opening it again.

## Build

Builds the app for production to the `dist` folder.

```bash
npm run build
```
## Deployment

The app is deployed to GitHub Pages.
https://benabraham.github.io/tymer/
