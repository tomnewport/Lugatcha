<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadLocations } from '@/db/locations'
import { useLiveQuery, db } from '@/db/useDb'
import { isWordLearned } from '@/exercises/test'
import { WELCOME_CENTER_ID, WELCOME_REQUIRED_EXERCISES } from '@/db/progress'
import type { Location, LocationProgress } from '@/db/types'
import LocationTile from '@/components/LocationTile.vue'
import SchoolTile from '@/components/SchoolTile.vue'
import TravelTile from '@/components/TravelTile.vue'
import TreasureChest from '@/components/TreasureChest.vue'
import ContinueLearning from '@/components/ContinueLearning.vue'
import AppLogo from '@/components/AppLogo.vue'
import AppLogotype from '@/components/AppLogotype.vue'
import { useAudioReady } from '@/audio/offline'
import { currentStreak, streakChips } from '@/streak'
import { selectAutoExercise, EXERCISE_EMOJI, type LocationStats } from '@/exercises/potluck'
import { MAP_MARKERS, markerStyle, markerCentre } from '@/map/cityMap'
import homeCityMap from '@/assets/home-city-map.webp'

const LAST_TRIED_KEY = 'lugatcha.lastTriedLocation'
const SEED_KEY = 'lugatcha.sessionSeed'
// Set by PracticeView when a practice session finishes (local YYYY-MM-DD).
const DAILY_PRACTICE_DATE_KEY = 'lugatcha.dailyPracticeDate'

const router = useRouter()
const { ready: audioReady } = useAudioReady()

const BANNER_KEY = 'lugatcha.audioBannerDismissed'
const bannerDismissed = ref(localStorage.getItem(BANNER_KEY) === 'true')
const showBanner = computed(() => !audioReady.value && !bannerDismissed.value)
const lockedNoticeVisible = ref(false)

function dismissBanner() {
  bannerDismissed.value = true
  try { localStorage.setItem(BANNER_KEY, 'true') } catch { /* private mode */ }
}

function showLockedNotice() {
  lockedNoticeVisible.value = true
}

function getOrCreateSeed(): number {
  try {
    const stored = localStorage.getItem(SEED_KEY)
    if (stored !== null) return parseInt(stored, 10)
  } catch { /* private mode */ }
  const seed = Math.floor(Math.random() * 1_000_000)
  try { localStorage.setItem(SEED_KEY, String(seed)) } catch { /* private mode */ }
  return seed
}

const locations = ref<Location[]>([])
const sessionSeed = ref(getOrCreateSeed())

onMounted(async () => {
  locations.value = await loadLocations()
  if (import.meta.env.DEV) {
    const unplaced = locations.value.filter((l) => !MAP_MARKERS[l.id]).map((l) => l.id)
    if (unplaced.length) {
      console.warn(`[HomeView] locations missing a map marker: ${unplaced.join(', ')}`)
    }
  }
})

const allProgress = useLiveQuery(() => db.locationProgress.toArray(), [] as LocationProgress[])

/** Seen-word, known-word, and total-word counts keyed by location theme. */
const wordStats = useLiveQuery(
  async () => {
    const [wordProgress, allWords] = await Promise.all([
      db.wordProgress.toArray(),
      db.words.toArray(),
    ])
    const seenIds = new Set(wordProgress.filter((p) => p.seenAt).map((p) => p.wordId))
    const knownIds = new Set(wordProgress.filter((p) => isWordLearned(p)).map((p) => p.wordId))
    const seen = new Map<string, number>()
    const known = new Map<string, number>()
    const total = new Map<string, number>()
    for (const w of allWords) {
      if (w.theme === 'core') continue
      total.set(w.theme, (total.get(w.theme) ?? 0) + 1)
      if (seenIds.has(w.id)) seen.set(w.theme, (seen.get(w.theme) ?? 0) + 1)
      if (knownIds.has(w.id)) known.set(w.theme, (known.get(w.theme) ?? 0) + 1)
    }
    return { seen, known, total }
  },
  { seen: new Map<string, number>(), known: new Map<string, number>(), total: new Map<string, number>() },
)

