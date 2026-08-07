<script setup lang="ts">
/**
 * The bonus mini-game that follows a completed daily practice: snake, where the
 * only food that feeds the snake is the next number of the count, written in
 * Uzbek under a fruit. Rules live in @/exercises/snake; this is the renderer,
 * the input handling (swipe / arrow keys) and the tick loop.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  createGame,
  startGame,
  queueTurn,
  advance,
  tickInterval,
  readHighScore,
  recordHighScore,
  type Board,
  type Direction,
  type GameState,
  type OverReason,
  type Point,
} from '@/exercises/snake'
import { numberToUzbek } from '@/exercises/numbers'
import { speakUzbek, stopSpeaking } from '@/audio/audio'

const emit = defineEmits<{ done: [] }>()

const { t } = useI18n()

// Ten columns across, then as many rows as the card is tall enough for.
const COLS = 10
const MIN_ROWS = 12
const MAX_ROWS = 20

const board = ref<Board>({ cols: COLS, rows: MIN_ROWS })
const state = ref<GameState>(createGame(board.value))
const best = ref(readHighScore())
const newBest = ref(false)
const paused = ref(false)

// --- Tick loop --------------------------------------------------------------

let timer: ReturnType<typeof setTimeout> | undefined

function clearTimer() {
  if (timer !== undefined) {
    clearTimeout(timer)
    timer = undefined
  }
}

function schedule() {
  clearTimer()
  timer = setTimeout(tick, tickInterval(state.value.score))
}

function tick() {
  if (state.value.status !== 'playing' || paused.value) return
  const result = advance(state.value)
  state.value = result.state
  if (result.ate) {
    // The whole point of the game: hear the number you just caught.
    void speakUzbek(result.ate.uzbek)
    buzz(15)
  }
  if (result.over) {
    finish(result.over)
    return
  }
  schedule()
}

function finish(over: OverReason) {
  clearTimer()
  newBest.value = recordHighScore(state.value.score)
  best.value = readHighScore()
  buzz([40, 60, 90])
  // Say the number they were reaching for, so the run ends on the right word.
  if (over.kind === 'wrong') void speakUzbek(numberToUzbek(over.expected))
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // no haptics
  }
}

// --- Input ------------------------------------------------------------------

function begin() {
  if (state.value.status !== 'ready') return
  state.value = startGame(state.value)
  schedule()
}

function steer(dir: Direction) {
  if (state.value.status === 'over' || paused.value) return
  state.value = queueTurn(state.value, dir)
  begin()
}

const KEYS: Record<string, Direction> = {
  arrowup: 'up',
  arrowdown: 'down',
  arrowleft: 'left',
  arrowright: 'right',
  w: 'up',
  s: 'down',
  a: 'left',
  d: 'right',
}

function onKey(event: KeyboardEvent) {
  const dir = KEYS[event.key.toLowerCase()]
  if (!dir) return
  event.preventDefault()
  steer(dir)
}

/** Below this many pixels a touch counts as a tap, not a swipe. */
const SWIPE_MIN = 24
let touchStart: { x: number; y: number } | null = null

function onTouchStart(event: TouchEvent) {
  const touch = event.changedTouches[0]
  touchStart = { x: touch.clientX, y: touch.clientY }
}

function onTouchEnd(event: TouchEvent) {
  if (!touchStart) return
  const touch = event.changedTouches[0]
  const dx = touch.clientX - touchStart.x
  const dy = touch.clientY - touchStart.y
  touchStart = null
  if (Math.abs(dx) < SWIPE_MIN && Math.abs(dy) < SWIPE_MIN) {
    // A tap is enough to get going, but never changes course mid-run.
    begin()
    return
  }
  steer(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : dy > 0 ? 'down' : 'up')
}

function onVisibility() {
  if (document.hidden && state.value.status === 'playing' && !paused.value) {
    paused.value = true
    clearTimer()
  }
}

function resume() {
  paused.value = false
  if (state.value.status === 'playing') schedule()
}

function playAgain() {
  clearTimer()
  newBest.value = false
  paused.value = false
  state.value = createGame(board.value)
}

