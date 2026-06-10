import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import { db, ensureSeeded } from './db'
import './assets/main.css'

const app = createApp(App)

app.use(createPinia())
app.use(router)

app.mount('#app')

// Seed after mount so the app shell renders immediately.
// ensureSeeded is a no-op on subsequent visits once words exist.
ensureSeeded(db).catch(console.error)
