import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

// Baked into error reports (issue #31) so a toast-filed issue pins the build
const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
})()

export default defineConfig({
  base: '/Lugatcha/',
  define: {
    __APP_COMMIT__: JSON.stringify(commitHash),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: "Lugʻatcha — A Little Dictionary",
        short_name: "Lugʻatcha",
        description: 'Learn Uzbek for your trip to Uzbekistan',
        theme_color: '#1B4F8A',
        background_color: '#F5F0E8',
        display: 'standalone',
        scope: '/Lugatcha/',
        start_url: '/Lugatcha/',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Precache the shell AND the content data files, so the app is fully
        // usable offline from the first install. Audio stays out of the
        // precache (large, optional) and is cached at runtime instead.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,webp,woff2}', 'data/**/*.json'],
        runtimeCaching: [
          {
            // Data files: serve stale immediately, refresh in background
            urlPattern: /\/data\/.+\.json$/,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'data-cache',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 7 },
            },
          },
          {
            // Audio: immutable once generated, cache forever
            urlPattern: /\/audio\/.+\.mp3$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'audio-cache',
              expiration: { maxEntries: 500, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
