import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { db, ensureSeeded } from './db'
import { installErrorHandlers, captureError } from './errors/reporter'
import { showFatalError } from './errors/fatalScreen'
import { i18n, setI18nLocale } from './i18n'
import { useSettingsStore } from './stores/settings'
import './assets/main.css'

// Everything up to and including mount is bootstrap: if any of it throws the
// page is left blank, so surface the error on a full-screen panel rather than
// failing silently.
try {
  const app = createApp(App)

  installErrorHandlers(app)
  const pinia = createPinia()
  app.use(pinia)
  app.use(i18n)
  app.use(router)

  // A router error (failed navigation guard, redirect loop, or a lazy view
  // chunk that won't load) aborts navigation and leaves <RouterView> empty —
  // a blank content area with no toast. Capture it, and if it happens during
  // the very first navigation escalate to the fatal screen since there's
  // nothing else on the page for the user to see.
  let ready = false
  router.onError((error) => {
    captureError('router', error)
    if (!ready) showFatalError('router', error, 'while opening the app')
  })

  // Not every startup failure throws: a navigation guard can hang, or bounce
  // between two routes forever (an alternating redirect loop). Then isReady()
  // never resolves and no error fires — the page just stays blank. Startup
  // guards only do local IndexedDB reads, so a healthy first navigation settles
  // in well under a second; if it hasn't after a few, surface a diagnostic.
  const STARTUP_TIMEOUT_MS = 8000
  const watchdog = setTimeout(() => {
    if (!ready) {
      showFatalError(
        'router',
        new Error(
          'The app did not finish loading. This usually means navigation is ' +
            'stuck in a redirect loop, or the local database failed to open.',
        ),
        'startup timed out',
      )
    }
  }, STARTUP_TIMEOUT_MS)

  router.isReady().then(
    () => {
      ready = true
      clearTimeout(watchdog)
    },
    (error) => {
      ready = true
      clearTimeout(watchdog)
      showFatalError('router', error, 'while opening the app')
    },
  )

  // Apply the saved learning language to the interface before the first render.
  setI18nLocale(useSettingsStore(pinia).baseLanguage)

  app.mount('#app')

  // Seed after mount so the app shell renders immediately.
  // ensureSeeded is a no-op on subsequent visits once words exist.
  ensureSeeded(db).catch((error) => {
    console.error(error)
    captureError('seed', error, 'while loading vocabulary')
  })
} catch (error) {
  showFatalError('bootstrap', error, 'while starting the app')
}
