import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { db, ensureSeeded } from './db'
import { installErrorHandlers, captureError } from './errors/reporter'
import { i18n, setI18nLocale } from './i18n'
import { useSettingsStore } from './stores/settings'
import './assets/main.css'

const app = createApp(App)

installErrorHandlers(app)
const pinia = createPinia()
app.use(pinia)
app.use(i18n)
app.use(router)

// Apply the saved learning language to the interface before the first render.
setI18nLocale(useSettingsStore(pinia).baseLanguage)

app.mount('#app')

// Seed after mount so the app shell renders immediately.
// ensureSeeded is a no-op on subsequent visits once words exist.
ensureSeeded(db).catch((error) => {
  console.error(error)
  captureError('seed', error, 'while loading vocabulary')
})