/**
 * The Welcome Center is the city's front door: every other tile stays locked
 * until it's finished. Completion = every basic word met and every activity
 * done once, including a Learn Vocabulary session (mastering every word is
 * not required — that continues once the city is open).
 * Once earned it latches (graduatedAt, written by isWelcomeCenterComplete):
 * a welcome word un-learned later in daily practice must not re-lock the city.
 */
const WELCOME_ID = WELCOME_CENTER_ID
const welcomeComplete = computed(() => {
  const progress = allProgress.value.find((p) => p.locationId === WELCOME_ID)
  if (progress?.graduatedAt) return true
  const total = wordStats.value.total.get(WELCOME_ID) ?? 0
  const seen = wordStats.value.seen.get(WELCOME_ID) ?? 0
  if (total === 0 || seen < total) return false
  const done = new Set(progress?.completedExercises ?? [])
  return WELCOME_REQUIRED_EXERCISES.every((e) => done.has(e))
})

const lastTried = ref<string | null>(null)
const practicedToday = ref(false)
const streak = ref(0)
// Once the day's practice is done, the practice button becomes "Continue
// learning", which opens the next-location chooser overlay.
const continueOpen = ref(false)

const streakSymbols = computed(() =>
  streakChips(streak.value)
    .map((c) => c.symbol)
    .join(''),
)

onMounted(() => {
  try {
    lastTried.value = localStorage.getItem(LAST_TRIED_KEY)
    const today = new Date().toLocaleDateString('en-CA')
    practicedToday.value = localStorage.getItem(DAILY_PRACTICE_DATE_KEY) === today
  } catch {
    // private mode
  }
  streak.value = currentStreak()
})

const progressMap = computed(() => {
  const map = new Map<string, LocationProgress>()
  for (const p of allProgress.value) map.set(p.locationId, p)
  return map
})

// Sorted by grid position: row-major order
const sortedLocations = computed(() =>
  [...locations.value].sort((a, b) =>
    a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol,
  ),
)

/** Seeded Fisher-Yates shuffle — reproducible within a session. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  const copy = [...items]
  let s = seed
  for (let i = copy.length - 1; i > 0; i--) {
    s = (Math.imul(s, 1103515245) + 12345) & 0x7fffffff
    const j = s % (i + 1)
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Returns the emoji for the exercise LocationView would actually serve next. */
function nextExerciseEmoji(locationId: string): string {
  const progress = progressMap.value.get(locationId)
  const completed = [...(progress?.completedExercises ?? [])]
  const seenWords = wordStats.value.seen.get(locationId) ?? 0
  const totalWords = wordStats.value.total.get(locationId) ?? 0
  const knownWords = wordStats.value.known.get(locationId) ?? 0
  const stats: LocationStats = {
    locationId,
    seenWords,
    totalWords,
    knownWords,
    completed,
    visits: progress?.visits ?? 0,
  }
  const next = selectAutoExercise(stats)
  return next ? EXERCISE_EMOJI[next] : '✨'
}

/**
 * For each non-school location: an emoji chip if it's in the active 90%,
 * null otherwise. Last-tried location is always excluded from the chip set.
 */
const chipMap = computed(() => {
  const map = new Map<string, string | null>()
  const locs = sortedLocations.value.filter(
    (l) => l.id !== 'school' && l.id !== 'travel' && l.id !== WELCOME_ID,
  )

  const eligible = locs.filter((l) => l.id !== lastTried.value)
  const count = Math.max(1, Math.round(eligible.length * 0.9))
  const chipped = new Set(
    seededShuffle(eligible, sessionSeed.value)
      .slice(0, count)
      .map((l) => l.id),
  )

  for (const loc of locs) {
    map.set(loc.id, chipped.has(loc.id) ? nextExerciseEmoji(loc.id) : null)
  }
  return map
})

