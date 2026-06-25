<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadDailyPracticeData } from '@/exercises/words'
import { selectDailyPracticePairs, buildQuestionsFromPairs, type TestQuestion } from '@/exercises/test'
import { playChime } from '@/audio/audio'
import TestExercise from '@/components/exercise/TestExercise.vue'

// Mirrors the key HomeView reads to show the "practised today" state.
const DAILY_PRACTICE_DATE_KEY = 'lugatcha.dailyPracticeDate'

const router = useRouter()
const questions = ref<TestQuestion[] | null>(null)

onMounted(async () => {
  const { seenWords, allWords, progress } = await loadDailyPracticeData()
  const pairs = selectDailyPracticePairs(seenWords, progress)
  questions.value = buildQuestionsFromPairs(pairs, allWords)
})

function home() {
  router.push('/')
}

function onComplete() {
  playChime()
  try {
    // Local date (not UTC) so "today" matches the learner's calendar day.
    const today = new Date().toLocaleDateString('en-CA')
    localStorage.setItem(DAILY_PRACTICE_DATE_KEY, today)
  } catch {
    // private mode
  }
  home()
}
</script>

<template>
  <div class="practice">
    <header class="practice-header">
      <button class="exit-btn" :aria-label="$t('common.backToCity')" type="button" @click="home">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="practice-header__titles">
        <span class="practice-header__eyebrow">{{ $t('practice.eyebrow') }}</span>
        <h1 class="practice-header__title">{{ $t('practice.title') }}</h1>
      </div>
      <span class="practice-header__icon" aria-hidden="true">🎯</span>
    </header>

    <div class="practice-body">
      <p v-if="questions === null" class="practice-loading" aria-live="polite">{{ $t('common.loading') }}</p>

      <div v-else-if="questions.length === 0" class="practice-empty">
        <span class="practice-empty__icon" aria-hidden="true">🗺️</span>
        <p class="practice-empty__text">{{ $t('practice.empty') }}</p>
        <button class="btn btn--primary" type="button" @click="home">{{ $t('common.backToCity') }}</button>
      </div>

      <TestExercise v-else :preset-questions="questions" @complete="onComplete" />
    </div>
  </div>
</template>

<style scoped>
.practice {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.practice-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border-bottom: 1.5px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 5;
}

.exit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  flex-shrink: 0;
}

.exit-btn svg {
  width: 16px;
  height: 16px;
}

.practice-header__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.practice-header__eyebrow {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.practice-header__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.practice-header__icon {
  font-size: 1.5rem;
  flex-shrink: 0;
}

.practice-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1rem calc(4.5rem + env(safe-area-inset-bottom));
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.practice-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.practice-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.9rem;
  text-align: center;
  margin: 2rem auto 0;
  max-width: 360px;
}

.practice-empty__icon {
  font-size: 2.5rem;
}

.practice-empty__text {
  font-size: 0.95rem;
  color: var(--color-text-muted);
  margin: 0;
  line-height: 1.5;
}
</style>
