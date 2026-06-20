<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db, useLiveQuery } from '@/db/useDb'
import { loadTestData, loadPoolTestData } from '@/exercises/words'
import { buildTest, selectTestWords, type TestQuestion } from '@/exercises/test'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import type { Word } from '@/db/types'
import TestChoiceQuestion from './TestChoiceQuestion.vue'
import TestTypeQuestion from './TestTypeQuestion.vue'
import ConfettiBurst from '@/components/ConfettiBurst.vue'

const emit = defineEmits<{ complete: [] }>()
/** Location test by theme, or a focused test over an explicit word pool (#62). */
const props = defineProps<{ locationId?: string; pool?: Word[] }>()

const progress = useProgressStore()
const { gloss } = useContentLang()

const questions = ref<TestQuestion[]>([])
const index = ref(0)
const loading = ref(true)
const phase = ref<'answering' | 'feedback'>('answering')

/** A just-learned word to celebrate before moving on. */
const celebrate = ref<{ uzbek: string; meaning: string } | null>(null)
const confettiKey = ref(0)

/** Live count of learned words so the celebration shows it ticking up. */
const learnedCount = useLiveQuery(
  () => db.wordProgress.filter((p) => Boolean(p.learnedAt)).count(),
  0,
)

const current = computed(() => questions.value[index.value])
const isLast = computed(() => index.value >= questions.value.length - 1)

/** Maps a choice question type to the prompt mode the choice component shows. */
function choiceMode(type: TestQuestion['type']): 'listen' | 'read' | 'read-cyrillic' {
  if (type === 'listen-choice') return 'listen'
  if (type === 'read-cyrillic-choice') return 'read-cyrillic'
  return 'read'
}

onMounted(async () => {
  const { candidates, learnedPool, allWords, progress: prog } = props.pool
    ? await loadPoolTestData(props.pool)
    : await loadTestData(props.locationId ?? '')
  const words = selectTestWords(candidates, learnedPool, prog)
  questions.value = buildTest(words, prog, allWords)
  loading.value = false
})

/** Choice questions report a boolean; the typing question reports a 0–1 score. */
async function onAnswered(result: boolean | number) {
  if (phase.value !== 'answering' || !current.value) return
  phase.value = 'feedback'
  const { word, type } = current.value
  const outcome = await progress.recordTestResult(word.id, type, result)
  if (outcome.newlyLearned) {
    celebrate.value = { uzbek: word.uzbek, meaning: gloss(word) }
    confettiKey.value++
  }
}

function next() {
  celebrate.value = null
  if (isLast.value) {
    emit('complete')
    return
  }
  index.value++
  phase.value = 'answering'
}
</script>

<template>
  <div class="test">
    <p v-if="loading" class="test__loading" aria-live="polite">{{ $t('exercise.test.preparing') }}</p>

    <template v-else-if="current">
      <p class="test__counter">{{ $t('exercise.test.counter', { current: index + 1, total: questions.length }) }}</p>

      <TestTypeQuestion
        v-if="current.type === 'type'"
        :key="`q-${index}`"
        :word="current.word"
        @answered="onAnswered"
      />
      <TestChoiceQuestion
        v-else
        :key="`q-${index}`"
        :word="current.word"
        :mode="choiceMode(current.type)"
        :options="current.options"
        @answered="onAnswered"
      />

      <Transition name="celebrate">
        <div v-if="celebrate" class="test__celebrate" aria-live="polite">
          <span class="test__celebrate-icon" aria-hidden="true">🏆</span>
          <span class="test__celebrate-word" lang="uz">{{ celebrate.uzbek }}</span>
          <span class="test__celebrate-en">{{ $t('exercise.test.learned', { word: celebrate.meaning }) }}</span>
          <span class="test__celebrate-count">{{ $t('exercise.test.learnedCount', { count: learnedCount }) }}</span>
        </div>
      </Transition>

      <div v-if="phase === 'feedback'" class="test__footer">
        <button class="btn btn--primary" type="button" @click="next">
          {{ isLast ? $t('exercise.test.finishTest') : $t('exercise.test.nextQuestion') }}
        </button>
      </div>
    </template>

    <div v-else class="test__empty">
      <p class="test__loading">{{ $t('exercise.test.empty') }}</p>
      <button class="btn btn--primary" type="button" @click="emit('complete')">{{ $t('common.continue') }}</button>
    </div>

    <ConfettiBurst v-if="celebrate" :key="confettiKey" @done="() => {}" />
  </div>
</template>

<style scoped>
.test {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  flex: 1;
  min-height: 0;
}

.test__loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  text-align: center;
}

.test__counter {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.test__celebrate {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  padding: 0.9rem 1rem;
  background: #fbf7ec;
  border: 1.5px solid var(--color-gold);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
}

.test__celebrate-icon {
  font-size: 1.6rem;
}

.test__celebrate-word {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
}

.test__celebrate-en {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}

.test__celebrate-count {
  margin-top: 0.2rem;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-gold);
}

.celebrate-enter-active {
  transition:
    transform 0.35s cubic-bezier(0.22, 1, 0.36, 1),
    opacity 0.35s ease;
}

.celebrate-enter-from {
  transform: scale(0.8) translateY(8px);
  opacity: 0;
}

.test__footer {
  margin-top: auto;
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
}

.test__empty {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  margin-top: 1rem;
}
</style>