/**
 * Marker placement is driven by the illustration, not by the location data's
 * gridRow/gridCol. The geometry lives in src/map/cityMap.ts so LocationCrop can
 * frame the same buildings; the data grid is only used for DOM (reading/tab)
 * order now. A location absent from MAP_MARKERS has no place on the art and is
 * reported by the dev warning above rather than silently stacking.
 */

/**
 * Centre of the "fog of war" cutout, derived from the Welcome Center's marker
 * so it tracks the building automatically. Nudged slightly down so the circle
 * frames the icon and its label rather than just the icon.
 */
const veilStyle = computed(() => {
  const centre = markerCentre(WELCOME_ID)
  if (!centre) return {}
  return {
    '--veil-cx': `${centre.x}%`,
    '--veil-cy': `${centre.y - 0.5}%`,
  }
})

/**
 * The veil only appears once we know the real lock state. Without this gate the
 * live queries start empty (locked), so an already-unlocked returning user
 * would see the fog flash in and iris back open on every visit home.
 */
const statsReady = ref(false)
onMounted(async () => {
  await Promise.all([db.words.toArray(), db.wordProgress.toArray(), db.locationProgress.toArray()])
  statsReady.value = true
})
</script>

<template>
  <main class="home">
    <TreasureChest />

    <RouterLink class="settings-link" to="/settings" :aria-label="audioReady ? $t('home.settings') : $t('home.settingsAudioPending')">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
      <span v-if="!audioReady" class="settings-link__dot" aria-hidden="true" />
    </RouterLink>

    <header class="home-header">
      <div class="home-header__ornament" aria-hidden="true">
        <AppLogo />
      </div>
      <h1 class="home-header__title" aria-label="Lugʻatcha">
        <AppLogotype />
      </h1>
      <p class="home-header__subtitle" lang="uz">{{ $t('home.subtitle') }}</p>

      <button
        v-if="welcomeComplete && practicedToday"
        class="practice-btn practice-btn--continue"
        type="button"
        :aria-label="$t('home.continueAria')"
        @click="continueOpen = true"
      >
        <span class="practice-btn__icon" aria-hidden="true">🧭</span>
        <span class="practice-btn__label">{{ $t('home.continue') }}</span>
      </button>
      <RouterLink
        v-else-if="welcomeComplete"
        class="practice-btn"
        to="/practice"
        :aria-label="$t('home.practiceAria')"
      >
        <span class="practice-btn__icon" aria-hidden="true">🎯</span>
        <span class="practice-btn__label">{{ $t('home.practice') }}</span>
      </RouterLink>
      <!-- Still in Tourist Information onboarding: jump straight to the next activity. -->
      <RouterLink
        v-else-if="statsReady"
        class="practice-btn practice-btn--continue"
        :to="`/location/${WELCOME_ID}?start=1`"
        :aria-label="$t('home.continueLessonAria')"
      >
        <span class="practice-btn__icon" aria-hidden="true">🧭</span>
        <span class="practice-btn__label">{{ $t('home.continue') }}</span>
      </RouterLink>

      <p v-if="welcomeComplete && streak > 0" class="streak-line" :title="$t('home.streakDays', { count: streak })">
        <span class="streak-line__chips" aria-hidden="true">{{ streakSymbols }}</span>
        <span class="streak-line__label">{{ $t('home.streakDays', { count: streak }) }}</span>
      </p>
    </header>

    <div v-if="showBanner" class="audio-banner">
      <div class="audio-banner__body">
        <p class="audio-banner__text">{{ $t('home.audioBanner') }}</p>
        <button class="btn btn--primary audio-banner__btn" type="button" @click="router.push('/settings')">{{ $t('home.downloadAudio') }}</button>
      </div>
      <button class="audio-banner__close" type="button" :aria-label="$t('home.dismiss')" @click="dismissBanner">✕</button>
    </div>

    <div
      v-if="lockedNoticeVisible"
      class="locked-notice"
      :class="{ 'locked-notice--below-banner': showBanner }"
      role="alert"
      aria-live="polite"
    >
      <div class="locked-notice__icon" aria-hidden="true">⛔</div>
      <div class="locked-notice__body">
        <p class="locked-notice__title">{{ $t('home.lockedTitle') }}</p>
        <p class="locked-notice__text">{{ $t('home.lockedBody') }}</p>
      </div>
      <button class="locked-notice__close" type="button" :aria-label="$t('common.close')" @click="lockedNoticeVisible = false">✕</button>
    </div>

    <div v-if="sortedLocations.length" class="city-grid" role="list">
      <div class="city-grid__stage">
        <img class="city-grid__art" :src="homeCityMap" alt="" aria-hidden="true" />
        <template v-for="loc in sortedLocations" :key="loc.id">
          <SchoolTile
            v-if="loc.id === 'school'"
            role="listitem"
            :locked="!welcomeComplete"
            :style="markerStyle(loc.id)"
            @locked="showLockedNotice"
          />
          <TravelTile
            v-else-if="loc.id === 'travel'"
            role="listitem"
            :locked="!welcomeComplete"
            :style="markerStyle(loc.id)"
            @locked="showLockedNotice"
          />
          <LocationTile
            v-else
            role="listitem"
            :location="loc"
            :progress="progressMap.get(loc.id)"
            :locked="loc.id !== WELCOME_ID && !welcomeComplete"
            :exercise-emoji="
              loc.id === WELCOME_ID
                ? '📖'
                : welcomeComplete
                  ? (chipMap.get(loc.id) ?? undefined)
                  : undefined
            "
            :seen-words="wordStats.seen.get(loc.id) ?? 0"
            :total-words="wordStats.total.get(loc.id) ?? 0"
            :known-words="wordStats.known.get(loc.id) ?? 0"
            :style="markerStyle(loc.id)"
            @locked="showLockedNotice"
          />
        </template>

        <!--
          Fog of war: everything but the Welcome Center sits under a dimming
          veil with a soft circular cutout. When the Welcome Center is finished
          the veil irises open to reveal the whole city.
        -->
        <Transition name="reveal">
          <div
            v-if="statsReady && !welcomeComplete"
            class="city-grid__veil"
            :style="veilStyle"
            aria-hidden="true"
          />
        </Transition>
      </div>
    </div>

    <p v-else class="home-loading" aria-live="polite">{{ $t('home.loadingCity') }}</p>

    <ContinueLearning v-if="continueOpen" @close="continueOpen = false" />
  </main>
