import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LocationView from '@/views/LocationView.vue'
import { db } from '@/db'
import { isWelcomeCenterComplete, WELCOME_CENTER_ID } from '@/db/progress'

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
      path: '/school/group/:id',
      name: 'group',
      component: () => import('@/views/GroupView.vue'),
    },
    {
      path: '/school/:id',
      name: 'lesson',
      component: () => import('@/views/LessonView.vue'),
    },
    {
      path: '/travel',
      name: 'travel',
      component: () => import('@/views/TravelView.vue'),
    },
    {
      path: '/travel/:id',
      name: 'travel-place',
      component: () => import('@/views/TravelPlaceView.vue'),
    },
  ],
})

// Gate the whole city behind the Welcome Center: until its basic vocabulary is
// met, only the home map, settings, and the Welcome Center itself are reachable.
// The locked tiles enforce this in the UI; this guard also covers deep links.
const GATED_ROUTES = new Set(['location', 'school', 'group', 'lesson', 'travel', 'travel-place'])

router.beforeEach(async (to) => {
  if (!GATED_ROUTES.has(to.name as string)) return true
  if (to.name === 'location' && to.params.id === WELCOME_CENTER_ID) return true
  if (await isWelcomeCenterComplete(db)) return true
  return { name: 'home' }
})

export default router
