<script setup lang="ts">
/**
 * "Bazar hero" — the mini-game where you price up a market stall by reading
 * soʻm prices aloud in Uzbek. Rules live in @/exercises/bazar; this is the
 * renderer, the input handling and the animation loop.
 *
 * The belt runs top to bottom so the item being priced is the one nearest the
 * register — your eye never has to travel between the number you are reading
 * and the words you are pressing. Everything on screen is positioned from a
 * single number per item, its `position` from 0 (the ramp) to 1 (the bin).
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  advance,
  createGame,
  currencyFor,
  formatConverted,
  formatSom,
  pressToken,
  readHighScore,
  recordHighScore,
  registerCells,
  registerGeneration,
  startGame,
  BIN_CAPACITY,
  BONUS_ITEMS,
  type BazarState,
  type BeltItem,
  type RegisterCell,
} from '@/exercises/bazar'
import { uzbekCardinalTokens } from '@/exercises/numbers'
import { primeUzbekAudio, createSpeaker, NEIGHBOUR_VOICE_LANGS } from '@/audio/audio'
import { playKerching, playSmash } from '@/audio/sfx'
import { resumeAudio } from '@/audio/context'
import { useContentLang } from '@/i18n/content'

/** Speaks the game's own words, and silences only those. */
const speaker = createSpeaker()

const emit = defineEmits<{ done: [] }>()

const { locale } = useI18n()
const { gloss } = useContentLang()

const state = ref<BazarState>(createGame())
const best = ref(readHighScore())
const newBest = ref(false)
const paused = ref(false)
/** Set briefly when a token is refused — the red X. */
const refused = ref(false)
/** Bumped per refusal so a fast second tap re-runs the X's animation. */
const refusedKey = ref(0)
/**
 * The item that just took a correct word, and a counter that flips the shake
 * between two identical animations. Re-adding a class the element already
 * carries does not restart its animation, and words often land faster than the
 * shake runs, so consecutive hits alternate to force a fresh one each time.
 */
const shook = ref<{ id: number; seq: number } | null>(null)
/** Items caught mid-flight into the trolley or the bin, for the animation. */
const bagging = ref<BeltItem[]>([])
const dumping = ref<BeltItem[]>([])
/** True while a bonus price is being read out, so the speaker can pulse. */
const reading = ref(false)
/** Set for a few seconds after the prices gain a significant figure. */
const digitsUp = ref(false)

const currency = computed(() => currencyFor(locale.value))
const cells = computed(() => registerCells(state.value))
const bonus = computed(() => state.value.phase === 'bonus')
/** Bin slots, filled first — three of them and the run is over. */
const bins = computed(() =>
  Array.from({ length: BIN_CAPACITY }, (_, i) => i < state.value.binned),
)

/**
 * Where an item's belt position sits on the belt itself, as a percentage.
 *
 * Not 0–100: an item is drawn centred on its position, so the ends are inset
 * far enough that a tag arriving on the ramp and the one being priced at the
 * bin are both fully on screen rather than half cut off by the edge.
 */
const BELT_INSET = 14
const BELT_SPAN = 72

function beltTop(position: number): string {
  return `${BELT_INSET + position * BELT_SPAN}%`
}

function som(price: number): string {
  return formatSom(price, locale.value)
}

function converted(price: number): string {
  return formatConverted(price, currency.value, locale.value)
}

/**
 * How big the word dots are. A four-figure price in the millions takes seven
 * words, and the ladder goes on lengthening from there — seven dots at the
 * full size are already wider than the tag they sit under, and a row of
 * seventeen wraps onto a second line however small they get.
 */
function dotSize(tokens: number): string {
  if (tokens <= 4) return '32px'
  if (tokens <= 6) return '24px'
  if (tokens <= 8) return '19px'
  return '14px'
}

/**
 * The pricetag's type size, from how long the number reads. A price in the
 * hundreds of billions is twenty characters with its unit, and at full size
 * that is twice the width of the tag.
 */
function priceClass(price: number): string | undefined {
  const length = som(price).length
  if (length > 12) return 'bh__tag-som--huge'
  if (length > 8) return 'bh__tag-som--long'
  return undefined
}