</template>

<style scoped>
.home {
  --home-map-bg: #dccba9;
  /*
   * Pinned to the viewport rather than laid out in flow: a flowed 100dvh
   * element still lets the document itself scroll when a mobile address bar
   * shrinks the visible area, which dragged the title off the top. Fixed +
   * inset:0 takes the page out of flow so there is nothing to scroll.
   */
  position: fixed;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem 1rem 1.5rem;
  background: var(--home-map-bg);
  overflow: hidden;
  overscroll-behavior: none;
}

.settings-link {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
  box-shadow: var(--shadow-sm);
  z-index: 4;
}

.settings-link svg {
  width: 19px;
  height: 19px;
}

.settings-link:hover {
  box-shadow: var(--shadow-md);
  color: var(--color-primary);
}

.settings-link__dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-terracotta);
  border: 2px solid var(--color-bg);
}

.audio-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  max-width: 520px;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  z-index: 3;
}

.audio-banner__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.audio-banner__text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.audio-banner__btn {
  align-self: flex-start;
  font-size: 0.85rem;
  padding: 0.4rem 0.9rem;
}

.audio-banner__close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: 0.1rem 0.25rem;
  cursor: pointer;
  line-height: 1;
}

.locked-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.65rem;
  width: min(92vw, 440px);
  padding: 0.75rem 0.85rem;
  border: 1.5px solid rgba(177, 67, 54, 0.35);
  border-left: 5px solid var(--color-terracotta);
  border-radius: var(--radius-md);
  background: rgba(255, 252, 240, 0.94);
  box-shadow: var(--shadow-lg);
  backdrop-filter: blur(8px) saturate(1.08);
  z-index: 5;
}

