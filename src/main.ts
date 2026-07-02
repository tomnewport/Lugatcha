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
  let started = false
  router.onError((error) => {
    captureError('router', error)
    if (!started) showFatalError('router', error, 'while opening the app')
  })
  router.isReady().then(
    () => {
      started = true
    },
    (error) => showFatalError('router', error, 'while opening the app'),
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
