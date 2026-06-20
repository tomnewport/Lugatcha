<script setup lang="ts">
import { ref } from 'vue'
import { RouterView, useRouter, type RouteLocationNormalized } from 'vue-router'
import ErrorToasts from '@/components/ErrorToasts.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const router = useRouter()

/**
 * Routes that are "a place you go into" from the home city map. Going from the
 * home map into one of these slides the place screen up; coming back slides it
 * down — and the home map parallaxes behind it (see main.css). This runs the
 * same whether the user taps a tile or uses the browser's back/forward buttons,
 * since it keys off the route names, not how the navigation was triggered.
 */
const PLACE_ROUTES = new Set(['location', 'travel', 'travel-place'])

const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const transitionName = ref('fade')

function pickTransition(to: RouteLocationNormalized, from: RouteLocationNormalized): string {
  const a = to.name as string | undefined
  const b = from.name as string | undefined
  if (!b || reduceMotion) return 'fade' // first paint / reduced motion
  if (b === 'home' && PLACE_ROUTES.has(a)) return 'slide-up' // entering a place
  if (a === 'home' && PLACE_ROUTES.has(b)) return 'slide-down' // back to the map
  return 'fade'
}

// afterEach runs synchronously once a navigation is confirmed, before Vue
// flushes the RouterView re-render, so the name is set when <Transition> reads it.
router.afterEach((to, from) => {
  transitionName.value = pickTransition(to, from)
})
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition :name="transitionName">
      <component :is="Component" />
    </Transition>
  </RouterView>

  <ErrorToasts />
  <LanguagePicker v-if="!settings.languageChosen" />
  <AppFooter />
</template>