.locked-notice__icon {
  flex-shrink: 0;
  font-size: 1.15rem;
  line-height: 1.2;
}

.locked-notice__body {
  min-width: 0;
  flex: 1;
}

.locked-notice__title {
  margin: 0;
  font-size: 0.86rem;
  font-weight: 800;
  color: var(--color-terracotta);
  line-height: 1.15;
}

.locked-notice__text {
  margin: 0.15rem 0 0;
  font-size: 0.78rem;
  line-height: 1.35;
  color: var(--color-text);
}

.locked-notice__close {
  flex-shrink: 0;
  border: 0;
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  line-height: 1;
  padding: 0.12rem 0.18rem;
}

/* Header */
.home-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
  z-index: 3;
}

.home-header__ornament {
  width: 72px;
  height: 72px;
  margin-bottom: 0.1rem;
}

.home-header__title {
  margin: 0;
  /* Width drives the SVG logotype's rendered size (height scales via aspect ratio). */
  width: min(88vw, 370px);
  filter: drop-shadow(0 2px 2px rgba(37, 28, 18, 0.16));
}

.home-header__subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0;
}

.practice-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  margin-top: 0.6rem;
  padding: 0.45rem 0.95rem;
  border: 1.5px solid var(--color-primary);
  border-radius: 999px;
  background: var(--color-primary);
  color: #fff;
  font-size: 0.85rem;
  font-weight: 700;
  text-decoration: none;
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.practice-btn:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.practice-btn--continue {
  border-color: var(--color-teal);
  background: var(--color-teal);
  color: #fff;
  cursor: pointer;
}

.practice-btn__icon {
  font-size: 0.95rem;
  line-height: 1;
}

