<script setup lang="ts">
import { ref, computed, defineAsyncComponent, nextTick, onMounted, onUnmounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { loadDailyPracticeData } from '@/exercises/words'
import {
  buildDailyPracticeSession,
  buildPracticeSessionQuestions,
  type PracticeQuestion,
} from '@/exercises/practice'
import { playChime } from '@/audio/sfx'
import { recordStreakDay, type StreakUpdate } from '@/streak'
import { useActivityContext } from '@/feedback/activityContext'
import { useSettingsStore } from '@/stores/settings'
import { i18n } from '@/i18n'
import TestExercise from '@/components/exercise/TestExercise.vue'
import StreakCelebration from '@/components/StreakCelebration.vue'
import BonusGame from '@/components/BonusGame.vue'

// Mirrors the key HomeView reads to show the "practised today" state.
const DAILY_PRACTICE_DATE_KEY = 'lugatcha.dailyPracticeDate'
// Timestamp of last completed practice — used by the router's hourly gate.
const LAST_PRACTICE_AT_KEY = 'lugatcha.lastPracticeAt'

const router = useRouter()
const route = useRoute()
const settings = useSettingsStore()

// True when the router redirected here as a mandatory gate before the city.
const isRequired = computed(() => route.query.required === '1')

const questions = ref<PracticeQuestion[] | null>(null)

// Set when a finished session grows the streak, driving the celebration overlay.
const celebration = ref<StreakUpdate | null>(null)

// The mini-game that rewards a finished session (after any streak
// celebration), for learners who have opted into it in Settings. Which game it
// is, is picked at random. Closing it takes the learner home.
const game = ref(false)

// Kept out of the practice chunk: most sessions never open it.
const SettingsPanel = defineAsyncComponent(() => import('@/components/SettingsPanel.vue'))

// Settings, opened over the session rather than navigated to. Daily practice
// can be mandatory — the router holds the learner here until it is done — so a
// link out to /settings would either be blocked or throw away a half-finished
// session. Overlaying keeps the questions and their answers alive underneath.
const settingsOpen = ref(false)
const settingsSheet = ref<HTMLElement | null>(null)
const settingsButton = ref<HTMLButtonElement | null>(null)

// Move focus into the sheet and back out again, so a keyboard or screen-reader
// learner is not left tabbing through the questions hidden behind it.
watch(settingsOpen, async (open) => {
  await nextTick()
  if (open) settingsSheet.value?.focus()
  else settingsButton.value?.focus()
})

// Scope any "Raise an issue" report to the daily practice session.
useActivityContext(() => ({
  label: `Daily practice · ${i18n.global.t('practice.title')}`,
  details: [{ label: 'Questions', value: String(questions.value?.length ?? 0) }],
}))

async function loadQuestions() {
  questions.value = null
  const data = await loadDailyPracticeData()
  const items = buildDailyPracticeSession(data)
  questions.value = buildPracticeSessionQuestions(items, data.allWords, data.phrases)
}

onMounted(() => {
  void loadQuestions()
  window.addEventListener('keydown', onKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
})

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && settingsOpen.value) settingsOpen.value = false
}

// Resetting progress from the panel wipes the very history this session's
// questions were drawn from, so build a fresh one from what is left.
function onProgressReset() {
  void loadQuestions()
}

function recordPracticeAt() {
  try {
    localStorage.setItem(LAST_PRACTICE_AT_KEY, String(Date.now()))
  } catch {
    // private mode
  }
}

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
  recordPracticeAt()
  const update = recordStreakDay()
  // Celebrate a growing streak first, then hand over to the game if it is on.
  if (update.extended) {
    celebration.value = update
  } else {
    finishSession()
  }
}

function finishSession() {
  if (settings.miniGames) {
    game.value = true
  } else {
    home()
  }
}

function onCelebrationDone() {
  celebration.value = null
  finishSession()
}

function onGameDone() {
  game.value = false
  home()
}

function onEmptyBack() {
  // No questions available — record practice anyway so the router gate doesn't
  // loop. (Empty state is only reachable when there is nothing left to drill.)
  recordPracticeAt()
  recordStreakDay()
  home()
}
</script>

<template>
  <div class="practice">
    <header class="practice-header">
      <button v-if="!isRequired" class="exit-btn" :aria-label="$t('common.backToCity')" type="button" @click="home">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="practice-header__titles" :class="{ 'practice-header__titles--full': isRequired }">
        <span class="practice-header__eyebrow">{{ $t('practice.eyebrow') }}</span>
        <h1 class="practice-header__title">{{ $t('practice.title') }}</h1>
      </div>
      <button
        ref="settingsButton"
        class="settings-btn"
        :aria-label="$t('practice.settings')"
        :aria-expanded="settingsOpen"
        type="button"
        @click="settingsOpen = true"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true">
          <circle cx="12" cy="12" r="3" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
          />
        </svg>
      </button>
      <span class="practice-header__icon" aria-hidden="true">🎯</span>
    </header>

    <div class="practice-body">
      <p v-if="questions === null" class="practice-loading" aria-live="polite">{{ $t('common.loading') }}</p>

      <div v-else-if="questions.length === 0" class="practice-empty">
        <span class="practice-empty__icon" aria-hidden="true">🗺️</span>
        <p class="practice-empty__text">{{ $t('practice.empty') }}</p>
        <button class="btn btn--primary" type="button" @click="onEmptyBack">{{ $t('common.backToCity') }}</button>
      </div>

      <TestExercise v-else :preset-questions="questions" @complete="onComplete" />
    </div>

    <StreakCelebration
      v-if="celebration"
      :from="celebration.from"
      :to="celebration.to"
      @done="onCelebrationDone"
    />

    <BonusGame v-if="game" @done="onGameDone" />

    <div
      v-if="settingsOpen"
      ref="settingsSheet"
      class="settings-sheet"
      role="dialog"
      aria-modal="true"
      tabindex="-1"
      :aria-label="$t('settings.title')"
    >
      <div class="settings-sheet__inner">
        <SettingsPanel @progress-reset="onProgressReset">
          <template #nav>
            <button class="settings-sheet__back" type="button" @click="settingsOpen = false">
              <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
                <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
              </svg>
              {{ $t('practice.backToPractice') }}
            </button>
          </template>
        </SettingsPanel>
      </div>
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

.practice-header__titles--full {
  padding-left: 0.25rem;
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

.settings-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.settings-btn svg {
  width: 18px;
  height: 18px;
}

.settings-btn:hover {
  color: var(--color-primary);
}

/* Settings over the top of the session, so the questions survive the detour. */
.settings-sheet {
  position: fixed;
  inset: 0;
  z-index: 20;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--color-bg);
  padding: 1rem 1.25rem calc(4rem + env(safe-area-inset-bottom));
}

.settings-sheet:focus {
  outline: none;
}

.settings-sheet__inner {
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
}

.settings-sheet__back {
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

.settings-sheet__back svg {
  width: 16px;
  height: 16px;
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
