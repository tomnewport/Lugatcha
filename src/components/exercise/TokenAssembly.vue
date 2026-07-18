<script setup lang="ts">
import { ref, computed, onBeforeUnmount } from 'vue'
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
    /** Normalised words that may be built or omitted (loose mode only). */
    optional?: string[]
    checkLabel?: string
  }>(),
  { decoys: () => [], mode: 'strict', optional: () => [], checkLabel: '' },
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

// --- Pointer-based drag and drop ---------------------------------------
// Works with mouse and touch alike. Dragging past a small threshold starts a
// live drag: the tile follows the pointer as a floating ghost while the real
// tiles reflow to show where it would land. A tap that never crosses the
// threshold falls through to the button's click handler (pick / unpick), so
// keyboard and tap interaction keep working unchanged.

const DRAG_THRESHOLD = 6

const answerEl = ref<HTMLElement | null>(null)

interface DragState {
  tile: Tile
  origin: 'bank' | 'answer'
  startX: number
  startY: number
  offsetX: number
  offsetY: number
  width: number
  x: number
  y: number
  moved: boolean
  inAnswer: boolean
}

const drag = ref<DragState | null>(null)
// Set when a drag ends so the synthetic click that follows pointerup is ignored.
let suppressClick = false

const ghostStyle = computed(() => {
  const d = drag.value
  if (!d) return {}
  return {
    left: `${d.x - d.offsetX}px`,
    top: `${d.y - d.offsetY}px`,
    width: `${d.width}px`,
  }
})

function isDragging(tile: Tile): boolean {
  return !!drag.value && drag.value.moved && drag.value.tile.id === tile.id
}

function onPointerDown(event: PointerEvent, tile: Tile, origin: 'bank' | 'answer') {
  // Only react to the primary (left) mouse button; touch/pen report button 0 too.
  if (settled.value || event.button !== 0) return
  // Clear any stale suppression from a drag that ended over a different element
  // (which fires no synthetic click), so this fresh gesture's tap isn't eaten.
  suppressClick = false
  const el = event.currentTarget as HTMLElement
  const rect = el.getBoundingClientRect()
  drag.value = {
    tile,
    origin,
    startX: event.clientX,
    startY: event.clientY,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top,
    width: rect.width,
    x: event.clientX,
    y: event.clientY,
    moved: false,
    inAnswer: origin === 'answer',
  }
  window.addEventListener('pointermove', onPointerMove)
  window.addEventListener('pointerup', onPointerUp)
  window.addEventListener('pointercancel', onPointerUp)
}

/**
 * Where, in the answer row, would a drop at (x, y) land? Returns an insertion
 * index into the answer array with `excludeId` removed, so it maps cleanly onto
 * a splice whether the tile comes from the bank or is being re-sorted in place.
 */
function insertionIndex(x: number, y: number, excludeId: number): number {
  const container = answerEl.value
  if (!container) return answer.value.length
  const nodes = Array.from(container.querySelectorAll<HTMLElement>('[data-token-id]'))
  let index = 0
  for (const node of nodes) {
    if (Number(node.dataset.tokenId) === excludeId) continue
    const r = node.getBoundingClientRect()
    if (y < r.top || (y <= r.bottom && x < r.left + r.width / 2)) return index
    index++
  }
  return index
}

function isOverAnswer(x: number, y: number): boolean {
  const container = answerEl.value
  if (!container) return false
  const r = container.getBoundingClientRect()
  const pad = 16
  return x >= r.left - pad && x <= r.right + pad && y >= r.top - pad && y <= r.bottom + pad
}

