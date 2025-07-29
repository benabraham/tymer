import { defineConfig } from 'vite'
import preact from '@preact/preset-vite'
import { VitePWA } from 'vite-plugin-pwa'
import autoprefixer from 'autoprefixer'
import csso from 'postcss-csso'

// https://vitejs.dev/config/
export default defineConfig({
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
