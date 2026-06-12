<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getTravelPlace, recordTravelVisit } from '@/db/travel'
import { useLiveQuery, db } from '@/db/useDb'
import type { TravelPlace, ExerciseType } from '@/db/types'
import { loadLocationStats, selectAutoExercise, type LocationStats } from '@/exercises/potluck'
import { useProgressStore } from '@/stores/progress'
import { playChime } from '@/audio/audio'
import ExerciseLayout from '@/components/exercise/ExerciseLayout.vue'
import WordIntroExercise from '@/components/exercise/WordIntroExercise.vue'
import FlashcardsExercise from '@/components/exercise/FlashcardsExercise.vue'
import ListeningExercise from '@/components/exercise/ListeningExercise.vue'
import PhraseAssemblyExercise from '@/components/exercise/PhraseAssemblyExercise.vue'
import RoleplayExercise from '@/components/exercise/RoleplayExercise.vue'
import StorytimeExercise from '@/components/exercise/StorytimeExercise.vue'
import TestExercise from '@/components/exercise/TestExercise.vue'

const route = useRoute()
const router = useRouter()
const progressStore = useProgressStore()

const place = ref<TravelPlace | null>(null)
const phase = ref<'article' | 'exercise'>('article')
const activeExercise = ref<ExerciseType | null>(null)
const sessionKey = ref(0)

const placeId = computed(() => route.params.id as string)

const stats = useLiveQuery<LocationStats | null>(
  () => loadLocationStats(db, route.params.id as string),
  null,
)

onMounted(async () => {
  const found = await getTravelPlace(placeId.value)
  if (!found) {
    router.replace('/travel')
    return
  }
  place.value = found
  // "Disabled once clicked": opening the place counts as a visit.
  recordTravelVisit(placeId.value)
})

const EXERCISE_COMPONENTS = {
  intro: WordIntroExercise,
  flashcards: FlashcardsExercise,
  listening: ListeningExercise,
  'phrase-assembly': PhraseAssemblyExercise,
  roleplay: RoleplayExercise,
  storytime: StorytimeExercise,
  test: TestExercise,
} as const

function startExercise() {
  const next = stats.value ? selectAutoExercise(stats.value) : null
  if (!next) {
    router.push('/travel')
    return
  }
  sessionKey.value++
  activeExercise.value = next
  phase.value = 'exercise'
}

async function onComplete() {
  playChime()
  // Like a normal location, the Test stays replayable and is never retired.
  if (activeExercise.value && activeExercise.value !== 'test') {
    await progressStore.completeExercise(placeId.value, activeExercise.value)
  }
  // Every finished exercise advances the rotation so the next visit varies.
  if (activeExercise.value) {
    await progressStore.recordLocationVisit(placeId.value)
  }
  router.push('/travel')
}
</script>

<template>
  <!-- The exercise, once started -->
  <ExerciseLayout
    v-if="place && phase === 'exercise' && activeExercise"
    :exercise="activeExercise"
    :location-name="place.name.en"
    @exit="router.push('/travel')"
  >
    <component
      :is="EXERCISE_COMPONENTS[activeExercise]"
      :key="`${activeExercise}-${sessionKey}`"
      :location-id="placeId"
      @complete="onComplete"
    />
  </ExerciseLayout>

  <!-- The article -->
  <main v-else-if="place" class="place">
    <button class="back-btn" aria-label="Back to map" type="button" @click="router.push('/travel')">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      Map
    </button>

    <article class="place-article">
      <h1 class="place-article__name">{{ place.name.en }}</h1>
      <p class="place-article__name-uz" lang="uz">{{ place.name.uz }}</p>
      <p v-for="(para, i) in place.article" :key="i" class="place-article__para">{{ para }}</p>
    </article>

    <div class="place-footer">
      <button class="btn btn--primary" type="button" @click="startExercise">Start the exercise</button>
    </div>
  </main>

  <main v-else class="place">
    <p class="place-loading" aria-live="polite">Loading…</p>
  </main>
</template>

<style scoped>
.place {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem 2rem;
  gap: 1.25rem;
  background: var(--color-bg);
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

.place-article {
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.place-article__name {
  font-size: clamp(1.7rem, 6vw, 2.3rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.place-article__name-uz {
  font-size: 1rem;
  color: var(--color-text-muted);
  margin: 0.15rem 0 1rem;
}

.place-article__para {
  font-size: 1rem;
  line-height: 1.65;
  color: var(--color-text);
  margin: 0 0 0.9rem;
}

.place-footer {
  position: sticky;
  bottom: 0;
  width: 100%;
  max-width: 560px;
  margin: auto auto 0;
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
}

.place-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: auto;
}
</style>
