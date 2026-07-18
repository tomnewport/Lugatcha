<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLocation } from '@/db/locations'
import { useLiveQuery, db } from '@/db/useDb'
import type { Location, ExerciseType } from '@/db/types'
import {
  loadLocationStats,
  selectAutoExercise,
  exerciseLabel,
  type LocationStats,
} from '@/exercises/potluck'
import { useActivityContext } from '@/feedback/activityContext'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import { playChime } from '@/audio/audio'
import { WELCOME_CENTER_ID } from '@/db/progress'
import ExerciseLayout from '@/components/exercise/ExerciseLayout.vue'
import LocationMenu from '@/components/LocationMenu.vue'
import WelcomeInduction from '@/components/WelcomeInduction.vue'
import WordIntroExercise from '@/components/exercise/WordIntroExercise.vue'
import FlashcardsExercise from '@/components/exercise/FlashcardsExercise.vue'
import ListeningExercise from '@/components/exercise/ListeningExercise.vue'
import PhraseAssemblyExercise from '@/components/exercise/PhraseAssemblyExercise.vue'
import RoleplayExercise from '@/components/exercise/RoleplayExercise.vue'
import StorytimeExercise from '@/components/exercise/StorytimeExercise.vue'
import TestExercise from '@/components/exercise/TestExercise.vue'

const LAST_TRIED_KEY = 'lugatcha.lastTriedLocation'

const route = useRoute()
const router = useRouter()
const progressStore = useProgressStore()
const { name } = useContentLang()

const location = ref<Location | null>(null)
const activeExercise = ref<ExerciseType | null>(null)
const sessionKey = ref(0)

/**
 * Continue Learning launches a location with `?chain=N`, asking for N activities
 * back-to-back before returning to the city. `chainTotal` is that N (for the
 * "2 of 3" header); `chainRemaining` counts down as each activity finishes.
 * When zero, the location is a menu the learner picks from instead.
 */
const chainTotal = ref(0)
const chainRemaining = ref(0)

const locationId = computed(() => route.params.id as string)
const isWelcome = computed(() => locationId.value === WELCOME_CENTER_ID)
const chaining = computed(() => chainRemaining.value > 0)

// Parse the chain length synchronously in setup so it's known before the stats
// watch first fires — otherwise a fast liveQuery could resolve before an async
// onMounted set it, and the chain would never auto-launch.
const initialChain = parseInt((route.query.chain as string) ?? '', 10)
if (Number.isFinite(initialChain) && initialChain > 0) {
  chainTotal.value = initialChain
  chainRemaining.value = initialChain
}

const stats = useLiveQuery<LocationStats | null>(
  () => loadLocationStats(db, route.params.id as string),
  null,
)

onMounted(async () => {
  if (locationId.value === 'school') {
    router.replace('/school')
    return
  }
  if (locationId.value === 'travel') {
    router.replace('/travel')
    return
  }
  const found = await getLocation(locationId.value)
  if (!found) {
    router.replace('/')
    return
  }
  location.value = found
  try {
    localStorage.setItem(LAST_TRIED_KEY, locationId.value)
  } catch {
    // private mode
  }
})

/** The activity the location menu recommends next (its highlighted card). */
const suggested = computed(() => (stats.value ? selectAutoExercise(stats.value) : null))

// A chained visit (Continue Learning) auto-launches each activity in turn; the
// Welcome Center runs its own induction; every other visit is a menu the learner
// chooses from, so nothing auto-launches there.
watch(
  stats,
  (newStats) => {
    if (activeExercise.value || !newStats || isWelcome.value || !chaining.value) return
    const next = selectAutoExercise(newStats, { chain: true })
    if (next) {
      sessionKey.value++
      activeExercise.value = next
    } else {
      // Nothing left to serve — drop the chain and fall through to the menu.
      chainRemaining.value = 0
    }
  },
  { immediate: true },
)

/** The Welcome Center induction (and the location menu) launch a chosen activity. */
function startWelcomeActivity(type: ExerciseType) {
  sessionKey.value++
  activeExercise.value = type
}

const EXERCISE_COMPONENTS = {
  intro: WordIntroExercise,
  flashcards: FlashcardsExercise,
  listening: ListeningExercise,
  'phrase-assembly': PhraseAssemblyExercise,
  roleplay: RoleplayExercise,
  storytime: StorytimeExercise,
  test: TestExercise,
} as const

