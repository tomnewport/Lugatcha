<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLocation } from '@/db/locations'
import { useLiveQuery, db } from '@/db/useDb'
import type { Location, ExerciseType } from '@/db/types'
import {
  buildPotluck,
  loadLocationStats,
  selectAutoExercise,
  type LocationStats,
} from '@/exercises/potluck'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import { playChime } from '@/audio/audio'
import { WELCOME_CENTER_ID } from '@/db/progress'
import ExerciseLayout from '@/components/exercise/ExerciseLayout.vue'
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

const locationId = computed(() => route.params.id as string)
const isWelcome = computed(() => locationId.value === WELCOME_CENTER_ID)

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

const potluck = computed(() => (stats.value ? buildPotluck(stats.value) : []))

// Auto-launch the visit's exercise once stats load (only if no exercise is running).
// The Welcome Center is the city's onboarding gate: instead of auto-launching, it
// opens on its induction screen, which then starts the basic-vocabulary intro.
watch(
  stats,
  (newStats) => {
    if (activeExercise.value || !newStats || isWelcome.value) return
    const next = selectAutoExercise(newStats)
    if (next) {
      sessionKey.value++
      activeExercise.value = next
    }
  },
  { immediate: true },
)

/** The Welcome Center only ever teaches its own basics. */
function startWelcomeVocab() {
  sessionKey.value++
  activeExercise.value = 'intro'
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
  // The Test is a recurring activity — it never gets marked permanently done,
  // so it stays on the table for repeated learning and re-testing.
  if (activeExercise.value && activeExercise.value !== 'test') {
    await progressStore.completeExercise(locationId.value, activeExercise.value)
  }
  // Every finished exercise advances the rotation so the next visit varies.
  if (activeExercise.value) {
    await progressStore.recordLocationVisit(locationId.value)
  }
  // The Welcome Center returns to its induction screen so the learner sees their
  // updated progress and can continue (or, once done, head into the city).
  if (isWelcome.value) {
    activeExercise.value = null
    return
  }
  router.push('/')
}

function exitExercise() {
  // Leaving a Welcome Center session drops back to its induction screen.
  if (isWelcome.value) {
    activeExercise.value = null
    return
  }
  router.push('/')
}
</script>

<template>
  <!-- Active exercise -->
  <ExerciseLayout
    v-if="location && activeExercise"
    :exercise="activeExercise"
    :location-name="name(location.name)"
    @exit="exitExercise"
  >
    <component
      :is="EXERCISE_COMPONENTS[activeExercise]"
      :key="`${activeExercise}-${sessionKey}`"
      :location-id="locationId"
      @complete="onComplete"
    />
  </ExerciseLayout>

  <!-- Welcome Center induction: explains the city, then teaches the basics -->
  <WelcomeInduction v-else-if="location && isWelcome" @start="startWelcomeVocab" />

  <!-- Fallback: nothing available at this location -->
  <main v-else-if="location && stats && potluck.every(a => a.state === 'locked')" class="location-view">
    <button class="back-btn" :aria-label="$t('common.backToCity')" type="button" @click="router.push('/')">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ $t('common.city') }}
    </button>
    <div class="location-body">
      <h1 class="location-name">{{ name(location.name) }}</h1>
      <p class="location-name-uz" lang="uz">{{ location.name.uz }}</p>
      <p class="nothing-here">
        {{ $t('location.nothingNew') }}
      </p>
      <p class="nothing-hint" v-if="potluck.find(a => a.state === 'locked' && a.hint)">
        {{ potluck.find(a => a.state === 'locked' && a.hint)?.hint }}
      </p>
    </div>
  </main>

  <!-- Loading -->
  <main v-else class="location-view">
    <p class="loading" aria-live="polite">{{ $t('common.loading') }}</p>
  </main>
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

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.back-btn:hover {
  box-shadow: var(--shadow-md);
}

.location-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  max-width: 480px;
  margin: 2rem auto 0;
  text-align: center;
}

.location-name {
  font-size: clamp(1.7rem, 6vw, 2.4rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.location-name-uz {
  font-size: 1.05rem;
  color: var(--color-text-muted);
  margin: 0;
}

.nothing-here {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: 0.75rem 0 0;
}

.nothing-hint {
  font-size: 0.82rem;
  color: var(--color-terracotta);
  font-style: italic;
  margin: 0;
}

.loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: auto;
}
</style>