// --- Animation loop ---------------------------------------------------------

let raf: number | undefined
let last = 0
/** A tab that was in the background must not deliver its whole absence at once. */
const MAX_FRAME_MS = 100

function frame(now: number) {
  raf = requestAnimationFrame(frame)
  const dt = last ? now - last : 0
  last = now
  if (state.value.status !== 'playing' || paused.value) return

  const result = advance(state.value, Math.min(dt, MAX_FRAME_MS))
  state.value = result.state
  for (const item of result.binned) dump(item)
  if (result.bonusStarted) buzz([20, 60, 20])
  if (result.sigFigsUp) announceDigits()
  if (state.value.status === 'over') finish()
}

function finish() {
  newBest.value = recordHighScore(state.value.score)
  best.value = readHighScore()
  buzz([40, 60, 90])
}

let digitsUpAt: ReturnType<typeof setTimeout> | undefined

/**
 * Says why the prices suddenly got longer. Worth an explicit note: a reset to
 * hundreds looks like the game going backwards until you see the extra digit.
 */
function announceDigits() {
  clearTimeout(digitsUpAt)
  digitsUp.value = true
  buzz([15, 50, 15, 50, 15])
  digitsUpAt = setTimeout(() => {
    digitsUp.value = false
  }, 3500)
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // no haptics
  }
}

/** Shows an item dropping into the bin, then forgets it. */
function dump(item: BeltItem) {
  dumping.value = [...dumping.value, item]
  playSmash()
  buzz([30, 40, 30])
  setTimeout(() => {
    dumping.value = dumping.value.filter((i) => i.id !== item.id)
  }, 700)
}

/** Shows an item landing in the trolley, then forgets it. */
function bag(item: BeltItem) {
  bagging.value = [...bagging.value, item]
  playKerching()
  buzz(15)
  setTimeout(() => {
    bagging.value = bagging.value.filter((i) => i.id !== item.id)
  }, 700)
}

// --- Reading the prices -----------------------------------------------------

/**
 * A bonus price is read the moment its item reaches the front of the belt —
 * the round is a listening exercise, so hearing it is the whole prompt.
 *
 * Keyed on the item's id, not the item: every frame rebuilds the belt from
 * fresh objects, and re-reading on each of those would cancel the clip and
 * restart it sixty times a second, so it would never be heard at all.
 */
watch(
  () => (bonus.value ? state.value.items[0]?.id : undefined),
  (id) => {
    if (id === undefined || state.value.status !== 'playing') return
    const front = state.value.items[0]
    if (front) sayPrice(front)
  },
)

/**
 * Every clip the belt is about to need, opened before it needs it.
 *
 * A word is spoken the instant its key goes down, which only holds if the file
 * is already open: the first play of a clip has to fetch and decode it, and
 * that delay is exactly the lag between pressing a word and hearing it. Keyed
 * on the item ids so this runs when the belt changes rather than every frame.
 */
watch(
  () => state.value.items.map((item) => item.id).join(),
  () => {
    // Shop items are read a word at a time; a bonus price is one whole clip.
    const texts = state.value.items.flatMap((item) =>
      item.bonus ? [uzbekCardinalTokens(item.price).join(' ')] : item.tokens,
    )
    if (texts.length) void primeUzbekAudio(texts)
  },
  { immediate: true },
)

/**
 * Reads an item's price aloud.
 *
 * The bonus round plays a whole prebuilt recording, because recognising a
 * number by ear needs it spoken as one — and falls back to a Turkish, Russian
 * or Arabic voice, any of which reads Uzbek far better than a default English
 * one. Everywhere else the price is stitched from one clip per word, which is
 * all that is possible for numbers this large.
 */
function sayPrice(item: BeltItem) {
  const words = uzbekCardinalTokens(item.price)
  reading.value = true
  const finished = item.bonus
    ? speaker.speak(words.join(' '), { langs: NEIGHBOUR_VOICE_LANGS })
    : speaker.speakWords(words)
  void finished.finally(() => {
    reading.value = false
  })
}

// --- The register -----------------------------------------------------------

