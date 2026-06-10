import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LocationView from '@/views/LocationView.vue'

const router = createRouter({
  history: createWebHashHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'home',
      component: HomeView,
    },
    {
      path: '/location/:id',
      name: 'location',
      component: LocationView,
    },
    {
      path: '/settings',
      name: 'settings',
      // Lazy: settings is rarely visited
      component: () => import('@/views/SettingsView.vue'),
    },
  ],
})

export default router
