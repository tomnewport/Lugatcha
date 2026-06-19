<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useLiveQuery, db } from '@/db/useDb'
import { WELCOME_CENTER_ID } from '@/db/progress'
import { isWordLearned } from '@/exercises/test'
import {
  buildPotluck,
  loadLocationStats,
  exerciseLabel,
  exerciseDescription,
  type LocationStats,
} from '@/exercises/potluck'
import type { ExerciseType } from '@/db/types'

/**
 * The city's front door. It inducts a new learner — explaining how an area of
 * the city works — and then walks them through completing one, activity by
 * activity (meeting the basics, the practice exercises, and the exam) before the
 * rest of the city opens. It stays available afterwards to re-sit any of them.
 */
const emit = defineEmits<{ start: [type: ExerciseType] }>()

const router = useRouter()

const stats = useLiveQuery<LocationStats | null>(
  () => loadLocationStats(db, WELCOME_CENTER_ID),
  null,
)

// The Exam is only "done" once every word is learned — identified and spelled,
// i.e. all three test question types passed. Tracked separately from the stats'
// flashcard-based "known" count.
const learned = useLiveQuery(
  async () => {
    const words = await db.words.where('theme').equals(WELCOME_CENTER_ID).toArray()
    const progress = await db.wordProgress.bulkGet(words.map((w) => w.id))
    return { learned: progress.filter((p) => isWordLearned(p)).length, total: words.length }
  },
  { learned: 0, total: 0 },
)

const EMOJI: Record<ExerciseType, string> = {
  intro: '📝',
  flashcards: '🃏',
  listening: '🎧',
  'phrase-assembly': '🔤',
  roleplay: '🤝',
  storytime: '📖',
  test: '🎯',
}

interface Step {
  type: ExerciseType
  state: 'available' | 'locked'
  done: boolean
  hint?: string
}

const allWordsSeen = computed(() => {
  const s = stats.value
  return !!s && s.totalWords > 0 && s.seenWords >= s.totalWords
})

const allWordsLearned = computed(
  () => learned.value.total > 0 && learned.value.learned >= learned.value.total,
)

const steps = computed<Step[]>(() => {
  const s = stats.value
  if (!s) return []
  return buildPotluck(s).map((a) => {
    // New Words is "done" only once every basic word has been met, and stays
    // launchable so the learner can keep meeting words (or review later).
    if (a.type === 'intro') {
      return { type: a.type, state: 'available', done: allWordsSeen.value }
    }
    // The Exam is "done" only once every word is learned, not after one sitting.
    if (a.type === 'test') {
      return { type: a.type, state: a.state, done: allWordsLearned.value, hint: a.hint }
    }
    return { type: a.type, state: a.state, done: a.done, hint: a.hint }
  })
})

const doneCount = computed(() => steps.value.filter((s) => s.done).length)
const complete = computed(() => steps.value.length > 0 && steps.value.every((s) => s.done))

function canLaunch(step: Step): boolean {
  return step.state === 'available' || step.done
}

function pick(step: Step) {
  if (canLaunch(step)) emit('start', step.type)
}

function subtitle(step: Step): string {
  if (step.type === 'intro' && stats.value) {
    return `${exerciseDescription(step.type)} · ${stats.value.seenWords}/${stats.value.totalWords}`
  }
  if (step.type === 'test') {
    return `${exerciseDescription(step.type)} · ${learned.value.learned}/${learned.value.total}`
  }
  return exerciseDescription(step.type)
}

function goToCity() {
  router.push('/')
}
</script>