function done() {
  clearTimer()
  stopSpeaking()
  emit('done')
}

// --- Layout -----------------------------------------------------------------

// The board is sized in whole pixels per cell so the grid stays square whatever
// the viewport does.
const stage = ref<HTMLElement | null>(null)
const cell = ref(24)
let observer: ResizeObserver | undefined

function measure() {
  const el = stage.value
  if (!el) return
  const { clientWidth: w, clientHeight: h } = el
  if (!w || !h) return
  cell.value = Math.max(12, Math.floor(Math.min(w / board.value.cols, h / board.value.rows)))
}

/** Picks the row count that fills the stage, before the first run is dealt. */
function fit() {
  const el = stage.value
  if (!el) return
  const { clientWidth: w, clientHeight: h } = el
  if (!w || !h) return
  const size = Math.max(12, Math.floor(w / COLS))
  board.value = { cols: COLS, rows: Math.min(MAX_ROWS, Math.max(MIN_ROWS, Math.floor(h / size))) }
  state.value = createGame(board.value)
  measure()
}

const boardStyle = computed(() => ({
  width: `${cell.value * board.value.cols}px`,
  height: `${cell.value * board.value.rows}px`,
}))

function cellStyle(p: Point) {
  return {
    left: `${p.x * cell.value}px`,
    top: `${p.y * cell.value}px`,
    width: `${cell.value}px`,
    height: `${cell.value}px`,
  }
}

/** Segments sit slightly inside their cell so the body reads as linked beads. */
function segStyle(p: Point) {
  const gap = Math.max(1, Math.round(cell.value * 0.08))
  return {
    left: `${p.x * cell.value + gap}px`,
    top: `${p.y * cell.value + gap}px`,
    width: `${cell.value - gap * 2}px`,
    height: `${cell.value - gap * 2}px`,
  }
}

const fruitSize = computed(() => `${Math.round(cell.value * 0.68)}px`)
const labelSize = computed(() => `${Math.max(8, Math.round(cell.value * 0.3))}px`)

const overText = computed(() => {
  const over = state.value.over
  if (!over) return ''
  if (over.kind === 'self') return t('snake.overSelf')
  return t('snake.overWrong', {
    picked: `${over.picked.uzbek} (${over.picked.value})`,
    expected: `${numberToUzbek(over.expected)} (${over.expected})`,
  })
})

onMounted(() => {
  fit()
  if (typeof ResizeObserver !== 'undefined' && stage.value) {
    observer = new ResizeObserver(measure)
    observer.observe(stage.value)
  }
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  clearTimer()
  observer?.disconnect()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibility)
  stopSpeaking()
})
</script>

