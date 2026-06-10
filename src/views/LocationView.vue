<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLocation } from '@/db/locations'
import { useLocationProgress } from '@/db/useDb'
import { useProgressStore, EXERCISE_SEQUENCE, nextExercise } from '@/stores/progress'
import type { Location, ExerciseType } from '@/db/types'
import ExerciseLayout from '@/components/ExerciseLayout.vue'
import IntroExercise from '@/exercises/IntroExercise.vue'
import FlashcardsExercise from '@/exercises/FlashcardsExercise.vue'
import PhraseAssemblyExercise from '@/exercises/PhraseAssemblyExercise.vue'
import RoleplayExercise from '@/exercises/RoleplayExercise.vue'
import StorytimeExercise from '@/exercises/StorytimeExercise.vue'

const route = useRoute()
const router = useRouter()
const progressStore = useProgressStore()

const locationId = route.params.id as string
const location = ref<Location | null>(null)

onMounted(async () => {
  const found = await getLocation(locationId)
  if (!found) {
    router.replace('/')
    return
  }
  location.value = found
})

const progress = useLocationProgress(locationId)

const currentExercise = computed<ExerciseType | null>(() => nextExercise(progress.value))

const stepIndex = computed(() =>
  currentExercise.value ? EXERCISE_SEQUENCE.indexOf(currentExercise.value) : EXERCISE_SEQUENCE.length,
)

const isComplete = computed(() => currentExercise.value === null)

async function onExerciseComplete() {
  if (currentExercise.value) {
    await progressStore.completeExercise(locationId, currentExercise.value)
  }
}

function goHome() {
  router.push('/')
}
</script>

<template>
  <!-- Loading state before location metadata arrives -->
  <div v-if="!location" class="loading-screen" aria-live="polite">
    Loading…
  </div>

  <ExerciseLayout
    v-else
    :location-name="location.name.en"
    :location-name-uz="location.name.uz"
    :step-index="stepIndex"
  >
    <!-- Completion screen -->
    <div v-if="isComplete" class="completion">
      <div class="completion__ornament" aria-hidden="true">
        <svg viewBox="0 0 64 64" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="32" cy="32" r="28" />
          <path d="M18 32l10 10 18-18" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </div>
      <h2 class="completion__title">All done!</h2>
      <p class="completion__sub">You've completed all exercises for {{ location.name.en }}.</p>
      <p class="completion__sub-uz" lang="uz">{{ location.name.uz }}</p>
      <button class="completion__btn" @click="goHome">Back to City</button>
    </div>

    <!-- Active exercises -->
    <IntroExercise
      v-else-if="currentExercise === 'intro'"
      :location-id="locationId"
      @complete="onExerciseComplete"
    />
    <FlashcardsExercise
      v-else-if="currentExercise === 'flashcards'"
      :location-id="locationId"
      @complete="onExerciseComplete"
    />
    <PhraseAssemblyExercise
      v-else-if="currentExercise === 'phrase-assembly'"
      :location-id="locationId"
      @complete="onExerciseComplete"
    />
    <RoleplayExercise
      v-else-if="currentExercise === 'roleplay'"
      :location-id="locationId"
      @complete="onExerciseComplete"
    />
    <StorytimeExercise
      v-else-if="currentExercise === 'storytime'"
      :location-id="locationId"
      @complete="onExerciseComplete"
    />
  </ExerciseLayout>
</template>

<style scoped>
.loading-screen {
  min-height: 100dvh;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  background: var(--color-bg);
}

/* Completion */
.completion {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.75rem;
  flex: 1;
  text-align: center;
  padding-top: 2rem;
}

.completion__ornament {
  width: 72px;
  height: 72px;
  color: var(--color-gold);
  margin-bottom: 0.5rem;
}

.completion__title {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.completion__sub {
  font-size: 0.95rem;
  color: var(--color-text-muted);
  max-width: 280px;
  margin: 0;
}

.completion__sub-uz {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0;
}

.completion__btn {
  margin-top: 1.5rem;
  padding: 0.85rem 2rem;
  background: var(--color-primary);
  color: white;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  width: 100%;
  max-width: 320px;
}

.completion__btn:hover {
  opacity: 0.88;
}
</style>
