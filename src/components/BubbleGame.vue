<script setup lang="ts">
/**
 * "Bubble trouble" — the Colours group's mini-game. Rules live in
 * @/exercises/bubbles; this is the renderer, the input handling (keyboard and
 * touch) and the animation loop.
 *
 * The arena is measured in abstract units (100 wide), so everything here is a
 * multiplication by one scale factor picked from the measured stage.
 */
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import type { Word } from '@/db/types'
import {
  coloursFromWords,
  createGame,
  startGame,
  setMove,
  setAim,
  clearAim,
  fire,
  step,
  nextLevel,
  rerollTarget,
  bubbleRadius,
  readHighScore,
  recordHighScore,
  ARENA_WIDTH,
  MIN_ARENA_HEIGHT,
  MAX_ARENA_HEIGHT,
  PLAYER_SIZE,
  type Arena,
  type Bubble,
  type BubbleGame,
  type GameEvent,
  type Move,
} from '@/exercises/bubbles'
import { speakUzbek, stopSpeaking } from '@/audio/audio'

const props = defineProps<{ words: Word[] }>()
const emit = defineEmits<{ done: [] }>()

const colours = computed(() => coloursFromWords(props.words))

const arena = ref<Arena>({ width: ARENA_WIDTH, height: MIN_ARENA_HEIGHT })
const state = ref<BubbleGame>(createGame(arena.value, colours.value))
const best = ref(readHighScore())
const newBest = ref(false)
const paused = ref(false)
/** Bubbles the rope has just shrugged off, flashed so the miss is legible. */
const immune = ref<number[]>([])

// --- Animation loop ---------------------------------------------------------

let raf: number | undefined
let last = 0
let clearedAt: ReturnType<typeof setTimeout> | undefined

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  const dt = last ? (now - last) / 1000 : 0
  last = now
  if (state.value.status !== 'playing' || paused.value) return

  const result = step(state.value, dt)
  state.value = result.state
  for (const event of result.events) handle(event)
}

function handle(event: GameEvent) {
  if (event.kind === 'pop') {
    // Hear the colour you just read correctly.
    void speakUzbek(event.colour.uzbek)
    buzz(15)
  } else if (event.kind === 'immune') {
    flash(event.id)
    buzz(8)
  } else if (event.kind === 'target') {
    void speakUzbek(event.colour.uzbek)
  } else if (event.kind === 'hurt') {
    buzz([40, 60, 90])
  } else if (event.kind === 'cleared') {
    // A beat on the banner, then straight into the next board.
    clearedAt = setTimeout(() => {
      state.value = nextLevel(state.value)
      void speakUzbek(state.value.target.uzbek)
    }, 1300)
  } else if (event.kind === 'over') {
    finish()
  }
}

function flash(id: number) {
  immune.value = [...immune.value, id]
  setTimeout(() => {
    immune.value = immune.value.filter((i) => i !== id)
  }, 260)
}

function finish() {
  newBest.value = recordHighScore(state.value.popped)
  best.value = readHighScore()
  buzz([40, 60, 90])
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
  void speakUzbek(state.value.target.uzbek)
}

function move(dir: Move) {
  begin()
  state.value = setMove(state.value, dir)
}

function shoot() {
  begin()
  state.value = fire(state.value)
}

/** The die: name a different colour from the board. */
function reroll() {
  const before = state.value.target
  state.value = rerollTarget(state.value)
  if (state.value.target.id !== before.id) {
    void speakUzbek(state.value.target.uzbek)
    buzz(10)
  }
}

/** Tapping the name hears it again — the word is the thing being learned. */
function sayTarget() {
  void speakUzbek(state.value.target.uzbek)
}

// --- Dragging the avatar ----------------------------------------------------

/**
 * Grabbing the player and sliding steers them; letting go without having slid
 * anywhere is a tap, which fires. Below this many pixels of travel the gesture
 * is still a tap, so a slightly shaky finger still shoots.
 */
const TAP_SLOP = 8

