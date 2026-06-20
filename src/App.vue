<script setup lang="ts">
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { RouterView, useRouter, type RouteLocationNormalized } from 'vue-router'
import ErrorToasts from '@/components/ErrorToasts.vue'
import LanguagePicker from '@/components/LanguagePicker.vue'
import AppFooter from '@/components/AppFooter.vue'
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
const router = useRouter()

/**
 * Routes that are "a place you go into" from the home city map. Navigating
 * between the home map and any of these — in either direction, and whether the
 * user taps a tile or uses the browser's back/forward buttons — plays the
 * star-portal: a place "screen" grows out of the tapped point until it fills
 * the viewport, the content swaps in underneath while it's covered, then it
 * uncovers. Every other navigation gets a quiet cross-fade.
 */
const PLACE_ROUTES = new Set(['location', 'travel', 'travel-place'])

const reduceMotion =
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

const portalRef = ref<HTMLElement | null>(null)
const portalActive = ref(false)
// transform-origin for the growth — the point the user tapped.
const portalOrigin = ref('50% 50%')
// 'star' drives the portal; anything else is a plain cross-fade.
let transitionKind = 'fade'

/** Last interaction point, in viewport pixels — where the portal grows from. */
let lastPointer = { x: 0, y: 0 }

function recordPointer(e: MouseEvent) {
  let x = e.clientX
  let y = e.clientY
  // Keyboard-activated clicks report (0, 0) / detail 0 — grow from the
  // activated element's centre instead so the origin still makes sense.
  if (e.detail === 0 || (x === 0 && y === 0)) {
    const rect = (e.target as HTMLElement | null)?.getBoundingClientRect?.()
    if (rect) {
      x = rect.left + rect.width / 2
      y = rect.top + rect.height / 2
    }
  }
  lastPointer = { x, y }
}

onMounted(() => window.addEventListener('click', recordPointer, true))
onBeforeUnmount(() => window.removeEventListener('click', recordPointer, true))

function pickTransition(to: RouteLocationNormalized, from: RouteLocationNormalized): string {
  const a = to.name as string | undefined
  const b = from.name as string | undefined
  if (!b || reduceMotion) return 'fade' // first paint / reduced motion
  if ((a === 'home' && PLACE_ROUTES.has(b)) || (b === 'home' && PLACE_ROUTES.has(a))) {
    return 'star'
  }
  return 'fade'
}

// afterEach runs synchronously once a navigation is confirmed, before Vue
// flushes the RouterView re-render — so the kind and origin are in place by the
// time the <Transition> hooks fire.
router.afterEach((to, from) => {
  transitionKind = pickTransition(to, from)
  if (transitionKind === 'star') {
    // Leaving home → grow from where they tapped. Returning home (incl. browser
    // back) has no meaningful tap point, so grow from the centre.
    portalOrigin.value =
      from.name === 'home' ? `${lastPointer.x}px ${lastPointer.y}px` : '50% 50%'
  }
})

/** Grow the star screen from the origin until it covers the viewport. */
async function growPortal() {
  portalActive.value = true
  await nextTick()
  const el = portalRef.value
  if (!el) return
  el.style.transformOrigin = portalOrigin.value
  try {
    await el.animate(
      [{ transform: 'scale(0)' }, { transform: 'scale(1)' }],
      { duration: 460, easing: 'cubic-bezier(0.45, 0, 0.2, 1)', fill: 'forwards' },
    ).finished
  } catch {
    /* interrupted by a newer navigation — fine */
  }
}

/** Uncover the now-loaded content, then drop the portal. */
async function revealContent() {
  const el = portalRef.value
  if (el) {
    try {
      await el.animate([{ opacity: 1 }, { opacity: 0 }], {
        duration: 300,
        easing: 'ease',
        fill: 'forwards',
      }).finished
    } catch {
      /* interrupted */
    }
  }
  portalActive.value = false
}

function fade(el: Element, from: number, to: number, done: () => void) {
  el.animate([{ opacity: from }, { opacity: to }], {
    duration: 150,
    easing: 'ease',
    fill: 'forwards',
  }).finished.then(done, done)
}

// JS-driven (css: false) so the portal's grow/reveal can gate exactly when the
// content swaps. With mode="out-in", onLeave fully completes — growing the
// portal over the outgoing screen — before onEnter swaps and reveals.
function onLeave(el: Element, done: () => void) {
  if (transitionKind === 'star') growPortal().then(done)
  else fade(el, 1, 0, done)
}

function onEnter(el: Element, done: () => void) {
  // For the star portal the incoming view is already covered, so it just
  // appears at full opacity and the portal uncovers it.
  if (transitionKind === 'star') revealContent().then(done)
  else fade(el, 0, 1, done)
}
</script>

<template>
  <RouterView v-slot="{ Component }">
    <Transition :css="false" mode="out-in" @leave="onLeave" @enter="onEnter">
      <component :is="Component" />
    </Transition>
  </RouterView>

  <!--
    The growing place "screen": an eight-pointed-star panel that scales up from
    the tapped point. It carries the destination's own paper background so that,
    once it fills the viewport, uncovering it reads as the content simply having
    loaded in place.
  -->
  <div v-if="portalActive" ref="portalRef" class="portal" aria-hidden="true" />

  <ErrorToasts />
  <LanguagePicker v-if="!settings.languageChosen" />
  <AppFooter />
</template>

<style scoped>
.portal {
  position: fixed;
  inset: 0;
  z-index: 100;
  pointer-events: none;
  clip-path: var(--star-open);
  /* Destination background, with a soft lapis/gold bloom at the core so the
     growing star reads as tilework rather than a blank rectangle. The drop
     shadow traces the star's edge, defining it against the city map. */
  background:
    radial-gradient(circle at 50% 50%, rgba(201, 168, 76, 0.22), transparent 30%),
    radial-gradient(circle at 50% 50%, rgba(27, 79, 138, 0.14), transparent 55%),
    var(--color-bg);
  filter:
    drop-shadow(0 0 1.5px rgba(27, 79, 138, 0.45))
    drop-shadow(0 10px 28px rgba(0, 0, 0, 0.22));
  will-change: transform, opacity;
}
</style>
