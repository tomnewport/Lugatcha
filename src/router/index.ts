import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import LocationView from '@/views/LocationView.vue'
import { db } from '@/db'
import { isWelcomeCenterComplete, WELCOME_CENTER_ID } from '@/db/progress'

const LAST_PRACTICE_AT_KEY = 'lugatcha.lastPracticeAt'
const PRACTICE_REQUIRED_MS = 60 * 60 * 1000 // 1 hour

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
      path: '/practice',
      name: 'practice',
      // Lazy: only reached from the home screen's Daily Practice button
      component: () => import('@/views/PracticeView.vue'),
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
const GATED_ROUTES = new Set(['location', 'practice', 'school', 'group', 'lesson', 'travel', 'travel-place'])

router.beforeEach(async (to) => {
  if (GATED_ROUTES.has(to.name as string)) {
    if (to.name === 'location' && to.params.id === WELCOME_CENTER_ID) return true
    if (await isWelcomeCenterComplete(db)) return true
    return { name: 'home' }
  }

  // Require daily practice before returning to the city if the user has been
  // away for more than an hour and there are eligible (seen) words to practise.
  if (to.name === 'home') {
    try {
      const stored = localStorage.getItem(LAST_PRACTICE_AT_KEY)
      const practiceOverdue =
        !stored || Date.now() - parseInt(stored, 10) > PRACTICE_REQUIRED_MS
      if (practiceOverdue) {
        const allProgress = await db.wordProgress.toArray()
        const hasEligibleWords = allProgress.some((p) => Boolean(p.seenAt))
        if (hasEligibleWords) {
          return { name: 'practice', query: { required: '1' } }
        }
      }
    } catch {
      // localStorage unavailable (private mode) or DB error — don't block
    }
  }

  return true
})

export default router