const arenaEl = ref<HTMLElement | null>(null)
let dragPointer: number | null = null
let dragStartX = 0
let dragged = false

/** Pointer clientX to an arena x. */
function toArenaX(clientX: number): number {
  const rect = arenaEl.value?.getBoundingClientRect()
  if (!rect) return state.value.playerX
  return (clientX - rect.left) / scale.value
}

function onGrab(event: PointerEvent) {
  if (state.value.status === 'over' || paused.value) return
  begin()
  dragPointer = event.pointerId
  dragStartX = event.clientX
  dragged = false
  // Keep receiving moves once the finger slides off the avatar itself.
  ;(event.currentTarget as HTMLElement).setPointerCapture(event.pointerId)
  event.preventDefault()
}

function onDrag(event: PointerEvent) {
  if (dragPointer !== event.pointerId) return
  if (!dragged && Math.abs(event.clientX - dragStartX) < TAP_SLOP) return
  dragged = true
  state.value = setAim(state.value, toArenaX(event.clientX))
}

function onRelease(event: PointerEvent) {
  if (dragPointer !== event.pointerId) return
  dragPointer = null
  state.value = clearAim(state.value)
  // A grab that never went anywhere was a tap on the avatar: shoot.
  if (!dragged) shoot()
  dragged = false
}

function onKeyDown(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  if (key === 'arrowleft' || key === 'a') {
    event.preventDefault()
    move(-1)
  } else if (key === 'arrowright' || key === 'd') {
    event.preventDefault()
    move(1)
  } else if (key === ' ' || key === 'arrowup' || key === 'w') {
    event.preventDefault()
    shoot()
  } else if (key === 'r') {
    event.preventDefault()
    reroll()
  }
}

function onKeyUp(event: KeyboardEvent) {
  const key = event.key.toLowerCase()
  const leftUp = (key === 'arrowleft' || key === 'a') && state.value.move === -1
  const rightUp = (key === 'arrowright' || key === 'd') && state.value.move === 1
  if (leftUp || rightUp) state.value = setMove(state.value, 0)
}

function onVisibility() {
  if (document.hidden && state.value.status === 'playing' && !paused.value) {
    paused.value = true
    state.value = setMove(state.value, 0)
  }
}

function resume() {
  paused.value = false
  // The loop kept running; forget the time spent away.
  last = 0
}

function playAgain() {
  clearTimeout(clearedAt)
  newBest.value = false
  paused.value = false
  immune.value = []
  state.value = createGame(arena.value, colours.value)
}

function done() {
  clearTimeout(clearedAt)
  stopSpeaking()
  emit('done')
}

// --- Layout -----------------------------------------------------------------

const stage = ref<HTMLElement | null>(null)
/** Pixels per arena unit. */
const scale = ref(4)
let observer: ResizeObserver | undefined

function measure() {
  const el = stage.value
  if (!el) return
  const { clientWidth: w, clientHeight: h } = el
  if (!w || !h) return
  scale.value = w / ARENA_WIDTH
  const height = Math.min(MAX_ARENA_HEIGHT, Math.max(MIN_ARENA_HEIGHT, h / scale.value))
  if (Math.abs(height - arena.value.height) > 0.5) {
    arena.value = { width: ARENA_WIDTH, height }
    // Only a run that has not begun can be re-dealt to the new shape.
    if (state.value.status === 'ready') state.value = createGame(arena.value, colours.value)
    else state.value = { ...state.value, arena: arena.value }
  }
}

const arenaStyle = computed(() => ({
  width: `${ARENA_WIDTH * scale.value}px`,
  height: `${arena.value.height * scale.value}px`,
}))

function bubbleStyle(b: Bubble) {
  const d = bubbleRadius(b.size) * 2 * scale.value
  return {
    left: `${(b.x - bubbleRadius(b.size)) * scale.value}px`,
    top: `${(b.y - bubbleRadius(b.size)) * scale.value}px`,
    width: `${d}px`,
    height: `${d}px`,
    background: b.colour.swatch,
  }
}