<template>
  <main class="welcome">
    <button class="back-btn" :aria-label="$t('common.backToCity')" type="button" @click="goToCity">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ $t('common.city') }}
    </button>

    <div class="welcome__body">
      <header class="welcome__hero">
        <span class="welcome__badge" aria-hidden="true">🛎️</span>
        <h1 class="welcome__title">{{ $t('welcome.title') }}</h1>
        <p class="welcome__subtitle">{{ $t('welcome.subtitle') }}</p>
        <p class="welcome__intro">{{ $t('welcome.intro') }}</p>
      </header>

      <section class="checklist" :class="{ 'checklist--done': complete }">
        <div class="checklist__head">
          <h2 class="checklist__title">{{ $t('welcome.activitiesTitle') }}</h2>
          <span class="checklist__count">{{
            $t('welcome.progressCount', { done: doneCount, total: steps.length })
          }}</span>
        </div>
        <p class="checklist__intro">{{ $t('welcome.activitiesIntro') }}</p>

        <ul class="steps">
          <li v-for="step in steps" :key="step.type">
            <button
              class="step"
              :class="{
                'step--done': step.done,
                'step--locked': !canLaunch(step),
              }"
              type="button"
              :disabled="!canLaunch(step)"
              @click="pick(step)"
            >
              <span class="step__icon" aria-hidden="true">{{ EMOJI[step.type] }}</span>
              <span class="step__text">
                <span class="step__label">{{ exerciseLabel(step.type) }}</span>
                <span class="step__desc">{{
                  !canLaunch(step) && step.hint ? step.hint : subtitle(step)
                }}</span>
              </span>
              <span v-if="step.done" class="step__check" aria-hidden="true">✓</span>
              <span v-else-if="!canLaunch(step)" class="step__lock" aria-hidden="true">🔒</span>
              <span v-else class="step__go" aria-hidden="true">›</span>
            </button>
          </li>
        </ul>

        <template v-if="complete">
          <p class="checklist__done-title">{{ $t('welcome.completeTitle') }}</p>
          <p class="checklist__done-body">{{ $t('welcome.completeBody') }}</p>
          <button class="btn btn--primary" type="button" @click="goToCity">
            {{ $t('welcome.toCity') }}
          </button>
          <p class="checklist__resit">{{ $t('welcome.resit') }}</p>
        </template>
      </section>

      <section class="how">
        <h2 class="how__title">{{ $t('welcome.howTitle') }}</h2>
        <ul class="how__list">
          <li class="how__item">
            <span class="how__icon" aria-hidden="true">🏙️</span>
            <div class="how__text">
              <h3 class="how__heading">{{ $t('welcome.steps.tapTitle') }}</h3>
              <p class="how__body">{{ $t('welcome.steps.tapBody') }}</p>
            </div>
          </li>
          <li class="how__item">
            <span class="how__icon" aria-hidden="true">🎲</span>
            <div class="how__text">
              <h3 class="how__heading">{{ $t('welcome.steps.activitiesTitle') }}</h3>
              <p class="how__body">{{ $t('welcome.steps.activitiesBody') }}</p>
            </div>
          </li>
          <li class="how__item">
            <span class="how__icon" aria-hidden="true">⭕</span>
            <div class="how__text">
              <h3 class="how__heading">{{ $t('welcome.steps.ringTitle') }}</h3>
              <p class="how__body">{{ $t('welcome.steps.ringBody') }}</p>
            </div>
          </li>
          <li class="how__item">
            <span class="how__icon" aria-hidden="true">🎓</span>
            <div class="how__text">
              <h3 class="how__heading">{{ $t('welcome.steps.metaTitle') }}</h3>
              <p class="how__body">{{ $t('welcome.steps.metaBody') }}</p>
            </div>
          </li>
        </ul>
      </section>
    </div>
  </main>
</template>

<style scoped>
.welcome {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem 3rem;
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

.welcome__body {
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}

.welcome__hero {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.4rem;
  text-align: center;
}

.welcome__badge {
  font-size: 2.6rem;
  line-height: 1;
}

.welcome__title {
  font-size: clamp(1.6rem, 6vw, 2.1rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.welcome__subtitle {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin: 0;
}

.welcome__intro {
  font-size: 0.92rem;
  line-height: 1.55;
  color: var(--color-text);
  margin: 0.4rem 0 0;
}

/* Activity checklist */
.checklist {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1rem 1.1rem 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.checklist--done {
  border-color: var(--color-gold);
  background: #fffcf0;
}

.checklist__head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
}

.checklist__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.checklist__count {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-muted);
  white-space: nowrap;
}

.checklist__intro {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text-muted);
  margin: 0 0 0.2rem;
}

.steps {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.step {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.7rem 0.85rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: left;
  transition:
    transform 0.1s ease,
    border-color 0.12s ease;
}

.step:not(:disabled):hover {
  transform: translateY(-1px);
  border-color: var(--color-primary-light);
}

.step--done {
  border-color: var(--color-gold);
  background: #fffdf4;
}

.step--locked {
  opacity: 0.55;
  cursor: default;
  background: var(--color-bg);
}

.step__icon {
  font-size: 1.4rem;
  line-height: 1;
  flex-shrink: 0;
}

.step__text {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.step__label {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.step__desc {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  line-height: 1.35;
}

.step__check {
  flex-shrink: 0;
  font-weight: 800;
  color: var(--color-gold);
  font-size: 1.05rem;
}

.step__lock {
  flex-shrink: 0;
  font-size: 0.9rem;
}

.step__go {
  flex-shrink: 0;
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--color-primary);
}

.checklist__done-title {
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0.4rem 0 0;
  text-align: center;
}

.checklist__done-body {
  font-size: 0.88rem;
  line-height: 1.5;
  color: var(--color-text);
  margin: 0;
  text-align: center;
}

.checklist__resit {
  font-size: 0.8rem;
  color: var(--color-text-muted);
  font-style: italic;
  text-align: center;
  margin: 0;
}

/* How the city works */
.how__title {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0 0 0.75rem;
  text-align: center;
}

.how__list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.how__item {
  display: flex;
  align-items: flex-start;
  gap: 0.8rem;
  padding: 0.8rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.how__icon {
  font-size: 1.5rem;
  line-height: 1.2;
  flex-shrink: 0;
}

.how__text {
  min-width: 0;
}

.how__heading {
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0 0 0.2rem;
}

.how__body {
  font-size: 0.85rem;
  line-height: 1.5;
  color: var(--color-text-muted);
  margin: 0;
}
</style>