.streak-line {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.4rem 0 0;
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.streak-line__chips {
  font-size: 0.95rem;
  line-height: 1;
  letter-spacing: -0.04em;
}

/* Image-backed city map with location markers */
.city-grid {
  width: 100%;
  max-width: 620px;
  max-height: 100%;
  min-height: 0;
  flex-shrink: 1;
  aspect-ratio: 1122 / 1402;
  position: relative;
  overflow: hidden;
  /* No frame: the masked art fades straight into the matching background. */
  background: var(--home-map-bg);
  isolation: isolate;
}

/*
 * Always fade the map's top and bottom into the background, whatever the
 * pan/scale: a gradient in the exact background colour over the top and
 * bottom edges of the visible map, sitting above the art, tiles and fog.
 */
.city-grid::before,
.city-grid::after {
  content: '';
  position: absolute;
  left: 0;
  right: 0;
  height: clamp(96px, 19%, 190px);
  z-index: 5;
  pointer-events: none;
}

/*
 * Solid background colour right up to (and a little past) the map's hard edge,
 * then a taper into the map — a pure gradient only half-covers a high-contrast
 * edge, so the seam still showed through. The solid band sits below the tile
 * rows, so no tile is hidden.
 */
.city-grid::before {
  top: 0;
  background: linear-gradient(
    to bottom,
    var(--home-map-bg) 0%,
    var(--home-map-bg) 46%,
    rgba(220, 203, 169, 0) 100%
  );
}

.city-grid::after {
  bottom: 0;
  background: linear-gradient(
    to top,
    var(--home-map-bg) 0%,
    var(--home-map-bg) 46%,
    rgba(220, 203, 169, 0) 100%
  );
}

.city-grid__stage {
  position: absolute;
  inset: 0;
  /* Container so the veil's cutout radius (cqmin) scales with the map. */
  container-type: size;
}

/* Animatable so the fog can iris open; bare custom props don't transition. */
@property --veil-r {
  syntax: '<length>';
  inherits: false;
  initial-value: 0px;
}

.city-grid__veil {
  position: absolute;
  inset: 0;
  z-index: 4;
  /* Visual only: clicks fall through to the tiles (locked ones still
     surface the "not open yet" notice; the Welcome Center stays live). */
  pointer-events: none;
  --veil-cx: 26.8%;
  --veil-cy: 27.5%;
  --veil-r: 17cqmin;
  background: radial-gradient(
    circle var(--veil-r) at var(--veil-cx) var(--veil-cy),
    transparent 0,
    transparent 44%,
    rgba(255, 250, 235, 0.3) 50%,
    rgba(220, 203, 169, 0.82) 82%,
    rgba(212, 194, 158, 0.86) 100%
  );
}

/* Brand-new users: fade the fog in. */
.reveal-enter-active {
  transition: opacity 0.45s ease;
}
.reveal-enter-from {
  opacity: 0;
}

/* On unlock: the cutout expands past the edges, revealing the city. */
.reveal-leave-active {
  transition:
    --veil-r 0.9s cubic-bezier(0.4, 0, 0.2, 1),
    opacity 0.9s ease;
}
.reveal-leave-to {
  --veil-r: 180cqmin;
  opacity: 0;
}

@media (prefers-reduced-motion: reduce) {
  .reveal-enter-active,
  .reveal-leave-active {
    transition: opacity 0.3s ease;
  }
  .reveal-leave-to {
    --veil-r: 17cqmin;
  }
}

.city-grid__art {
  position: absolute;
  inset: 0;
  z-index: 0;
  width: 100%;
  height: 100%;
  object-fit: cover;
  pointer-events: none;
  user-select: none;
  /* Left/right fade (desktop); top/bottom is handled by .city-grid edges. */
  mask-image: linear-gradient(to right, transparent 0%, #000 9%, #000 91%, transparent 100%);
  -webkit-mask-image: linear-gradient(to right, transparent 0%, #000 9%, #000 91%, transparent 100%);
}

.city-grid :deep(.tile) {
  z-index: 3;
  position: absolute;
  transform: translate(-50%, -50%);
  justify-content: center;
  min-height: 0;
  padding: 5px 6px;
  gap: 2px;
  border-color: transparent;
  background: transparent;
  box-shadow: none;
  backdrop-filter: none;
}

.city-grid :deep(.tile:not(.tile--locked):hover) {
  transform: translate(-50%, calc(-50% - 3px)) scale(1.02);
  box-shadow: none;
}

.city-grid :deep(.tile--locked) {
  background: transparent;
  opacity: 0.82;
}

.city-grid :deep(.tile__ring-wrap),
.city-grid :deep(.tile__svg),
.city-grid :deep(.tile__icon-wrap) {
  width: 36px;
  height: 36px;
}

.city-grid :deep(.tile__icon-wrap) {
  display: flex;
}

.city-grid :deep(.tile__icon-wrap .tile__icon) {
  width: 30px;
  height: 30px;
}

.city-grid :deep(.tile__name) {
  font-size: 0.79rem;
  line-height: 1.05;
  margin-top: 0.22rem;
  white-space: normal;
  overflow: visible;
  text-overflow: clip;
  color: var(--color-text);
  text-shadow:
    -1px -1px 0 rgba(255, 252, 240, 0.95),
    1px -1px 0 rgba(255, 252, 240, 0.95),
    -1px 1px 0 rgba(255, 252, 240, 0.95),
    1px 1px 0 rgba(255, 252, 240, 0.95),
    0 2px 4px rgba(37, 28, 18, 0.35);
}

.city-grid :deep(.tile__icon--letter),
.city-grid :deep(.tile__icon--no-entry) {
  font-size: 1.2rem;
}

.city-grid :deep(.tile__name-uz) {
  display: none;
}

@media (max-width: 420px) {
  .city-grid :deep(.tile) {
    padding: 4px;
  }

  .city-grid :deep(.tile__ring-wrap),
  .city-grid :deep(.tile__svg),
  .city-grid :deep(.tile__icon-wrap) {
    width: 30px;
    height: 30px;
  }

  .city-grid :deep(.tile__name) {
    font-size: 0.68rem;
  }
}

@media (orientation: portrait) {
  .home {
    /* position: fixed; inset: 0 is inherited from the base rule. */
    padding: 0;
    gap: 0;
    overflow: hidden;
    background: var(--home-map-bg);
  }

  .home-header {
    position: absolute;
    top: max(0.8rem, env(safe-area-inset-top));
    left: 50%;
    transform: translateX(-50%);
    gap: 0;
  }

  .home-header__ornament {
    display: none;
  }

  /* Logotype floats over the map in portrait — cream halo for legibility. */
  .home-header__title {
    width: min(78vw, 300px);
    filter:
      drop-shadow(0 1px 1px rgba(255, 252, 240, 0.95))
      drop-shadow(0 1px 4px rgba(37, 28, 18, 0.35));
  }

  .home-header__subtitle {
    font-size: 0.72rem;
    text-shadow: 0 1px 2px rgba(255, 252, 240, 0.95);
  }

  .audio-banner {
    position: absolute;
    top: calc(max(0.8rem, env(safe-area-inset-top)) + 4.2rem);
    left: 1rem;
    right: 1rem;
    width: auto;
    max-width: none;
    padding: 0.7rem 0.8rem;
    background: rgba(255, 252, 240, 0.9);
    backdrop-filter: blur(7px) saturate(1.1);
  }

  .audio-banner__text {
    font-size: 0.78rem;
  }

  .audio-banner__btn {
    font-size: 0.78rem;
  }

  .locked-notice {
    position: absolute;
    top: calc(max(0.8rem, env(safe-area-inset-top)) + 4.2rem);
    left: 1rem;
    right: 1rem;
    width: auto;
  }

  .locked-notice--below-banner {
    top: calc(max(0.8rem, env(safe-area-inset-top)) + 11.2rem);
  }

  /*
   * Portrait: the map fills the screen and is panned to a focal point, since
   * the tall illustration can't fit a phone's aspect ratio without cropping.
   * --map-focus-x  horizontal point of the stage to centre on (panning)
   * --map-nudge-x  small manual offset on top of the focal point
   * --map-scale    overall zoom applied to the chosen stage width
   */
  .city-grid {
    position: fixed;
    inset: 0;
    --map-focus-x: 55%;
    --map-nudge-x: 16px;
    --map-scale: 0.9;
    width: 100vw;
    height: 100dvh;
    padding: 0;
    max-width: none;
    aspect-ratio: auto;
    border: none;
    border-radius: 0;
    box-shadow: none;
  }

  .city-grid__stage {
    position: absolute;
    flex: none;
    top: 50%;
    left: 50%;
    /*
     * Stage width = max(fill the width, but no wider than the smaller of:
     *   100dvh * 0.8003  — the width at which the map's full height fits
     *                      (0.8003 = 1122 / 1402, the art's aspect ratio), and
     *   100vw  * 1.62    — a cap on horizontal overflow so panning stays sane).
     * The whole thing is then zoomed by --map-scale.
     */
    width: calc(
      max(100vw, min(calc(100dvh * 0.8003), calc(100vw * 1.62))) * var(--map-scale)
    );
    height: auto;
    aspect-ratio: 1122 / 1402;
    transform: translate(calc(-1 * var(--map-focus-x) + var(--map-nudge-x)), -50%);
  }

  .city-grid :deep(.tile) {
    padding: 4px;
  }

  .city-grid :deep(.tile__ring-wrap),
  .city-grid :deep(.tile__svg),
  .city-grid :deep(.tile__icon-wrap) {
    width: 32px;
    height: 32px;
  }

  .city-grid :deep(.tile__name) {
    font-size: 0.73rem;
  }
}

@media (orientation: portrait) and (max-width: 420px) {
  .city-grid :deep(.tile__ring-wrap),
  .city-grid :deep(.tile__svg),
  .city-grid :deep(.tile__icon-wrap) {
    width: 30px;
    height: 30px;
  }

  .city-grid :deep(.tile__name) {
    font-size: 0.75rem;
  }
}

.home-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>