const playerStyle = computed(() => ({
  left: `${(state.value.playerX - PLAYER_SIZE.width / 2) * scale.value}px`,
  top: `${(arena.value.height - PLAYER_SIZE.height) * scale.value}px`,
  width: `${PLAYER_SIZE.width * scale.value}px`,
  height: `${PLAYER_SIZE.height * scale.value}px`,
}))

const harpoonStyle = computed(() => {
  const h = state.value.harpoon
  if (!h) return null
  return {
    left: `${h.x * scale.value}px`,
    top: `${h.tipY * scale.value}px`,
    height: `${(arena.value.height - h.tipY) * scale.value}px`,
  }
})

const lives = computed(() => Array.from({ length: state.value.lives }, (_, i) => i))
/** Colours met so far — the run's difficulty, shown as a row of dots. */
const palette = computed(() => state.value.palette)

onMounted(() => {
  measure()
  if (typeof ResizeObserver !== 'undefined' && stage.value) {
    observer = new ResizeObserver(measure)
    observer.observe(stage.value)
  }
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  document.addEventListener('visibilitychange', onVisibility)
  raf = requestAnimationFrame(frame)
})

onBeforeUnmount(() => {
  if (raf !== undefined) cancelAnimationFrame(raf)
  clearTimeout(clearedAt)
  observer?.disconnect()
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('keyup', onKeyUp)
  document.removeEventListener('visibilitychange', onVisibility)
  stopSpeaking()
})
</script>