function onPointerMove(event: PointerEvent) {
  const d = drag.value
  if (!d) return
  d.x = event.clientX
  d.y = event.clientY

  if (!d.moved) {
    const dist = Math.hypot(event.clientX - d.startX, event.clientY - d.startY)
    if (dist < DRAG_THRESHOLD) return
    d.moved = true
  }
  // Stop the browser from scrolling / selecting text while a drag is live.
  event.preventDefault()

  if (isOverAnswer(d.x, d.y)) {
    const target = insertionIndex(d.x, d.y, d.tile.id)
    if (!d.inAnswer) {
      bank.value = bank.value.filter((t) => t.id !== d.tile.id)
      answer.value.splice(target, 0, d.tile)
      d.inAnswer = true
    } else {
      const cur = answer.value.findIndex((t) => t.id === d.tile.id)
      if (cur !== -1 && cur !== target) {
        answer.value.splice(cur, 1)
        answer.value.splice(target, 0, d.tile)
      }
    }
  } else if (d.inAnswer) {
    answer.value = answer.value.filter((t) => t.id !== d.tile.id)
    if (!bank.value.some((t) => t.id === d.tile.id)) bank.value.push(d.tile)
    d.inAnswer = false
  }
}

function onPointerUp() {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
  const d = drag.value
  drag.value = null
  if (!d) return
  if (d.moved) {
    // The live drag already left the arrays in their final state.
    suppressClick = true
    feedback.value = 'none'
  }
}

function onTileClick(tile: Tile, origin: 'bank' | 'answer') {
  if (suppressClick) {
    suppressClick = false
    return
  }
  if (origin === 'bank') pick(tile)
  else unpick(tile)
}

onBeforeUnmount(() => {
  window.removeEventListener('pointermove', onPointerMove)
  window.removeEventListener('pointerup', onPointerUp)
  window.removeEventListener('pointercancel', onPointerUp)
})

function check() {
  if (settled.value) return
  const assembled = answer.value.map((t) => t.text)
  const ok =
    props.mode === 'loose'
      ? validateLoose(assembled, props.tokens, new Set(props.optional))
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
      ref="answerEl"
      class="assembly__answer"
      :class="{
        'assembly__answer--wrong': feedback === 'wrong',
        'assembly__answer--correct': feedback === 'correct',
        'assembly__answer--dropzone': drag?.moved,
      }"
      :aria-label="$t('exercise.token.answerLabel')"
    >
      <TransitionGroup name="tile">
        <button
          v-for="tile in answer"
          :key="tile.id"
          class="token token--placed"
          :class="{ 'token--dragging': isDragging(tile) }"
          type="button"
          :data-token-id="tile.id"
          :disabled="settled"
          @pointerdown="onPointerDown($event, tile, 'answer')"
          @click="onTileClick(tile, 'answer')"
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
          :class="{ 'token--dragging': isDragging(tile) }"
          type="button"
          :data-token-id="tile.id"
          :disabled="settled"
          @pointerdown="onPointerDown($event, tile, 'bank')"
          @click="onTileClick(tile, 'bank')"
        >
          {{ tile.text }}
        </button>
      </TransitionGroup>
    </div>

    <div v-if="drag?.moved" class="token token--ghost" :style="ghostStyle" aria-hidden="true">
      {{ drag.tile.text }}
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

.assembly__answer--dropzone {
  border-color: var(--color-primary-light);
  background: #f2f7fc;
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
  /* Let us own touch gestures so a drag doesn't turn into a page scroll. */
  touch-action: none;
  cursor: grab;
}

.token:not(:disabled):hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.token--placed {
  border-color: var(--color-primary-light);
  background: #f2f7fc;
}

/* The tile left behind in the flow while its ghost follows the pointer. */
.token--dragging {
  opacity: 0.35;
  box-shadow: none;
}

.token--dragging:hover {
  transform: none;
}

/* The floating copy that tracks the pointer. */
.token--ghost {
  position: fixed;
  z-index: 1000;
  margin: 0;
  pointer-events: none;
  cursor: grabbing;
  border-color: var(--color-primary);
  background: #f2f7fc;
  box-shadow: var(--shadow-md);
  transform: translateY(-2px) scale(1.04);
  transition: none;
}

.tile-enter-active,
.tile-leave-active {
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
}

.tile-move {
  transition: transform 0.18s ease;
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
