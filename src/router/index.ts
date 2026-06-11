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
    {
      path: '/school',
      name: 'school',
      component: () => import('@/views/SchoolView.vue'),
    },
    {
      path: '/review',
      name: 'review',
      // Owner tool: A/B review of candidate audio
      component: () => import('@/views/ReviewView.vue'),
    },
    {
      path: '/school/:id',
      name: 'lesson',
      component: () => import('@/views/LessonView.vue'),
    },
  ],
})

export default router