/**
 * The retiring three fade out, then their replacements fade in a little
 * slower. Every button on the board is live, so this is the only thing that
 * marks the three going and the three arriving: it wants to be seen, not
 * hurried past.
 */
const SWAP_OUT_MS = 200
const SWAP_IN_MS = 300

/**
 * The board as drawn.
 *
 * It lags the game state by one fade: a group that has just retired keeps its
 * old words on screen while they fade, and only then takes the new ones. The
 * game state has already moved on, so a fading button is dead to the touch —
 * what you press is always the word the state expects.
 */
const shown = ref<RegisterCell[]>([])
/** Per button: 'out' while its old word fades, 'in' as the new one lands. */
const swapping = ref<('out' | 'in' | null)[]>([])
const swapTimers = new Map<number, ReturnType<typeof setTimeout>>()
/** The generation drawn; a rebuilt board arrives whole, not group by group. */
let shownGen = -1

function clearSwaps() {
  for (const timer of swapTimers.values()) clearTimeout(timer)
  swapTimers.clear()
}

/** Retires one button: its word fades, then its replacement fades in place. */
function swapCell(index: number, cell: RegisterCell) {
  clearTimeout(swapTimers.get(index))
  swapping.value[index] = 'out'
  swapTimers.set(
    index,
    setTimeout(() => {
      shown.value[index] = cell
      swapping.value[index] = 'in'
      swapTimers.set(
        index,
        setTimeout(() => {
          swapping.value[index] = null
        }, SWAP_IN_MS),
      )
    }, SWAP_OUT_MS),
  )
}

/**
 * The board only changes when the state hands back a new array of cells: a
 * group retiring, or — rarely — the whole board being rebuilt after the run
 * loses its place. Everything else the belt does leaves it alone, and so does
 * this: only the cells whose seq moved are animated, the rest are untouched.
 */
watch(
  cells,
  (next) => {
    const gen = registerGeneration(state.value)
    if (gen !== shownGen || next.length !== shown.value.length) {
      shownGen = gen
      clearSwaps()
      shown.value = [...next]
      swapping.value = next.map(() => null)
      return
    }
    next.forEach((cell, index) => {
      if (cell.seq !== shown.value[index].seq) swapCell(index, cell)
    })
  },
  { immediate: true },
)

// --- Input ------------------------------------------------------------------

function begin() {
  if (state.value.status !== 'ready') return
  // The one tap before the first word: wake the audio here rather than make the
  // first press pay for it.
  resumeAudio()
  state.value = startGame(state.value)
  last = 0
}

function press(token: string) {
  // The register is live only once the run has started: a tap that doubles as
  // "begin" gets counted as an answer too, and it is almost always a wrong one.
  if (state.value.status !== 'playing' || paused.value) return
  const front = state.value.items[0]
  const result = pressToken(state.value, token)
  // Hear the word you just said, now, before anything else happens — a price
  // read out after the fact is read over the item that replaced it, and lands
  // as a number from nowhere. The bonus round is keyed in digits and says its
  // own price, so there is nothing to echo there.
  if (result.accepted && front && !front.bonus) void speaker.speakWord(token)
  state.value = result.state
  if (result.bagged) {
    bag(result.bagged)
  } else if (result.accepted) {
    if (front) flashCorrect(front.id)
  } else {
    flashRefusal()
  }
}

let shookAt: ReturnType<typeof setTimeout> | undefined

/** Shakes the item that just took a word, so a right answer lands as an event. */
function flashCorrect(id: number) {
  clearTimeout(shookAt)
  shook.value = { id, seq: (shook.value?.seq ?? 0) + 1 }
  buzz(12)
  shookAt = setTimeout(() => {
    shook.value = null
  }, 420)
}

/** Alternating class names, so each correct word restarts the shake. */
function shakeClass(id: number): string | undefined {
  if (shook.value?.id !== id) return undefined
  return shook.value.seq % 2 ? 'bh__item--shookA' : 'bh__item--shookB'
}

let refusedAt: ReturnType<typeof setTimeout> | undefined