<template>
  <div class="bt" role="dialog" :aria-label="$t('bubbles.aria')">
    <div class="bt__card">
      <header class="bt__header">
        <div class="bt__titles">
          <span class="bt__eyebrow">{{ $t('bubbles.eyebrow') }}</span>
          <h2 class="bt__title">{{ $t('bubbles.title') }}</h2>
        </div>
        <button class="bt__close" type="button" :aria-label="$t('bubbles.skip')" @click="done">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div class="bt__hud">
        <span class="bt__stat">
          <span class="bt__stat-label">{{ $t('bubbles.level') }}</span>
          <strong class="bt__stat-value">{{ state.level }}</strong>
        </span>
        <span class="bt__stat">
          <span class="bt__stat-label">{{ $t('bubbles.popped') }}</span>
          <strong class="bt__stat-value">{{ state.popped }}</strong>
        </span>
        <span class="bt__stat">
          <span class="bt__stat-label">{{ $t('bubbles.best') }}</span>
          <strong class="bt__stat-value">{{ best }}</strong>
        </span>
        <span class="bt__stat bt__stat--lives" :aria-label="$t('bubbles.livesLeft', { count: state.lives })">
          <span class="bt__stat-label">{{ $t('bubbles.lives') }}</span>
          <span class="bt__hearts" aria-hidden="true">
            <span v-for="i in lives" :key="i" class="bt__heart">♥</span>
          </span>
        </span>
      </div>

      <div ref="stage" class="bt__stage">
        <div ref="arenaEl" class="bt__arena" :style="arenaStyle">
          <div
            v-for="b in state.bubbles"
            :key="b.id"
            class="bt__bubble"
            :class="{ 'bt__bubble--immune': immune.includes(b.id) }"
            :style="bubbleStyle(b)"
          ></div>

          <div v-if="harpoonStyle" class="bt__harpoon" :style="harpoonStyle">
            <span class="bt__harpoon-tip"></span>
          </div>

          <div
            class="bt__player"
            :style="playerStyle"
            role="button"
            tabindex="-1"
            :aria-label="$t('bubbles.avatar')"
            @pointerdown="onGrab"
            @pointermove="onDrag"
            @pointerup="onRelease"
            @pointercancel="onRelease"
          ></div>

          <div v-if="state.status === 'ready'" class="bt__overlay">
            <p class="bt__howto">{{ $t('bubbles.howTo') }}</p>
            <p class="bt__cue">{{ $t('bubbles.tapToStart') }}</p>
          </div>

          <div v-else-if="paused" class="bt__overlay">
            <p class="bt__cue">{{ $t('bubbles.paused') }}</p>
            <button class="btn btn--primary" type="button" @click="resume">
              {{ $t('bubbles.resume') }}
            </button>
          </div>

          <div v-else-if="state.status === 'cleared'" class="bt__overlay bt__overlay--flash">
            <p class="bt__over-title">{{ $t('bubbles.cleared', { level: state.level }) }}</p>
          </div>

          <div v-else-if="state.status === 'over'" class="bt__overlay">
            <p class="bt__over-title">{{ $t('bubbles.over') }}</p>
            <p class="bt__over-score">{{ $t('bubbles.finalScore', { count: state.popped }) }}</p>
            <p v-if="newBest" class="bt__new-best">{{ $t('bubbles.newBest') }}</p>
            <div class="bt__actions">
              <button class="btn btn--primary" type="button" @click="playAgain">
                {{ $t('bubbles.again') }}
              </button>
              <button class="btn btn--ghost" type="button" @click="done">
                {{ $t('bubbles.done') }}
              </button>
            </div>
          </div>
        </div>
      </div>

      <!-- The colour to shoot. Uzbek only: reading it is the game. -->
      <div class="bt__target">
        <span class="bt__target-label">{{ $t('bubbles.pop') }}</span>
        <button class="bt__target-word" type="button" lang="uz" :aria-label="$t('bubbles.sayIt')" @click="sayTarget">
          {{ state.target.uzbek }}
        </button>
        <button class="bt__die" type="button" :aria-label="$t('bubbles.reroll')" @click="reroll">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <rect x="3" y="3" width="18" height="18" rx="4" />
            <circle cx="8.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="8.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="8.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
            <circle cx="15.5" cy="15.5" r="1.4" fill="currentColor" stroke="none" />
          </svg>
        </button>
      </div>

      <div class="bt__palette" :aria-label="$t('bubbles.coloursInPlay', { count: palette.length })">
        <span
          v-for="c in palette"
          :key="c.id"
          class="bt__pip"
          :style="{ background: c.swatch }"
          aria-hidden="true"
        ></span>
      </div>

      <div class="bt__controls">
        <button
          class="bt__pad"
          type="button"
          :aria-label="$t('bubbles.left')"
          @pointerdown.prevent="move(-1)"
          @pointerup="move(0)"
          @pointerleave="move(0)"
          @pointercancel="move(0)"
        >
          ◀
        </button>
        <button class="bt__fire" type="button" :aria-label="$t('bubbles.fire')" @pointerdown.prevent="shoot">
          {{ $t('bubbles.fire') }}
        </button>
        <button
          class="bt__pad"
          type="button"
          :aria-label="$t('bubbles.right')"
          @pointerdown.prevent="move(1)"
          @pointerup="move(0)"
          @pointerleave="move(0)"
          @pointercancel="move(0)"
        >
          ▶
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bt {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(37, 28, 18, 0.55);
  backdrop-filter: blur(4px);
  /* The pads are held down; a drag must not scroll or pull-to-refresh. */
  touch-action: none;
}

