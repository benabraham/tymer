import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import autoprefixer from 'autoprefixer'
import csso from 'postcss-csso'
import { soundPreloadPlugin } from './build-tools/sound-preloader.js'

// https://vitejs.dev/config/
export default defineConfig({
  define: {
    __BUILD_TIME__: JSON.stringify(new Date().toISOString()),
    __BUILD_HASH__: JSON.stringify(Date.now().toString(36).toUpperCase()),
  },
  plugins: [
    preact(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: [
        'favicon.ico',
        'apple-touch-icon.png',
        'masked-icon.svg',
        'icon-192x192.png',
        'icon-512x512.png',
        'sounds/button.webm',
        'sounds/timer-end.webm',
        'sounds/alternatives/*.webm',
        'sounds/elapsed/*.webm',
        'sounds/overtime/*.webm',
        'sounds/remaining/*.webm',
        'sounds/timesup/*.webm',
      ],
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
    setupFiles: './src/test/setup.js',
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
