import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import autoprefixer from 'autoprefixer'
import csso from 'postcss-csso'
import { soundPreloadPlugin } from './build-tools/sound-preloader.js'

// Build identity — shown in the build-info tooltip so the running build can be
// told apart from a newer deploy without opening devtools.
const buildCommit = (() => {
  try {
    return execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
  } catch {
    return 'nogit'
  }
})()
// UTC — builds run on CI, so a local timezone would be misleading
const buildTime = `${new Date().toISOString().slice(0, 16).replace('T', ' ')} UTC`

// FNV-1a — tiny, dependency-free 32-bit hash, good enough to spread short
// commit SHAs across the avatar ranges below without pulling in node:crypto.
const fnv1a = str => {
  let hash = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

// Derived from buildCommit (not random) so the same commit always produces
// the same avatar — two builds of the same source are then reproducible.
const buildAvatar = (() => {
  const ranges = [
    [0x1f32a, 0x1f50d],
    [0x1f56f, 0x1f5fa],
    [0x1f687, 0x1f6f3],
    [0x1f300, 0x1f31f],
    [0x1f330, 0x1f393],
    [0x1f400, 0x1f4ff],
  ]
  const hash = fnv1a(buildCommit)
  // Split the hash into two independent halves so the range and the offset
  // within it vary independently across commits.
  const rangeIndex = (hash >>> 16) % ranges.length
  const [start, end] = ranges[rangeIndex]
  const offset = (hash & 0xffff) % (end - start + 1)
  return String.fromCodePoint(start + offset)
})()

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_AVATAR__: JSON.stringify(buildAvatar),
    __BUILD_COMMIT__: JSON.stringify(buildCommit),
    __BUILD_TIME__: JSON.stringify(buildTime),
  },
  plugins: [
    preact(),
    soundPreloadPlugin(),
    VitePWA({
      registerType: 'autoUpdate',
      // src/app/register-sw.js registers via `virtual:pwa-register` instead of
      // the plugin's injected registerSW.js — the injected script never reloads
      // the page after a new build activates, which left deployed changes
      // invisible until a manual cache-disabled refresh.
      injectRegister: null,
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'masked-icon.svg',
        'icon-192x192.png',
        'icon-512x512.png',
        // Recursive: sounds live one level deeper than they used to. Events are
        // directories of interchangeable takes (sounds/elapsed/006/*.webm), and
        // break overtime is nested (sounds/overtime/break/*.webm) — a single-*
        // glob silently precached neither, so those sounds never worked offline.
        'sounds/**/*.webm',
        'sounds/**/*.ogg',
      ],
      workbox: {
        // Clean up old caches from previous versions
        cleanupOutdatedCaches: true,
        // Skip waiting to activate new SW immediately
        skipWaiting: true,
        // Take control of all clients immediately
        clientsClaim: true,
        // Runtime caching for assets not in precache
        runtimeCaching: [
          {
            // Cache audio files with StaleWhileRevalidate
            urlPattern: /\.(?:webm|wav|mp3|ogg)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'audio-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Images: served from cache, refreshed in the background. CacheFirst
            // pinned unhashed icons for up to 30 days with no way to bust them.
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|ico|webp)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'image-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
              },
            },
          },
          {
            // Cache fonts with CacheFirst
            urlPattern: /^https:\/\/fonts\.bunny\.net\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'font-cache',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      manifest: {
        name: 'Linear Pomodoro Timer',
        short_name: 'Pomodoro',
        description: 'A simple Pomodoro timer application',
        theme_color: '#ffffff',
        icons: [
          {
            src: 'icon-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
        ],
      },
    }),
  ],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    coverage: {
      reporter: ['text', 'json', 'html'],
      provider: 'v8',
    },
  },
  server: {
    host: true,
    port: 5050,
    strictPort: true,
    cors: true,
  },
  base: '/tymer/',
  css: {
    preprocessorOptions: {
      sass: {
        // Add any Sass-specific options here if needed
      },
    },
    postcss: {
      plugins: [
        autoprefixer(),
        csso({
          sourceMap: process.env.NODE_ENV !== 'production',
        }),
      ],
    },
    devSourcemap: process.env.NODE_ENV !== 'production',
  },
})
