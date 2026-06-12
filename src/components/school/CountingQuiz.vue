<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import type { Word, TestQuestionType } from '@/db/types'
import {
  generateCountingQuiz,
  numberToUzbek,
  type CountingQuestion,
  type CountingMode,
} from '@/exercises/numbers'
import { foldTyping } from '@/exercises/test'
import { normalizeToken } from '@/exercises/validate'
import { useProgressStore } from '@/stores/progress'
import { speakUzbek, playChime } from '@/audio/audio'
import AudioButton from '@/components/AudioButton.vue'

const props = defineProps<{ words: Word[] }>()
const emit = defineEmits<{ complete: [] }>()

const progress = useProgressStore()

const QUESTION_COUNT = 8
const questions = ref<CountingQuestion[]>([])
const index = ref(0)
const phase = ref<'answering' | 'feedback'>('answering')
const picked = ref<number | null>(null) // chosen option value
const typed = ref('')
const correctSoFar = ref(0)

/** value -> word id, for the numbers that exist as single vocabulary items. */
const wordByReading = new Map<string, string>()

const current = computed(() => questions.value[index.value])
const isLast = computed(() => index.value >= questions.value.length - 1)

onMounted(() => {
  for (const w of props.words) wordByReading.set(normalizeToken(w.uzbek), w.id)
  questions.value = generateCountingQuiz(QUESTION_COUNT)
})

/** Autoplay the sound the moment a listen question appears. */
watch(
  current,
  (q) => {
    if (q?.mode === 'listen') speakUzbek(q.uzbek)
  },
  { immediate: true },
)

const isCorrect = computed(() => {
  const q = current.value
  if (!q || phase.value !== 'feedback') return false
  if (q.mode === 'type') return foldTyping(typed.value) === foldTyping(q.uzbek)
  return picked.value === q.value
})

const MODE_TO_TYPE: Record<CountingMode, TestQuestionType> = {
  read: 'read-choice',
  write: 'read-choice',
  listen: 'listen-choice',
  type: 'type',
}

const prompt: Record<CountingMode, string> = {
  read: 'Which number is this?',
  listen: 'Tap the number you hear',
  write: 'How do you say this number?',
  type: 'Type this number in Uzbek',
}

async function record(correct: boolean) {
  const q = current.value
  if (!q) return
  // Only single-word numbers map to a learnable vocab item; tie the quiz into
  // the normal learned-word progress so the School card reflects it.
  const wordId = wordByReading.get(normalizeToken(q.uzbek))
  if (wordId) await progress.recordTestResult(wordId, MODE_TO_TYPE[q.mode], correct)
}

async function choose(value: number) {
  if (phase.value !== 'answering') return
  picked.value = value
  phase.value = 'feedback'
  const correct = value === current.value!.value
  if (correct) {
    correctSoFar.value++
    playChime()
  }
  await record(correct)
}

async function checkTyped() {
  if (phase.value !== 'answering' || !typed.value.trim()) return
  phase.value = 'feedback'
  const correct = foldTyping(typed.value) === foldTyping(current.value!.uzbek)
  if (correct) {
    correctSoFar.value++
    playChime()
  }
  await record(correct)
}

function next() {
  if (isLast.value) {
    emit('complete')
    return
  }
  index.value++
  picked.value = null
  typed.value = ''
  phase.value = 'answering'
}

function optionClass(value: number): string {
  if (phase.value !== 'feedback') return ''
  if (value === current.value!.value) return 'option--correct'
  if (value === picked.value) return 'option--wrong'
  return ''
}
</script>

