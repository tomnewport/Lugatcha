<script setup lang="ts">
import { ref, computed } from 'vue'
import { validateStrictOrder, validateLoose, shuffle } from '@/exercises/validate'

export interface AssemblyResult {
  correct: boolean
  revealed: boolean
  attempts: number
}

const props = withDefaults(
  defineProps<{
    /** Canonical answer tokens, in order. */
    tokens: string[]
    /** Extra wrong tokens mixed into the bank. */
    decoys?: string[]
    /** strict = exact order (Uzbek phrases); loose = content words, any order (English translations). */
    mode?: 'strict' | 'loose'
    checkLabel?: string
  }>(),
  { decoys: () => [], mode: 'strict', checkLabel: '' },
)

const emit = defineEmits<{ result: [AssemblyResult] }>()

interface Tile {
  id: number
  text: string
}

const bank = ref<Tile[]>(
  shuffle([...props.tokens, ...props.decoys].map((text, id) => ({ id, text }))),
)
const answer = ref<Tile[]>([])
const attempts = ref(0)
const feedback = ref<'none' | 'wrong' | 'correct' | 'revealed'>('none')
const dragIndex = ref<number | null>(null)

const settled = computed(() => feedback.value === 'correct' || feedback.value === 'revealed')
const showReveal = computed(() => attempts.value >= 2 && !settled.value)

function pick(tile: Tile) {
  if (settled.value) return
  bank.value = bank.value.filter((t) => t.id !== tile.id)
  answer.value.push(tile)
  feedback.value = 'none'
}

function unpick(tile: Tile) {
  if (settled.value) return
  answer.value = answer.value.filter((t) => t.id !== tile.id)
  bank.value.push(tile)
  feedback.value = 'none'
}

function onDragStart(index: number) {
  dragIndex.value = index
}

function onDrop(index: number) {
  if (dragIndex.value === null || settled.value) return
  const moved = answer.value.splice(dragIndex.value, 1)[0]
  answer.value.splice(index, 0, moved)
  dragIndex.value = null
  feedback.value = 'none'
}

function check() {
  if (settled.value) return
  const assembled = answer.value.map((t) => t.text)
  const ok =
    props.mode === 'loose'
      ? validateLoose(assembled, props.tokens)
      : validateStrictOrder(assembled, props.tokens)
  attempts.value++
  if (ok) {
    feedback.value = 'correct'
    emit('result', { correct: true, revealed: false, attempts: attempts.value })
  } else {
    feedback.value = 'wrong'
  }
}

function reveal() {
  feedback.value = 'revealed'
  bank.value = []
  answer.value = props.tokens.map((text, id) => ({ id: 1000 + id, text }))
  emit('result', { correct: false, revealed: true, attempts: attempts.value })
}
</script>

<template>
  <div class="assembly">
    <div
      class="assembly__answer"
      :class="{
        'assembly__answer--wrong': feedback === 'wrong',
        'assembly__answer--correct': feedback === 'correct',
      }"
      :aria-label="$t('exercise.token.answerLabel')"
    >
      <TransitionGroup name="tile">
        <button
          v-for="(tile, i) in answer"
          :key="tile.id"
          class="token token--placed"
          type="button"
          draggable="true"
          :disabled="settled"
          @click="unpick(tile)"
          @dragstart="onDragStart(i)"
          @dragover.prevent
          @drop.prevent="onDrop(i)"
        >
          {{ tile.text }}
        </button>
      </TransitionGroup>
      <span v-if="answer.length === 0" class="assembly__hint">{{ $t('exercise.token.tapToBuild') }}</span>
    </div>

    <div class="assembly__bank" :aria-label="$t('exercise.token.bankLabel')">
      <TransitionGroup name="tile">
        <button
          v-for="tile in bank"
          :key="tile.id"
          class="token"
          type="button"
          :disabled="settled"
          @click="pick(tile)"
        >
          {{ tile.text }}
        </button>
      </TransitionGroup>
    </div>

    <p
      v-if="feedback === 'wrong'"
      class="assembly__feedback assembly__feedback--wrong"
      aria-live="polite"
    >
      {{ $t('exercise.token.wrong') }}
    </p>
    <p
      v-else-if="feedback === 'correct'"
      class="assembly__feedback assembly__feedback--correct"
      aria-live="polite"
    >
      {{ $t('exercise.token.correct') }}
    </p>
    <p v-else-if="feedback === 'revealed'" class="assembly__feedback" aria-live="polite">
      {{ $t('exercise.token.revealed') }}
    </p>

    <div v-if="!settled" class="assembly__actions">
      <button class="btn btn--primary" type="button" :disabled="answer.length === 0" @click="check">
        {{ checkLabel || $t('exercise.token.check') }}
      </button>
      <button v-if="showReveal" class="btn btn--ghost" type="button" @click="reveal">
        {{ $t('exercise.token.showAnswer') }}
      </button>
    </div>
  </div>
</template>

<style scoped>
.assembly {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.assembly__answer {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  align-items: center;
  min-height: 64px;
  padding: 12px;
  background: var(--color-surface);
  border: 2px dashed var(--color-border);
  border-radius: var(--radius-md);
  transition:
    border-color 0.2s ease,
    background-color 0.2s ease;
}

.assembly__answer--wrong {
  border-color: var(--color-terracotta);
  animation: shake 0.35s ease;
}

.assembly__answer--correct {
  border-color: var(--color-teal);
  background: #f0f7f5;
}

@keyframes shake {
  0%,
  100% {
    transform: translateX(0);
  }
  25% {
    transform: translateX(-5px);
  }
  75% {
    transform: translateX(5px);
  }
}

.assembly__hint {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.assembly__bank {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  justify-content: center;
  min-height: 48px;
}

.token {
  padding: 0.5rem 0.8rem;
  font-size: 0.95rem;
  font-weight: 600;
  color: var(--color-text);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  touch-action: manipulation;
}

.token:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.token--placed {
  border-color: var(--color-primary-light);
  background: #f2f7fc;
  cursor: grab;
}

.tile-enter-active,
.tile-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.tile-enter-from,
.tile-leave-to {
  opacity: 0;
  transform: scale(0.8);
}

.assembly__feedback {
  font-size: 0.9rem;
  font-weight: 600;
  text-align: center;
  margin: 0;
}

.assembly__feedback--wrong {
  color: var(--color-terracotta);
}

.assembly__feedback--correct {
  color: var(--color-teal);
}

.assembly__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
</style>