<template>
  <div
    class="snake"
    role="dialog"
    :aria-label="$t('snake.aria')"
    @touchstart.passive="onTouchStart"
    @touchend="onTouchEnd"
  >
    <div class="snake__card">
      <header class="snake__header">
        <div class="snake__titles">
          <span class="snake__eyebrow">{{ $t('snake.eyebrow') }}</span>
          <h2 class="snake__title">{{ $t('snake.title') }}</h2>
        </div>
        <button class="snake__close" type="button" :aria-label="$t('snake.skip')" @click="done">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div class="snake__hud">
        <span class="snake__stat snake__stat--next">
          <span class="snake__stat-label">{{ $t('snake.next') }}</span>
          <strong class="snake__stat-value">{{ state.target }}</strong>
        </span>
        <span class="snake__stat">
          <span class="snake__stat-label">{{ $t('snake.score') }}</span>
          <strong class="snake__stat-value">{{ state.score }}</strong>
        </span>
        <span class="snake__stat">
          <span class="snake__stat-label">{{ $t('snake.best') }}</span>
          <strong class="snake__stat-value">{{ best }}</strong>
        </span>
      </div>

      <div ref="stage" class="snake__stage">
        <div class="snake__board" :style="boardStyle">
          <div
            v-for="(seg, i) in state.snake"
            :key="`seg-${i}`"
            class="snake__seg"
            :class="{ 'snake__seg--head': i === 0 }"
            :style="segStyle(seg)"
          ></div>

          <TransitionGroup name="food">
            <div
              v-for="food in state.foods"
              :key="`${state.target}-${food.value}`"
              class="snake__food"
              :style="cellStyle(food)"
            >
              <span class="snake__fruit" :style="{ fontSize: fruitSize }" aria-hidden="true">
                {{ food.emoji }}
              </span>
              <span class="snake__label" :style="{ fontSize: labelSize }">{{ food.uzbek }}</span>
            </div>
          </TransitionGroup>

          <div v-if="state.status === 'ready'" class="snake__overlay">
            <p class="snake__howto">{{ $t('snake.howTo') }}</p>
            <p class="snake__cue">{{ $t('snake.tapToStart') }}</p>
          </div>

          <div v-else-if="paused" class="snake__overlay">
            <p class="snake__cue">{{ $t('snake.paused') }}</p>
            <button class="btn btn--primary" type="button" @click="resume">
              {{ $t('snake.resume') }}
            </button>
          </div>

          <div v-else-if="state.status === 'over'" class="snake__overlay">
            <p class="snake__over-title">{{ $t('snake.over') }}</p>
            <p class="snake__over-reason">{{ overText }}</p>
            <p v-if="newBest" class="snake__new-best">{{ $t('snake.newBest') }}</p>
            <p v-else class="snake__over-score">{{ $t('snake.finalScore', { score: state.score }) }}</p>
            <div class="snake__actions">
              <button class="btn btn--primary" type="button" @click="playAgain">
                {{ $t('snake.again') }}
              </button>
              <button class="btn btn--ghost" type="button" @click="done">
                {{ $t('snake.done') }}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.snake {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(37, 28, 18, 0.55);
  backdrop-filter: blur(4px);
  /* Swipes steer the snake; they must not scroll or pull-to-refresh the page. */
  touch-action: none;
}

.snake__card {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
  max-width: 440px;
  height: 100%;
  max-height: 760px;
  padding: 0.9rem 0.9rem calc(0.9rem + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.snake__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.snake__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.snake__eyebrow {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.snake__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1.2;
}

.snake__close {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  flex-shrink: 0;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.snake__close svg {
  width: 14px;
  height: 14px;
}

.snake__hud {
  display: flex;
  gap: 0.4rem;
}

.snake__stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.35rem 0.2rem;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.snake__stat--next {
  border-color: var(--color-gold);
}

.snake__stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.snake__stat-value {
  font-size: 1.1rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

.snake__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.snake__board {
  position: relative;
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  overflow: hidden;
}

.snake__seg {
  position: absolute;
  background: var(--color-primary-light);
  border-radius: 30%;
}

.snake__seg--head {
  background: var(--color-primary);
  border-radius: 45%;
  box-shadow: 0 0 0 2px rgba(27, 79, 138, 0.25);
}

.snake__food {
  position: absolute;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}

.snake__fruit {
  line-height: 1;
  filter: drop-shadow(0 1px 2px rgba(37, 28, 18, 0.25));
}

.snake__label {
  position: absolute;
  top: 100%;
  left: 50%;
  transform: translate(-50%, -0.1em);
  max-width: 260%;
  padding: 0 0.25em;
  font-weight: 700;
  line-height: 1.15;
  color: var(--color-text);
  background: rgba(255, 255, 255, 0.82);
  border-radius: 0.4em;
  text-align: center;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* Eaten and replaced: the whole set swaps out between numbers. */
.food-enter-active,
.food-leave-active {
  transition:
    transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1),
    opacity 0.22s ease;
}

.food-enter-from,
.food-leave-to {
  opacity: 0;
  transform: scale(0.3);
}

.snake__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 1.25rem;
  text-align: center;
  background: rgba(245, 240, 232, 0.92);
}

.snake__howto {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--color-text);
}

.snake__cue {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.snake__over-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-primary);
}

.snake__over-reason {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.45;
  color: var(--color-text);
}

.snake__over-score {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.snake__new-best {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-gold);
}

.snake__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 220px;
  margin-top: 0.3rem;
}

@media (prefers-reduced-motion: reduce) {
  .food-enter-active,
  .food-leave-active {
    transition-duration: 0.01ms;
  }
}
</style>
