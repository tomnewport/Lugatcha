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
 * Routes that are "a place you go into" from the home city map. Navigating
 * between the home map and any of these (in either direction, including via the
 * browser's back/forward buttons) plays the eight-pointed-star portal; every
 * other navigation gets a quiet cross-fade.
 */
const PLACE_ROUTES = new Set(['location', 'travel', 'travel-place'])

const transitionName = ref('fade')
/** Hold the lapis field on screen only while the star portal is mid-flight. */
const showBackdrop = ref(false)

function pickTransition(to: RouteLocationNormalized, from: RouteLocationNormalized): string {
  const a = to.name as string | undefined
  const b = from.name as string | undefined
  // First paint (no previous route) shouldn't animate.
  if (!b) return 'fade'
  if ((a === 'home' && PLACE_ROUTES.has(b)) || (b === 'home' && PLACE_ROUTES.has(a))) {
    return 'star'
  }
  return 'fade'
}

// afterEach runs synchronously once a navigation is confirmed, before Vue
// flushes the RouterView re-render, so the name is in place when the
// <Transition> picks it up.
router.afterEach((to, from) => {
  transitionName.value = pickTransition(to, from)
})

function onBeforeLeave() {
  if (transitionName.value === 'star') showBackdrop.value = true
}

function onAfterEnter() {
  showBackdrop.value = false
}
</script>

<template>
  <div class="route-backdrop" :class="{ 'route-backdrop--on': showBackdrop }" aria-hidden="true" />

  <RouterView v-slot="{ Component }">
    <Transition
      :name="transitionName"
      mode="out-in"
      @before-leave="onBeforeLeave"
      @after-enter="onAfterEnter"
    >
      <component :is="Component" />
    </Transition>
  </RouterView>

  <ErrorToasts />
  <LanguagePicker v-if="!settings.languageChosen" />
  <AppFooter />
</template>

<style scoped>
/*
 * The field glimpsed through the star's notches as one screen hands off to the
 * next — the deep lapis and gold of the tilework. Sits behind every view
 * (z-index: -1), so it only shows where the active view is clipped away.
 */
.route-backdrop {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  opacity: 0;
  transition: opacity 0.25s ease;
  background:
    radial-gradient(circle at 50% 44%, rgba(201, 168, 76, 0.35), transparent 42%),
    radial-gradient(circle at 50% 50%, #2e6db4 0%, #1b4f8a 40%, #14365e 100%);
}

.route-backdrop--on {
  opacity: 1;
}

@media (prefers-reduced-motion: reduce) {
  .route-backdrop {
    transition: none;
  }
}
</style>