async function onComplete() {
  playChime()
  const finished = activeExercise.value
  // Normally Learn Vocabulary is a recurring activity and never marked
  // permanently done. The Welcome Center is the exception: one finished session
  // (like every other activity) is required to graduate, so record it there.
  if (finished && (isWelcome.value || finished !== 'test')) {
    await progressStore.completeExercise(locationId.value, finished)
  }
  // Every finished exercise advances the rotation so the next visit varies.
  if (finished) {
    await progressStore.recordLocationVisit(locationId.value)
  }
  // The Welcome Center returns to its induction screen so the learner sees their
  // updated progress and can continue (or, once done, head into the city).
  if (isWelcome.value) {
    activeExercise.value = null
    return
  }

  // A Continue Learning chain runs the next few activities back-to-back.
  if (chaining.value) {
    chainRemaining.value--
    if (chainRemaining.value > 0) {
      // Read fresh stats — the just-recorded visit advances the rotation — and
      // launch the next activity in the chain.
      const fresh = await loadLocationStats(db, locationId.value)
      const next = selectAutoExercise(fresh, { chain: true })
      if (next) {
        sessionKey.value++
        activeExercise.value = next
        return
      }
    }
    router.push('/')
    return
  }

  // A single activity chosen from the location menu: return to the menu so the
  // learner sees updated progress and can pick what to do next.
  activeExercise.value = null
}

function exitExercise() {
  // Leaving a Welcome Center session drops back to its induction screen.
  if (isWelcome.value) {
    activeExercise.value = null
    return
  }
  // Bailing out of a chain abandons the rest of it and returns to the city.
  if (chaining.value) {
    chainRemaining.value = 0
    router.push('/')
    return
  }
  // Otherwise drop back to the location menu.
  activeExercise.value = null
}

/** 1-based position of the current activity within a Continue Learning chain. */
const chainStep = computed(() =>
  chainTotal.value > 0 ? chainTotal.value - chainRemaining.value + 1 : 0,
)

// Describe what the learner is doing here so "Raise an issue" can scope a report
// to this exact activity (which location, which exercise) rather than the app as
// a whole.
useActivityContext(() => {
  if (!location.value) return null
  const locationName = name(location.value.name)
  if (activeExercise.value) {
    return {
      label: `${exerciseLabel(activeExercise.value)} · ${locationName}`,
      details: [
        { label: 'Location', value: locationName },
        { label: 'Location ID', value: locationId.value },
        { label: 'Exercise', value: exerciseLabel(activeExercise.value) },
        { label: 'Exercise type', value: activeExercise.value },
      ],
    }
  }
  return {
    label: locationName,
    details: [
      { label: 'Location', value: locationName },
      { label: 'Location ID', value: locationId.value },
      { label: 'Screen', value: isWelcome.value ? 'Welcome Center induction' : 'Location menu' },
    ],
  }
})
</script>

<template>
  <!--
    Single stable root. App.vue's route <Transition> animates this view's root
    element; if the root swapped between the exercise, induction, menu, and
    loading branches, the transition would latch onto the swapped-in element
    and strand it in its enter-from state (position: fixed, translated a full
    viewport off-screen) — a blank page where nothing is tappable.
  -->
  <div class="location-screen">
  <!-- Active exercise -->
  <ExerciseLayout
    v-if="location && activeExercise"
    :exercise="activeExercise"
    :location-name="name(location.name)"
    :chain-step="chainStep"
    :chain-total="chainTotal"
    @exit="exitExercise"
  >
    <component
      :is="EXERCISE_COMPONENTS[activeExercise]"
      :key="`${activeExercise}-${sessionKey}`"
      :location-id="locationId"
      @complete="onComplete"
    />
  </ExerciseLayout>

  <!-- Welcome Center induction: explains the city, then guides through each activity -->
  <WelcomeInduction v-else-if="location && isWelcome" @start="startWelcomeActivity" />

  <!-- Location menu: opened from the city map, the learner picks what to do -->
  <LocationMenu
    v-else-if="location && stats && !chaining"
    :location="location"
    :stats="stats"
    :suggested="suggested"
    @select="startWelcomeActivity"
    @back="router.push('/')"
  />

  <!-- Loading (also the brief gap between chained activities) -->
  <main v-else class="location-view">
    <p class="loading" aria-live="polite">{{ $t('common.loading') }}</p>
  </main>
  </div>
</template>

<style scoped>
.location-view {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem 2rem;
  background: var(--color-bg);
  gap: 1.25rem;
}

.loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: auto;
}
</style>