function flashRefusal() {
  clearTimeout(refusedAt)
  // A new element each time: re-setting a ref that is already true leaves the
  // old X in place mid-animation, so a quick second wrong tap showed nothing.
  refusedKey.value++
  refused.value = true
  buzz(35)
  refusedAt = setTimeout(() => {
    refused.value = false
  }, 400)
}

/**
 * The number row is a shortcut to the register: in the bonus round the digits
 * are literal, and in the shop 1–9 press the nine buttons left to right.
 */
function onKeyDown(event: KeyboardEvent) {
  if (event.metaKey || event.ctrlKey || event.altKey) return
  const key = event.key
  if (key === 'Escape') {
    event.preventDefault()
    done()
    return
  }
  if (!/^[0-9]$/.test(key)) return
  event.preventDefault()
  if (bonus.value) {
    press(key)
    return
  }
  const index = (Number(key) + 9) % 10
  const cell = shown.value[index]
  // A button mid-fade is on its way out; it is not answering for anyone.
  if (cell && swapping.value[index] !== 'out') press(cell.token)
}

function onVisibility() {
  if (document.hidden && state.value.status === 'playing' && !paused.value) {
    paused.value = true
    speaker.stop()
  }
}

function resume() {
  paused.value = false
  // The loop kept running; forget the time spent away.
  last = 0
}

function playAgain() {
  newBest.value = false
  clearTimeout(digitsUpAt)
  digitsUp.value = false
  clearSwaps()
  shownGen = -1
  paused.value = false
  refused.value = false
  clearTimeout(shookAt)
  shook.value = null
  bagging.value = []
  dumping.value = []
  state.value = createGame()
  last = 0
}

function done() {
  speaker.stop()
  emit('done')
}

onMounted(() => {
  raf = requestAnimationFrame(frame)
  window.addEventListener('keydown', onKeyDown)
  document.addEventListener('visibilitychange', onVisibility)
})

onBeforeUnmount(() => {
  if (raf !== undefined) cancelAnimationFrame(raf)
  clearTimeout(refusedAt)
  clearTimeout(shookAt)
  clearTimeout(digitsUpAt)
  clearSwaps()
  window.removeEventListener('keydown', onKeyDown)
  document.removeEventListener('visibilitychange', onVisibility)
  speaker.stop()
})
</script>

