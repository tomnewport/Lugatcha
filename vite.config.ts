import { fileURLToPath, URL } from 'node:url'
import { execSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * How many audio clips ship with this build.
 *
 * The runtime audio cache is capped by entry count, and a cap below the number
 * of clips is silently destructive: Workbox evicts least-recently-used entries
 * as new ones arrive, so "Download audio" would fetch every clip and keep only
 * the tail of them, leaving offline playback to fall through to the device's
 * speech synthesis for most words. Counting the clips here means the cap
 * cannot fall behind the corpus as recordings are added.
 */
export const audioClipCount = (() => {
  try {
    return readdirSync(fileURLToPath(new URL('./public/audio', import.meta.url)), {
      recursive: true,
    }).filter((f) => String(f).endsWith('.mp3')).length
  } catch {
    return 0
  }
})()

/** Room for every clip, plus headroom for a deploy that adds more. */
export const AUDIO_CACHE_ENTRIES = Math.max(1000, Math.ceil(audioClipCount * 1.25))

// Baked into error reports (issue #31) so a toast-filed issue pins the build
const commitHash = (() => {
  try {
    return execSync('git rev-parse --short HEAD').toString().trim()
  } catch {
    return 'unknown'
  }
})()

/**
 * Service worker caching, exported so tests can hold it to the corpus it has
 * to cover — see tests/offline-audio.spec.ts.
 */
export const workboxOptions = {
  // Precache the shell AND the content data files, so the app is fully
  // usable offline from the first install. The audio *clips* stay out of
  // the precache (107MB, and optional) and are cached at runtime — but
  // the audio *manifest* is precached with the shell, because it is the
  // lookup from spoken text to filename: without it every clip is
  // invisible, downloaded or not, and the app falls through to speech
  // synthesis for everything. It is a few hundred KB.
  globPatterns: [
    '**/*.{js,css,html,ico,png,svg,webp,woff2}',
    'data/**/*.json',
    'audio/*/manifest.json',
  ],
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
      // Audio: immutable once generated, cache forever. The entry cap
      // has to clear the whole corpus — see audioClipCount above — or a
      // completed download quietly evicts most of itself.
      urlPattern: /\/audio\/.+\.mp3$/,
      handler: 'CacheFirst',
      options: {
        cacheName: 'audio-cache',
        expiration: {
          maxEntries: AUDIO_CACHE_ENTRIES,
          maxAgeSeconds: 60 * 60 * 24 * 365,
        },
      },
    },
  ],
}

export default defineConfig({
  base: '/Lugatcha/',
  define: {
    __APP_COMMIT__: JSON.stringify(commitHash),
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString()),
  },
  build: {
    rollupOptions: {
      output: {
        // Split heavy, slow-moving libraries into their own chunks so they
        // stay cached across deploys instead of busting the main bundle hash
        // every time app code changes (issue #119). Function form so it works
        // under both rollup and vite 8's rolldown bundler.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('vue-i18n') || id.includes('@intlify')) return 'i18n'
          if (id.includes('dexie')) return 'db'
          if (
            id.includes('/vue/') ||
            id.includes('/@vue/') ||
            id.includes('vue-router') ||
            id.includes('pinia')
          ) {
            return 'vue'
          }
        },
      },
    },
  },
  plugins: [
    vue(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'icon.svg'],
      manifest: {
        name: 'Lugʻatcha — A Little Dictionary',
        short_name: 'Lugʻatcha',
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
      workbox: workboxOptions,
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
})
