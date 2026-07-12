<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { db, useLiveQuery } from '@/db/useDb'
import { loadTestData, loadPoolTestData } from '@/exercises/words'
import { buildQuestionsFromPairs, selectTestPairs } from '@/exercises/test'
import type { PracticeQuestion } from '@/exercises/practice'
import { useProgressStore } from '@/stores/progress'
import { useContentLang } from '@/i18n/content'
import type { Word, TestQuestionType } from '@/db/types'
import TestChoiceQuestion from './TestChoiceQuestion.vue'
import TestTypeQuestion from './TestTypeQuestion.vue'
import PracticePhraseQuestion from './PracticePhraseQuestion.vue'
import ConfettiBurst from '@/components/ConfettiBurst.vue'
import AudioButton from '@/components/AudioButton.vue'
import UzbekSentence from '@/components/UzbekSentence.vue'
import CyrillicSub from '@/components/CyrillicSub.vue'

const emit = defineEmits<{ complete: [] }>()
/**
 * Three ways to source questions: a location test by theme, a focused test over
 * an explicit word pool (#62), or a ready-built question list (Daily Practice —
 * which may mix in phrase-building and brand-new material).
 */
const props = defineProps<{
  locationId?: string
  pool?: Word[]
  presetQuestions?: PracticeQuestion[]
}>()

const progress = useProgressStore()
const { gloss, pick } = useContentLang()

const questions = ref<PracticeQuestion[]>([])
const index = ref(0)
const loading = ref(true)
// 'meet' introduces brand-new material (isNew) before its question is asked.
const phase = ref<'meet' | 'answering' | 'feedback'>('answering')

/** A just-learned word to celebrate before moving on. */
const celebrate = ref<{ uzbek: string; meaning: string } | null>(null)
const confettiKey = ref(0)

/** Live count of learned words so the celebration shows it ticking up. */
const learnedCount = useLiveQuery(
  () => db.wordProgress.filter((p) => Boolean(p.learnedAt)).count(),
  0,
)

const current = computed(() => questions.value[index.value])
/** Narrowed views of the current question, for template type safety. */
const wordQ = computed(() => (current.value?.kind === 'word' ? current.value : null))
const phraseQ = computed(() => (current.value?.kind === 'phrase' ? current.value : null))
const isLast = computed(() => index.value >= questions.value.length - 1)

/** Maps a choice question type to the prompt mode the choice component shows. */
function choiceMode(type: TestQuestionType): 'listen' | 'read' | 'read-cyrillic' {
  if (type === 'listen-choice') return 'listen'
  if (type === 'read-cyrillic-choice') return 'read-cyrillic'
  return 'read'
}

function phaseFor(question: PracticeQuestion | undefined): 'meet' | 'answering' {
  return question?.isNew ? 'meet' : 'answering'
}

onMounted(async () => {
  if (props.presetQuestions) {
    questions.value = props.presetQuestions
  } else {
    const { candidates, learnedPool, allWords, progress: prog } = props.pool
      ? await loadPoolTestData(props.pool)
      : await loadTestData(props.locationId ?? '')
    const pairs = selectTestPairs(candidates, learnedPool, prog)
    questions.value = buildQuestionsFromPairs(pairs, allWords).map((q) => ({
      kind: 'word' as const,
      ...q,
    }))
  }
  phase.value = phaseFor(questions.value[0])
  loading.value = false
})

/** The meet card is dismissed: the new word now counts as met, and we ask. */
async function startNewQuestion() {
  if (current.value?.kind === 'word') {
    await progress.markWordsSeen([current.value.word.id])
  }
  phase.value = 'answering'
}

/** Choice questions report a boolean; the typing question reports a 0–1 score. */
async function onAnswered(result: boolean | number) {
  if (phase.value !== 'answering' || !current.value) return
  phase.value = 'feedback'
  if (current.value.kind === 'phrase') {
    // Feeds the phrase's spaced-repetition schedule; no learned state to celebrate.
    await progress.recordPhraseResult(current.value.phrase.key, result === true)
    return
  }
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
  phase.value = phaseFor(questions.value[index.value])
}
</script>

<template>
  <div class="test">
    <p v-if="loading" class="test__loading" aria-live="polite">{{ $t('exercise.test.preparing') }}</p>

    <template v-else-if="current">
      <p class="test__counter">{{ $t('exercise.test.counter', { current: index + 1, total: questions.length }) }}</p>

      <!-- Brand-new material: meet it before it's asked. -->
      <div v-if="phase === 'meet'" class="test__meet">
        <span class="test__meet-eyebrow">{{
          current.kind === 'word' ? $t('exercise.practiceNew.word') : $t('exercise.practiceNew.phrase')
        }}</span>
        <template v-if="wordQ">
          <span class="test__meet-uz" lang="uz">{{ wordQ.word.uzbek }}</span>
          <CyrillicSub :latin="wordQ.word.uzbek" :cyrillic="wordQ.word.cyrillic" />
          <span class="test__meet-gloss">{{ gloss(wordQ.word) }}</span>
          <AudioButton :text="wordQ.word.uzbek" large />
        </template>
        <template v-else-if="phraseQ">
          <span class="test__meet-uz"><UzbekSentence :uzbek="phraseQ.phrase.uzbek" /></span>
          <span class="test__meet-gloss">{{ pick(phraseQ.phrase.english, phraseQ.phrase.russian) }}</span>
          <AudioButton :text="phraseQ.phrase.uzbek" large :label="$t('audio.playPhrase')" />
        </template>
        <p class="test__meet-hint">{{ $t('exercise.practiceNew.intro') }}</p>
        <button class="btn btn--primary" type="button" @click="startNewQuestion">
          {{ $t('exercise.practiceNew.continue') }}
        </button>
      </div>

      <template v-else-if="wordQ">
        <TestTypeQuestion
          v-if="wordQ.type === 'type'"
          :key="`q-${index}`"
          :word="wordQ.word"
          @answered="onAnswered"
        />
        <TestChoiceQuestion
          v-else
          :key="`q-${index}`"
          :word="wordQ.word"
          :mode="choiceMode(wordQ.type)"
          :options="wordQ.options"
          @answered="onAnswered"
        />
      </template>
      <PracticePhraseQuestion
        v-else-if="phraseQ"
        :key="`q-${index}`"
        :phrase="phraseQ.phrase"
        :mode="phraseQ.mode"
        :pool="phraseQ.pool"
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

/* Meet card for brand-new words and phrases introduced mid-practice. */
.test__meet {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.45rem;
  padding: 1.4rem 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-gold);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-md);
  text-align: center;
}

.test__meet-eyebrow {
  font-size: 0.75rem;
  font-weight: 800;
  color: var(--color-gold);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.test__meet-uz {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-primary);
}

.test__meet-gloss {
  font-size: 1rem;
  color: var(--color-text);
}

.test__meet-hint {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.4rem 0 0;
  line-height: 1.5;
}

.test__meet .btn {
  margin-top: 0.4rem;
  align-self: stretch;
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
