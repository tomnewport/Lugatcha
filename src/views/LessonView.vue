<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { loadLesson } from '@/db/lessons'
import { useProgressStore } from '@/stores/progress'
import { db } from '@/db'
import type { Lesson, LessonExercise, LessonSection } from '@/db/types'
import { useContentLang } from '@/i18n/content'
import LessonSectionCard from '@/components/school/LessonSectionCard.vue'
import ChoiceExercise from '@/components/school/ChoiceExercise.vue'
import BuildExercise from '@/components/school/BuildExercise.vue'

const route = useRoute()
const router = useRouter()
const progressStore = useProgressStore()
const { name, pick } = useContentLang()

const lesson = ref<Lesson | null>(null)
const stepIndex = ref(0)
const missing = ref(false)
/** Snapshot of completed visits at load time, used to rotate examples. */
const visitCount = ref(0)

type Step =
  | { kind: 'section'; section: LessonSection }
  | { kind: 'exercise'; exercise: LessonExercise }
  | { kind: 'wrapup' }

onMounted(async () => {
  const lessonId = route.params.id as string
  const [found, progress] = await Promise.all([
    loadLesson(lessonId),
    db.lessonProgress.get(lessonId),
  ])
  if (!found) {
    missing.value = true
    return
  }
  lesson.value = found
  visitCount.value = progress?.visitCount ?? 0
})

const steps = computed<Step[]>(() => {
  if (!lesson.value) return []
  return [
    ...lesson.value.sections.map((section) => ({ kind: 'section', section }) as Step),
    ...lesson.value.exercises.map((exercise) => ({ kind: 'exercise', exercise }) as Step),
    { kind: 'wrapup' },
  ]
})

const current = computed(() => steps.value[stepIndex.value])
const isFirst = computed(() => stepIndex.value === 0)
const isLast = computed(() => stepIndex.value >= steps.value.length - 1)

function back() {
  if (isFirst.value) {
    router.push('/school')
  } else {
    stepIndex.value--
  }
}

function next() {
  if (!isLast.value) stepIndex.value++
}

async function onExerciseDone(passed: boolean) {
  const step = current.value
  if (passed && lesson.value && step.kind === 'exercise') {
    await progressStore.recordLessonExercise(lesson.value.id, step.exercise.id)
  }
  next()
}

async function finishLesson() {
  if (lesson.value) await progressStore.completeLesson(lesson.value.id)
  router.push('/school')
}
</script>

<template>
  <div class="lesson">
    <header class="lesson-header">
      <button class="exit-btn" :aria-label="$t('common.back')" type="button" @click="back">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="lesson-header__titles">
        <span class="lesson-header__school">{{ $t('lesson.breadcrumb') }}</span>
        <h1 class="lesson-header__title">{{ lesson ? name(lesson.title) : $t('lesson.fallbackTitle') }}</h1>
      </div>
      <div
        v-if="steps.length"
        class="lesson-dots"
        role="img"
        :aria-label="$t('lesson.step', { current: stepIndex + 1, total: steps.length })"
      >
        <span
          v-for="(step, i) in steps"
          :key="i"
          class="lesson-dot"
          :class="{
            'lesson-dot--done': i < stepIndex,
            'lesson-dot--current': i === stepIndex,
            'lesson-dot--exercise': step.kind === 'exercise',
          }"
        />
      </div>
    </header>

    <div class="lesson-body">
      <p v-if="missing" class="lesson-loading">
        {{ $t('lesson.notFound') }}
        <button class="btn btn--ghost" type="button" @click="router.push('/school')">
          {{ $t('lesson.backToSchool') }}
        </button>
      </p>
      <p v-else-if="!lesson" class="lesson-loading" aria-live="polite">{{ $t('lesson.loading') }}</p>

      <template v-else-if="current">
        <LessonSectionCard
          v-if="current.kind === 'section'"
          :key="`s-${stepIndex}`"
          :section="current.section"
          :visit-count="visitCount"
        />

        <ChoiceExercise
          v-else-if="current.kind === 'exercise' && current.exercise.engine === 'choice'"
          :key="`e-${stepIndex}`"
          :exercise="current.exercise"
          @done="onExerciseDone"
        />
        <BuildExercise
          v-else-if="current.kind === 'exercise' && current.exercise.engine === 'build'"
          :key="`e-${stepIndex}`"
          :exercise="current.exercise"
          @done="onExerciseDone"
        />

        <div v-else class="wrapup">
          <span class="wrapup__emoji" aria-hidden="true">🎓</span>
          <h2 class="wrapup__title">{{ $t('lesson.gotIt') }}</h2>
          <p class="wrapup__text">{{ pick(lesson.wrapUp, lesson.wrapUpRu) }}</p>
          <button class="btn btn--gold" type="button" @click="finishLesson">
            {{ $t('lesson.markComplete') }}
          </button>
        </div>
      </template>
    </div>

    <footer v-if="lesson && current?.kind === 'section'" class="lesson-footer">
      <button class="btn btn--primary" type="button" @click="next">
        {{ steps[stepIndex + 1]?.kind === 'exercise' ? $t('lesson.tryIt') : $t('common.next') }}
      </button>
    </footer>
  </div>
</template>

<style scoped>
.lesson {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.lesson-header {
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

.lesson-header__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.lesson-header__school {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.lesson-header__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-teal);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.lesson-dots {
  display: flex;
  gap: 4px;
  flex-shrink: 0;
  max-width: 110px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.lesson-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--color-border);
}

.lesson-dot--exercise {
  border-radius: 2px;
}

.lesson-dot--done {
  background: var(--color-gold);
}

.lesson-dot--current {
  background: var(--color-teal);
  transform: scale(1.3);
}

.lesson-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.25rem 1rem 2rem;
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.lesson-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
  display: flex;
  flex-direction: column;
  gap: 0.8rem;
  align-items: center;
}

.wrapup {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.5rem 1rem;
  background: #fffcf0;
  border: 1.5px solid var(--color-gold);
  border-radius: var(--radius-md);
  text-align: center;
}

.wrapup__emoji {
  font-size: 2.2rem;
}

.wrapup__title {
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.wrapup__text {
  font-size: 0.92rem;
  color: var(--color-text);
  margin: 0 0 0.5rem;
}

.lesson-footer {
  position: sticky;
  bottom: 0;
  padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: 1.5px solid var(--color-border);
  display: flex;
  justify-content: center;
}

.lesson-footer .btn {
  width: 100%;
  max-width: 528px;
}
</style>
