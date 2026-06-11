<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLocation } from '@/db/locations'
import { useLiveQuery, db } from '@/db/useDb'
import type { Location, ExerciseType } from '@/db/types'
import {
  ACTIVITY_ORDER,
  EXERCISE_LABELS,
  EXERCISE_DESCRIPTIONS,
  buildPotluck,
  loadLocationStats,
  type LocationStats,
} from '@/exercises/potluck'
import { useProgressStore } from '@/stores/progress'
import { playChime } from '@/audio/audio'
import ExerciseLayout from '@/components/exercise/ExerciseLayout.vue'
import WordIntroExercise from '@/components/exercise/WordIntroExercise.vue'
import FlashcardsExercise from '@/components/exercise/FlashcardsExercise.vue'
import ListeningExercise from '@/components/exercise/ListeningExercise.vue'
import PhraseAssemblyExercise from '@/components/exercise/PhraseAssemblyExercise.vue'
import RoleplayExercise from '@/components/exercise/RoleplayExercise.vue'
import StorytimeExercise from '@/components/exercise/StorytimeExercise.vue'

const route = useRoute()
const router = useRouter()
const progressStore = useProgressStore()

const location = ref<Location | null>(null)
const activeExercise = ref<ExerciseType | null>(null)
/** Forces a fresh exercise instance on every launch (new word picks etc.). */
const sessionKey = ref(0)

const locationId = computed(() => route.params.id as string)

// Live: refreshes as word/exercise progress changes underneath
const stats = useLiveQuery<LocationStats | null>(
  () => loadLocationStats(db, route.params.id as string),
  null,
)

onMounted(async () => {
  // The School is a meta tile with its own view, not the potluck flow
  if (locationId.value === 'school') {
    router.replace('/school')
    return
  }
  const found = await getLocation(locationId.value)
  if (!found) {
    router.replace('/')
    return
  }
  location.value = found
})

const potluck = computed(() => (stats.value ? buildPotluck(stats.value) : []))
const allDone = computed(() => potluck.value.length > 0 && potluck.value.every((a) => a.done))

const EXERCISE_COMPONENTS = {
  intro: WordIntroExercise,
  flashcards: FlashcardsExercise,
  listening: ListeningExercise,
  'phrase-assembly': PhraseAssemblyExercise,
  roleplay: RoleplayExercise,
  storytime: StorytimeExercise,
} as const

function start(type: ExerciseType) {
  const activity = potluck.value.find((a) => a.type === type)
  if (!activity || (activity.state === 'locked' && !activity.done)) return
  sessionKey.value++
  activeExercise.value = type
}

async function onComplete() {
  playChime()
  if (activeExercise.value) {
    await progressStore.completeExercise(locationId.value, activeExercise.value)
  }
  activeExercise.value = null
}

function exitExercise() {
  activeExercise.value = null
}
</script>

