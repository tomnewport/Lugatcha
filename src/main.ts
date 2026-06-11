import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { db, ensureSeeded } from './db'
import { installErrorHandlers, captureError } from './errors/reporter'
import './assets/main.css'

const app = createApp(App)

installErrorHandlers(app)
app.use(createPinia())
app.use(router)

app.mount('#app')

// Seed after mount so the app shell renders immediately.
// ensureSeeded is a no-op on subsequent visits once words exist.
ensureSeeded(db).catch((error) => {
  console.error(error)
  captureError('seed', error, 'while loading vocabulary')
})