<template>
  <div v-if="current" class="counting">
    <p class="counting__counter">Number {{ index + 1 }} of {{ questions.length }}</p>
    <p class="counting__prompt">{{ prompt[current.mode] }}</p>

    <!-- The cue: a numeral, an Uzbek reading, or a sound -->
    <div class="counting__cue">
      <span v-if="current.mode === 'write' || current.mode === 'type'" class="counting__numeral">
        {{ current.value }}
      </span>
      <template v-else-if="current.mode === 'read'">
        <span class="counting__uzbek" lang="uz">{{ current.uzbek }}</span>
        <AudioButton :text="current.uzbek" />
      </template>
      <AudioButton v-else :text="current.uzbek" large label="Play the number" />
    </div>

    <!-- Digit options (read / listen) -->
    <div v-if="current.mode === 'read' || current.mode === 'listen'" class="counting__options">
      <button
        v-for="opt in current.options"
        :key="opt.value"
        class="option option--digit"
        :class="optionClass(opt.value)"
        type="button"
        :disabled="phase === 'feedback'"
        @click="choose(opt.value)"
      >
        {{ opt.value }}
      </button>
    </div>

    <!-- Uzbek options (write) -->
    <div v-else-if="current.mode === 'write'" class="counting__options counting__options--words">
      <button
        v-for="opt in current.options"
        :key="opt.value"
        class="option"
        :class="optionClass(opt.value)"
        type="button"
        :disabled="phase === 'feedback'"
        lang="uz"
        @click="choose(opt.value)"
      >
        {{ opt.uzbek }}
      </button>
    </div>

    <!-- Typed answer -->
    <form v-else class="counting__type" @submit.prevent="checkTyped">
      <input
        v-model="typed"
        class="counting__input"
        type="text"
        autocapitalize="off"
        autocomplete="off"
        spellcheck="false"
        lang="uz"
        :readonly="phase === 'feedback'"
        placeholder="e.g. yigirma besh"
        aria-label="Type the number in Uzbek"
      />
      <button
        v-if="phase === 'answering'"
        class="btn btn--primary"
        type="submit"
        :disabled="!typed.trim()"
      >
        Check
      </button>
    </form>

    <div v-if="phase === 'feedback'" class="counting__feedback" aria-live="polite">
      <p :class="isCorrect ? 'counting__verdict--good' : 'counting__verdict--bad'">
        <template v-if="isCorrect">To'g'ri! 🎉</template>
        <template v-else>
          {{ current.value }} =
          <strong lang="uz">{{ numberToUzbek(current.value) }}</strong>
        </template>
      </p>
      <button class="btn btn--primary" type="button" @click="next">
        {{ isLast ? 'Finish' : 'Next' }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.counting {
  display: flex;
  flex-direction: column;
  gap: 0.9rem;
}

.counting__counter {
  font-size: 0.78rem;
  font-weight: 700;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  text-align: center;
  margin: 0;
}

.counting__prompt {
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  text-align: center;
  margin: 0;
}

.counting__cue {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 1.1rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.counting__numeral {
  font-size: 2.6rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

.counting__uzbek {
  font-size: 1.5rem;
  font-weight: 700;
  color: var(--color-primary);
}

.counting__options {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.5rem;
}

.counting__options--words {
  grid-template-columns: 1fr;
}

.option {
  padding: 0.75rem 1rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  text-align: center;
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    background-color 0.15s ease;
}

.option--digit {
  font-size: 1.3rem;
  font-weight: 800;
}

.option:not(:disabled):hover {
  transform: translateY(-1px);
}

.option--correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
  color: var(--color-teal);
}

.option--wrong {
  border-color: var(--color-terracotta);
  background: #fbf1ec;
  color: var(--color-terracotta);
}

.counting__type {
  display: flex;
  gap: 0.5rem;
}

.counting__input {
  flex: 1;
  min-width: 0;
  padding: 0.7rem 0.9rem;
  font-size: 1.05rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  color: var(--color-text);
}

.counting__input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.counting__feedback {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.counting__feedback p {
  text-align: center;
  font-size: 0.95rem;
  margin: 0;
}

.counting__verdict--good {
  color: var(--color-teal);
  font-weight: 700;
}

.counting__verdict--bad {
  color: var(--color-text);
}
</style>