<template>
  <div class="bh" role="dialog" :aria-label="$t('bazar.aria')">
    <div class="bh__card">
      <header class="bh__header">
        <div class="bh__titles">
          <span class="bh__eyebrow">{{ $t('bazar.eyebrow') }}</span>
          <h2 class="bh__title">{{ $t('bazar.title') }}</h2>
        </div>
        <button class="bh__close" type="button" :aria-label="$t('bazar.skip')" @click="done">
          <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div class="bh__hud">
        <span class="bh__stat bh__stat--wide">
          <span class="bh__stat-label">{{ $t('bazar.score') }}</span>
          <strong class="bh__stat-value">{{ som(state.score) }}</strong>
        </span>
        <span class="bh__stat">
          <span class="bh__stat-label">{{ $t('bazar.best') }}</span>
          <strong class="bh__stat-value">{{ som(best) }}</strong>
        </span>
        <span class="bh__stat bh__stat--bins" :aria-label="$t('bazar.binned', { count: state.binned })">
          <span class="bh__stat-label">{{ $t('bazar.bin') }}</span>
          <span class="bh__bins" aria-hidden="true">
            <span v-for="(full, i) in bins" :key="i" class="bh__bin-pip" :class="{ 'bh__bin-pip--full': full }">
              {{ full ? '🗑️' : '·' }}
            </span>
          </span>
        </span>
      </div>

      <!-- The belt. Items run from the ramp at the top to the bin at the bottom. -->
      <div class="bh__belt" :class="{ 'bh__belt--bonus': bonus }">
        <div class="bh__lane" aria-hidden="true"></div>

        <div
          v-for="(item, index) in state.items"
          :key="item.id"
          class="bh__item"
          :class="[{ 'bh__item--front': index === 0 }, shakeClass(item.id)]"
          :style="{ top: beltTop(item.position) }"
        >
          <span class="bh__emoji">{{ item.item.emoji }}</span>

          <!--
            The price is the thing being read, so it carries the tag: the names
            sit small above it and the home-currency conversion small below.
          -->
          <div class="bh__tag">
            <span class="bh__tag-names">
              <span class="bh__tag-uz" lang="uz">{{ item.item.uzbek }}</span>
              <span class="bh__tag-gloss">{{ gloss(item.item) }}</span>
            </span>
            <button
              v-if="item.bonus"
              class="bh__speaker"
              :class="{ 'bh__speaker--reading': reading && index === 0 }"
              type="button"
              :disabled="index !== 0"
              :aria-label="$t('bazar.hearPrice')"
              @click="sayPrice(item)"
            >
              🔊
            </button>
            <template v-else>
              <strong class="bh__tag-som" :class="priceClass(item.price)">
                {{ som(item.price) }} {{ $t('bazar.som') }}
              </strong>
              <span class="bh__tag-fx">≈ {{ converted(item.price) }}</span>
            </template>
          </div>

          <span
            class="bh__dots"
            :style="{ '--bh-dot': dotSize(item.tokens.length) }"
            :aria-label="$t('bazar.dots', { done: item.typed, total: item.tokens.length })"
          >
            <span
              v-for="dot in item.tokens.length"
              :key="dot"
              class="bh__dot"
              :class="{ 'bh__dot--on': dot <= item.typed }"
              aria-hidden="true"
            ></span>
          </span>
        </div>

        <!-- Items on their way out, one way or the other. -->
        <div v-for="item in bagging" :key="`bag-${item.id}`" class="bh__fly bh__fly--bag">
          {{ item.item.emoji }}
        </div>
        <div v-for="item in dumping" :key="`dump-${item.id}`" class="bh__fly bh__fly--dump">
          {{ item.item.emoji }}
        </div>

        <div v-if="refused" :key="refusedKey" class="bh__refused" aria-hidden="true">✗</div>

        <div v-if="state.status === 'ready'" class="bh__overlay">
          <p class="bh__howto">{{ $t('bazar.howTo') }}</p>
          <button class="btn btn--primary" type="button" autofocus @click="begin">
            {{ $t('bazar.start') }}
          </button>
        </div>

        <div v-else-if="paused" class="bh__overlay">
          <p class="bh__cue">{{ $t('bazar.paused') }}</p>
          <button class="btn btn--primary" type="button" @click="resume">
            {{ $t('bazar.resume') }}
          </button>
        </div>

        <div v-else-if="state.status === 'over'" class="bh__overlay">
          <p class="bh__over-title">{{ $t('bazar.over') }}</p>
          <p class="bh__over-score">
            {{ $t('bazar.finalScore', { score: som(state.score), som: $t('bazar.som') }) }}
          </p>
          <p class="bh__over-sub">
            {{ $t('bazar.finalItems', { count: state.cleared }) }} · ≈ {{ converted(state.score) }}
          </p>
          <p v-if="newBest" class="bh__new-best">{{ $t('bazar.newBest') }}</p>
          <div class="bh__actions">
            <button class="btn btn--primary" type="button" @click="playAgain">
              {{ $t('bazar.again') }}
            </button>
            <button class="btn btn--ghost" type="button" @click="done">
              {{ $t('bazar.done') }}
            </button>
          </div>
        </div>
      </div>

      <div class="bh__floor">
        <span class="bh__trolley" :class="{ 'bh__trolley--full': bagging.length }" aria-hidden="true">🛒</span>
        <p v-if="bonus" class="bh__banner">
          {{ $t('bazar.bonusHowTo', { count: BONUS_ITEMS }) }}
        </p>
        <p v-else-if="digitsUp" class="bh__banner bh__banner--digits">
          {{ $t('bazar.digitsUp', { count: state.sigFigs }) }}
        </p>
        <p v-else class="bh__approx">{{ $t('bazar.approx') }}</p>
        <span class="bh__bin" :class="{ 'bh__bin--hit': dumping.length }" aria-hidden="true">🗑️</span>
      </div>

      <!--
        The cash register: nine number words in the shop, three of them
        swapping out on every correct tap, or the fixed keypad in the bonus
        round. Keyed by position rather than by word, so a button that changes
        its word animates in place instead of being replaced.
      -->
      <div
        class="bh__register"
        :class="{ 'bh__register--keypad': bonus }"
        role="group"
        :aria-label="bonus ? $t('bazar.keypad') : $t('bazar.register')"
      >
        <button
          v-for="(cell, index) in shown"
          :key="index"
          class="bh__key"
          :class="[
            { 'bh__key--zero': bonus && cell.token === '0' },
            swapping[index] === 'out' ? 'bh__key--out' : '',
            swapping[index] === 'in' ? 'bh__key--in' : '',
          ]"
          type="button"
          :lang="bonus ? undefined : 'uz'"
          :disabled="state.status === 'over' || paused || swapping[index] === 'out'"
          @click="press(cell.token)"
        >
          {{ cell.token }}
        </button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.bh {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(37, 28, 18, 0.55);
  backdrop-filter: blur(4px);
  touch-action: manipulation;
}