.bt__card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: 100%;
  max-width: 440px;
  height: 100%;
  max-height: 800px;
  padding: 0.9rem 0.9rem calc(0.9rem + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.bt__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.bt__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bt__eyebrow {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bt__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1.2;
}

.bt__close {
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

.bt__close svg {
  width: 14px;
  height: 14px;
}

.bt__hud {
  display: flex;
  gap: 0.35rem;
}

.bt__stat {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.3rem 0.2rem;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.bt__stat-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.bt__stat-value {
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

.bt__hearts {
  display: flex;
  gap: 0.1rem;
  min-height: 1.05rem;
  align-items: center;
}

.bt__heart {
  font-size: 0.8rem;
  color: var(--color-gold);
  line-height: 1;
}

.bt__stage {
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bt__arena {
  position: relative;
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, var(--color-bg) 0%, rgba(0, 0, 0, 0.04) 100%);
  border: 1.5px solid var(--color-border);
  overflow: hidden;
}

.bt__bubble {
  position: absolute;
  border-radius: 50%;
  /* A soft highlight so dark and light swatches both read as spheres. */
  box-shadow:
    inset -0.18em -0.28em 0.6em rgba(0, 0, 0, 0.28),
    inset 0.18em 0.24em 0.5em rgba(255, 255, 255, 0.45),
    0 1px 3px rgba(37, 28, 18, 0.3);
  border: 1px solid rgba(37, 28, 18, 0.25);
}

/* Deliberately no marking on the shootable bubbles: working out which ones
   they are, from the Uzbek name alone, is the whole game. */

/* The rope went straight through: a quick, unmistakable "not this one". */
.bt__bubble--immune {
  animation: bt-shrug 0.26s ease;
}

@keyframes bt-shrug {
  0%,
  100% {
    transform: translateX(0);
    opacity: 1;
  }
  25% {
    transform: translateX(-9%);
    opacity: 0.55;
  }
  75% {
    transform: translateX(9%);
    opacity: 0.55;
  }
}

.bt__harpoon {
  position: absolute;
  width: 3px;
  margin-left: -1.5px;
  background: linear-gradient(180deg, var(--color-gold), var(--color-primary));
  border-radius: 2px;
}

.bt__harpoon-tip {
  position: absolute;
  top: -4px;
  left: 50%;
  width: 0;
  height: 0;
  transform: translateX(-50%);
  border-left: 4px solid transparent;
  border-right: 4px solid transparent;
  border-bottom: 6px solid var(--color-gold);
}

.bt__player {
  position: absolute;
  background: var(--color-primary);
  border-radius: 35% 35% 20% 20%;
  box-shadow: 0 0 0 2px rgba(27, 79, 138, 0.25);
  touch-action: none;
  cursor: grab;
}

.bt__player:active {
  cursor: grabbing;
}

/* The avatar is only a few arena units wide, which is a cruel touch target.
   This widens the grab area to a comfortable thumb without redrawing it. */
.bt__player::before {
  content: '';
  position: absolute;
  inset: -16px -22px;
}

.bt__overlay {
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

.bt__overlay--flash {
  background: rgba(245, 240, 232, 0.75);
}

.bt__howto {
  margin: 0;
  font-size: 0.88rem;
  line-height: 1.45;
  color: var(--color-text);
}

.bt__cue {
  margin: 0;
  font-size: 0.85rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.bt__over-title {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-primary);
}

.bt__over-score {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.bt__new-best {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-gold);
}

.bt__actions {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  width: 100%;
  max-width: 220px;
  margin-top: 0.3rem;
}

.bt__target {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.6rem;
  background: var(--color-bg);
  border: 1.5px solid var(--color-gold);
  border-radius: var(--radius-sm);
}

.bt__target-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  flex-shrink: 0;
}

.bt__target-word {
  flex: 1;
  min-width: 0;
  padding: 0.1rem 0.2rem;
  font-size: 1.35rem;
  font-weight: 800;
  color: var(--color-text);
  text-align: center;
  background: none;
  border: none;
  line-height: 1.15;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.bt__die {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  flex-shrink: 0;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-primary);
}

.bt__die svg {
  width: 22px;
  height: 22px;
}

.bt__die:active {
  transform: rotate(-18deg);
}

.bt__palette {
  display: flex;
  justify-content: center;
  gap: 0.25rem;
  min-height: 10px;
}

.bt__pip {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  border: 1px solid rgba(37, 28, 18, 0.25);
}

.bt__controls {
  display: grid;
  grid-template-columns: 1fr 1.4fr 1fr;
  gap: 0.4rem;
}

.bt__pad,
.bt__fire {
  padding: 0.75rem 0.5rem;
  font-size: 1rem;
  font-weight: 800;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  user-select: none;
}

.bt__fire {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  font-size: 0.85rem;
}

.bt__pad:active,
.bt__fire:active {
  transform: translateY(1px);
}

@media (prefers-reduced-motion: reduce) {
  .bt__bubble--immune {
    animation: none;
    opacity: 0.55;
  }
}
</style>