<template>
  <!-- Active exercise -->
  <ExerciseLayout
    v-if="location && activeExercise"
    :exercise="activeExercise"
    :location-name="location.name.en"
    @exit="exitExercise"
  >
    <component
      :is="EXERCISE_COMPONENTS[activeExercise]"
      :key="`${activeExercise}-${sessionKey}`"
      :location-id="locationId"
      @complete="onComplete"
    />
  </ExerciseLayout>

  <!-- Location overview: today's potluck -->
  <main v-else class="location-view">
    <button class="back-btn" aria-label="Back to city map" type="button" @click="router.push('/')">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      City
    </button>

    <div v-if="location" class="location-body">
      <h1 class="location-name">{{ location.name.en }}</h1>
      <p class="location-name-uz" lang="uz">{{ location.name.uz }}</p>

      <p v-if="stats && stats.totalWords > 0" class="word-stats">
        <strong>{{ stats.seenWords }}</strong> of {{ stats.totalWords }} words met
        <template v-if="stats.knownWords > 0">
          · <strong>{{ stats.knownWords }}</strong> known</template
        >
      </p>

      <div v-if="allDone" class="complete-banner">
        <span class="complete-banner__emoji" aria-hidden="true">🏅</span>
        <p class="complete-banner__text">
          Barakalla! You've tried everything here. Replay any activity below.
        </p>
      </div>

      <ol class="potluck">
        <li v-for="activity in potluck" :key="activity.type">
          <button
            class="activity-card"
            :class="{
              'activity-card--locked': activity.state === 'locked' && !activity.done,
              'activity-card--done': activity.done,
            }"
            type="button"
            :disabled="activity.state === 'locked' && !activity.done"
            @click="start(activity.type)"
          >
            <span class="activity-card__marker" aria-hidden="true">
              <svg
                v-if="activity.done"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
              >
                <path d="M2.5 8l4 4 7-7" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              <svg
                v-else-if="activity.state === 'locked'"
                viewBox="0 0 16 16"
                fill="none"
                stroke="currentColor"
                stroke-width="1.5"
              >
                <rect x="2" y="7" width="12" height="8" rx="2" />
                <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke-linecap="round" />
              </svg>
              <span v-else>{{ ACTIVITY_ORDER.indexOf(activity.type) + 1 }}</span>
            </span>
            <span class="activity-card__text">
              <span class="activity-card__label">{{ EXERCISE_LABELS[activity.type] }}</span>
              <span class="activity-card__desc">{{ EXERCISE_DESCRIPTIONS[activity.type] }}</span>
              <span
                v-if="activity.state === 'locked' && !activity.done && activity.hint"
                class="activity-card__hint"
                >{{ activity.hint }}</span
              >
            </span>
            <span v-if="activity.done" class="activity-card__cta activity-card__cta--replay"
              >Replay</span
            >
            <span v-else-if="activity.state === 'available'" class="activity-card__cta">Start</span>
          </button>
        </li>
      </ol>
    </div>

    <p v-else class="loading" aria-live="polite">Loading…</p>
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
  gap: 0.4rem;
  width: 100%;
  max-width: 480px;
  margin: 0 auto;
}

.location-name {
  font-size: clamp(1.7rem, 6vw, 2.4rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
  text-align: center;
}

.location-name-uz {
  font-size: 1.05rem;
  color: var(--color-text-muted);
  margin: 0;
  text-align: center;
}

.word-stats {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0 0 0.75rem;
  text-align: center;
}

.word-stats strong {
  color: var(--color-primary);
}

.complete-banner {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  width: 100%;
  padding: 0.8rem 1rem;
  background: #fffcf0;
  border: 1.5px solid var(--color-gold);
  border-radius: var(--radius-md);
  margin-bottom: 0.5rem;
}

.complete-banner__emoji {
  font-size: 1.5rem;
}

.complete-banner__text {
  font-size: 0.88rem;
  color: var(--color-text);
  margin: 0;
}

.potluck {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
}

.activity-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  width: 100%;
  padding: 0.85rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.activity-card:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.activity-card--locked {
  opacity: 0.55;
  cursor: default;
  background: var(--color-bg);
}

.activity-card--done {
  border-color: var(--color-teal);
}

.activity-card__marker {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  flex-shrink: 0;
  font-size: 0.9rem;
  font-weight: 700;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  color: var(--color-text-muted);
}

.activity-card:not(:disabled):not(.activity-card--done) .activity-card__marker {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.activity-card--done .activity-card__marker {
  background: var(--color-teal);
  border-color: var(--color-teal);
  color: #fff;
}

.activity-card__marker svg {
  width: 14px;
  height: 14px;
}

.activity-card__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.activity-card__label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.activity-card__desc {
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.activity-card__hint {
  font-size: 0.72rem;
  font-style: italic;
  color: var(--color-terracotta);
  margin-top: 2px;
}

.activity-card__cta {
  flex-shrink: 0;
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: #fff;
  background: var(--color-primary);
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
}

.activity-card__cta--replay {
  background: transparent;
  color: var(--color-teal);
  border: 1px solid var(--color-teal);
}

.loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: auto;
}
</style>