.bh__card {
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

.bh__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.bh__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.bh__eyebrow {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.bh__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1.2;
}

.bh__close {
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

.bh__close svg {
  width: 14px;
  height: 14px;
}

/* --- Score line --- */

.bh__hud {
  display: flex;
  gap: 0.35rem;
}

.bh__stat {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  padding: 0.3rem 0.2rem;
  background: var(--color-primary-wash);
  border-radius: var(--radius-sm);
}

.bh__stat--wide {
  flex: 1.4;
}

/* The bin is three pips wide whatever happens, so every pixel it does not
   need goes to the totals — which run to ten digits and a lot of separators. */
.bh__stat--bins {
  flex: 0 0 auto;
}

.bh__stat-label {
  font-size: 0.6rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.bh__stat-value {
  max-width: 100%;
  font-size: 0.85rem;
  font-weight: 800;
  color: var(--color-primary);
  font-variant-numeric: tabular-nums;
  /* A soʻm total is one long number: it must not wrap, and on the rare run
     that outgrows its tile it shrinks rather than spilling into the next. */
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bh__bins {
  display: flex;
  gap: 0.1rem;
  font-size: 0.8rem;
  line-height: 1.2;
}

.bh__bin-pip {
  opacity: 0.35;
}

.bh__bin-pip--full {
  opacity: 1;
}

/* --- The belt --- */

.bh__belt {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: linear-gradient(180deg, var(--color-bg), #ece4d6);
}

.bh__belt--bonus {
  background: linear-gradient(180deg, #fdf7e6, #f6ead0);
}

/* The rollers: a repeating rung pattern down the middle of the belt. */
.bh__lane {
  position: absolute;
  inset: 0;
  background-image: repeating-linear-gradient(
    180deg,
    rgba(107, 101, 89, 0.14) 0,
    rgba(107, 101, 89, 0.14) 2px,
    transparent 2px,
    transparent 22px
  );
}

.bh__item {
  position: absolute;
  left: 50%;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.1rem;
  width: min(88%, 320px);
  /* `top` is the item's belt position (see beltTop); this centres it there. */
  transform: translate(-50%, -50%);
  opacity: 0.75;
  text-align: center;
}

.bh__item--front {
  opacity: 1;
}

.bh__emoji {
  font-size: 2.4rem;
  line-height: 1;
}

.bh__item--front .bh__emoji {
  font-size: 2.9rem;
}

.bh__tag {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 0.2rem 0.55rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
}

.bh__item--front .bh__tag {
  border-color: var(--color-primary);
}

/* Top line: what the thing is called, in both languages, kept out of the way. */
.bh__tag-names {
  display: flex;
  align-items: baseline;
  justify-content: center;
  flex-wrap: wrap;
  gap: 0.3rem;
  font-size: 0.72rem;
  line-height: 1.25;
}

.bh__tag-uz {
  font-weight: 700;
  color: var(--color-primary);
}

.bh__tag-gloss {
  font-weight: 400;
  color: var(--color-text-muted);
}

/* The price carries the tag — it is the thing being read aloud. */
.bh__tag-som {
  font-size: 1.6rem;
  font-weight: 800;
  line-height: 1.15;
  color: var(--color-text);
  font-variant-numeric: tabular-nums;
}

/* Eight million-odd soʻm plus its unit is fifteen characters; at full size
   that is wider than the tag on a narrow phone. Ten figures and up — which the
   endless significant-figure ramp gets to eventually — need another step. */
.bh__tag-som--long {
  font-size: 1.3rem;
}

.bh__tag-som--huge {
  font-size: 1.05rem;
}

.bh__tag-fx {
  font-size: 0.68rem;
  font-weight: 400;
  color: var(--color-text-muted);
  font-variant-numeric: tabular-nums;
}

.bh__speaker {
  padding: 0 0.15rem;
  font-size: 1.1rem;
  line-height: 1;
  background: none;
  border: none;
}

.bh__speaker--reading {
  animation: bh-pulse 0.7s ease-in-out infinite;
}

@keyframes bh-pulse {
  0%,
  100% {
    transform: scale(1);
  }
  50% {
    transform: scale(1.35);
  }
}

/* A long enough price runs to more dots than fit across a tag; they wrap onto
   a second line rather than shrinking past being seen. */
.bh__dots {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.3rem;
  margin-top: 0.3rem;
}

.bh__dot {
  /* Set per item from the word count; see dotSize. */
  width: var(--bh-dot, 32px);
  height: var(--bh-dot, 32px);
  border-radius: 50%;
  background: var(--color-border);
  box-shadow: inset 0 0 0 1px rgba(0, 0, 0, 0.08);
}

/*
 * A word landing is worth seeing: the dot drops in over its grey slot, big and
 * clear, and settles. Each dot only ever turns on once, so adding the class is
 * enough to run this — unlike the shake, which has to alternate to restart.
 */
.bh__dot--on {
  background: var(--color-teal);
  animation: bh-dot-in 0.34s cubic-bezier(0.2, 1.3, 0.5, 1) backwards;
}

@keyframes bh-dot-in {
  0% {
    transform: scale(2.4);
    opacity: 0;
  }
  60% {
    opacity: 1;
  }
  100% {
    transform: scale(1);
    opacity: 1;
  }
}

/*
 * The whole item jolts on a correct word. Both keyframes are identical: the
 * class alternates so a fast run of right answers restarts the animation
 * rather than leaving the first one to finish alone. The translate is carried
 * through every step because it is what centres the item on the belt.
 */
.bh__item--shookA {
  animation: bh-shake-a 0.4s ease-out;
}

.bh__item--shookB {
  animation: bh-shake-b 0.4s ease-out;
}

@keyframes bh-shake-a {
  0%,
  100% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  20% {
    transform: translate(calc(-50% - 5px), -50%) rotate(-2.5deg) scale(1.04);
  }
  45% {
    transform: translate(calc(-50% + 5px), -50%) rotate(2.5deg) scale(1.04);
  }
  70% {
    transform: translate(calc(-50% - 3px), -50%) rotate(-1.5deg) scale(1.02);
  }
}

@keyframes bh-shake-b {
  0%,
  100% {
    transform: translate(-50%, -50%) rotate(0deg);
  }
  20% {
    transform: translate(calc(-50% - 5px), -50%) rotate(-2.5deg) scale(1.04);
  }
  45% {
    transform: translate(calc(-50% + 5px), -50%) rotate(2.5deg) scale(1.04);
  }
  70% {
    transform: translate(calc(-50% - 3px), -50%) rotate(-1.5deg) scale(1.02);
  }
}

/* --- Leaving the belt --- */

.bh__fly {
  position: absolute;
  bottom: 0.2rem;
  font-size: 2rem;
  pointer-events: none;
}

.bh__fly--bag {
  left: 0.6rem;
  animation: bh-bag 0.7s ease-out forwards;
}

.bh__fly--dump {
  right: 0.6rem;
  animation: bh-dump 0.7s ease-in forwards;
}

@keyframes bh-bag {
  0% {
    transform: translateY(-40px) scale(1);
    opacity: 1;
  }
  100% {
    transform: translateY(6px) scale(0.4);
    opacity: 0;
  }
}

@keyframes bh-dump {
  0% {
    transform: translateY(-30px) rotate(0deg);
    opacity: 1;
  }
  100% {
    transform: translateY(10px) rotate(50deg);
    opacity: 0;
  }
}

/* A refused token: seen, but never in the way of the next tap. */
.bh__refused {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 6rem;
  font-weight: 800;
  color: var(--color-terracotta);
  opacity: 0.55;
  pointer-events: none;
  animation: bh-refuse 0.4s ease-out forwards;
}

@keyframes bh-refuse {
  0% {
    transform: scale(0.7);
    opacity: 0.7;
  }
  100% {
    transform: scale(1.15);
    opacity: 0;
  }
}

.bh__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 1.2rem;
  text-align: center;
  background: rgba(245, 240, 232, 0.94);
}

.bh__howto {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.45;
  color: var(--color-text);
}

.bh__cue {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-text-muted);
}

.bh__over-title {
  margin: 0;
  font-size: 1.3rem;
  font-weight: 800;
  color: var(--color-primary);
}

.bh__over-score {
  margin: 0;
  font-size: 0.95rem;
  font-weight: 700;
  color: var(--color-text);
}

.bh__over-sub {
  margin: 0;
  font-size: 0.78rem;
  color: var(--color-text-muted);
}

.bh__new-best {
  margin: 0;
  font-size: 0.9rem;
  font-weight: 800;
  color: var(--color-gold);
}

.bh__actions {
  display: flex;
  gap: 0.5rem;
}

/* --- Trolley, bin and the small print --- */

.bh__floor {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}

.bh__trolley,
.bh__bin {
  font-size: 1.5rem;
  line-height: 1;
  transition: transform 0.2s ease;
}

.bh__trolley--full {
  transform: scale(1.25);
}

.bh__bin--hit {
  transform: rotate(-12deg) scale(1.2);
}

.bh__approx,
.bh__banner {
  flex: 1;
  margin: 0;
  font-size: 0.68rem;
  text-align: center;
  color: var(--color-text-muted);
}

.bh__banner {
  font-weight: 700;
  color: var(--color-terracotta);
}

.bh__banner--digits {
  color: var(--color-gold);
}

/* --- The register --- */

/* Two rows of three, in the shop and on the keypad alike. */
.bh__register {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.35rem;
}

.bh__key {
  padding: 0.55rem 0.2rem;
  /*
   * Three columns of Uzbek number words, some of them eight characters long,
   * on a screen that can be 320px wide: the type has to come down with the
   * screen or "milliard" breaks across two lines mid-word.
   */
  font-size: min(0.95rem, 4.4vw);
  font-weight: 800;
  color: var(--color-primary);
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  box-shadow: var(--shadow-sm);
  overflow-wrap: anywhere;
}

.bh__key:active {
  transform: translateY(1px);
  background: var(--color-primary-wash);
}

.bh__key:disabled {
  opacity: 0.5;
}

/*
 * The three that answered leave, and three more arrive in their cells. A
 * retiring button is on its way out and cannot be pressed; the rest of the
 * board stays live throughout, which is why the swap can afford to be seen
 * rather than hurried.
 */
.bh__key--out {
  animation: bh-key-out 200ms ease-in forwards;
}

.bh__key--in {
  animation: bh-key-in 300ms ease-out backwards;
}

@keyframes bh-key-out {
  to {
    opacity: 0;
    transform: scale(0.94);
  }
}

@keyframes bh-key-in {
  from {
    opacity: 0;
    transform: scale(0.86);
  }
}

/* The wide zero bar along the bottom of the keypad. */
.bh__key--zero {
  grid-column: span 3;
}

.bh__register--keypad .bh__key {
  font-variant-numeric: tabular-nums;
  font-size: 1.15rem;
}

@media (prefers-reduced-motion: reduce) {
  /* The board still swaps on the same clock; it just does not move to do it. */
  .bh__key--out,
  .bh__key--in {
    animation: none;
  }

  .bh__fly,
  .bh__refused,
  .bh__speaker--reading,
  .bh__dot--on,
  .bh__item--shookA,
  .bh__item--shookB {
    animation-duration: 0.01ms;
  }

  .bh__trolley,
  .bh__bin {
    transition: none;
  }
}
</style>
