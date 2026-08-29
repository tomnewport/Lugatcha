<script setup lang="ts">
/**
 * "Taksi haydovchi" — the mini-game where a passenger gives you directions in
 * Uzbek and you drive them there. The rules live in @/exercises/taxi; this is
 * the map, the dragging and the sound.
 *
 * The map is one SVG in city units — an intersection is a whole number, so
 * every position on screen comes straight out of the game state and pointer
 * coordinates go back the other way with the same two constants. Dragging is
 * deliberately block-at-a-time rather than free: the taxi is on the streets,
 * and a drag that cut a corner would be answering a question about corners.
 *
 * The instruction is spoken clause by clause, each one a whole recorded
 * sentence, and shown in Uzbek only. The landmarks on the map are labelled in
 * the learner's own language, which is the point of the last levels: knowing
 * that *kasalxona* is the hospital is what turns the instruction into a place.
 */
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import {
  buyWord,
  continueRun,
  createGame,
  drive,
  dropOff,
  landmark,
  levelFor,
  purse,
  readHighScore,
  recordHighScore,
  routeUzbek,
  startGame,
  wordKey,
  CITY_HEIGHT,
  CITY_WIDTH,
  EAST,
  LIVES,
  NORTH,
  PATIENCE,
  SOUTH,
  FUEL_PER_BLOCK,
  WEST,
  WORD_PRICE,
  type Dir,
  type Fare,
  type Landmark,
  type Point,
  type Step,
  type TaxiState,
  type Word,
} from '@/exercises/taxi'
import { formatSom } from '@/exercises/bazar'
import {
  primeUzbekAudio,
  speakUzbek,
  speakUzbekWord,
  stopSpeaking,
  NEIGHBOUR_VOICE_LANGS,
} from '@/audio/audio'
import { playChime, playHorn } from '@/audio/sfx'
import { resumeAudio } from '@/audio/context'
import { useContentLang } from '@/i18n/content'
import { useI18n } from 'vue-i18n'

const emit = defineEmits<{ done: [] }>()

const { t, locale } = useI18n()
const { gloss } = useContentLang()

const state = ref<TaxiState>(createGame())
const best = ref(readHighScore())
const newBest = ref(false)
const paused = ref(false)
/** True while the passenger is talking, so the speech bubble can pulse. */
const speaking = ref(false)

// --- Laying the city out ----------------------------------------------------

/** SVG units per block, and the margin that leaves room for the edge labels. */
const STEP = 100
const PAD = 52

const viewWidth = PAD * 2 + (CITY_WIDTH - 1) * STEP
const viewHeight = PAD * 2 + (CITY_HEIGHT - 1) * STEP
const viewBox = `0 0 ${viewWidth} ${viewHeight}`

function px(value: number): number {
  return PAD + value * STEP
}

/** Every open street, as a line to draw. */
const streets = computed(() => {
  const city = state.value.city
  const lines: { x1: number; y1: number; x2: number; y2: number }[] = []
  for (let y = 0; y < city.height; y++) {
    for (let x = 0; x < city.width - 1; x++) {
      if (city.h[y][x]) lines.push({ x1: px(x), y1: px(y), x2: px(x + 1), y2: px(y) })
    }
  }
  for (let y = 0; y < city.height - 1; y++) {
    for (let x = 0; x < city.width; x++) {
      if (city.v[y][x]) lines.push({ x1: px(x), y1: px(y), x2: px(x), y2: px(y + 1) })
    }
  }
  return lines
})

const places = computed(() =>
  state.value.city.places.flatMap((place) => {
    const found = landmark(place.id)
    return found ? [{ ...place, landmark: found }] : []
  }),
)

function pointsOf(path: readonly Point[]): string {
  return path.map((p) => `${px(p.x)},${px(p.y)}`).join(' ')
}

const taxiTransform = computed(() => {
  const taxi = state.value.taxi
  return `translate(${px(taxi.x)} ${px(taxi.y)}) rotate(${taxi.dir * 90})`
})

// --- The fare ---------------------------------------------------------------

const fare = computed<Fare | null>(() => state.value.fare)
const outcome = computed(() => state.value.outcome)
const playable = computed(() => state.value.status === 'playing' && !outcome.value && !paused.value)
const level = computed(() => levelFor(state.value.delivered) + 1)
/** The three lives, spent lamps first. */
const lamps = computed(() => Array.from({ length: LIVES }, (_, i) => i >= state.value.lives))
/** The passenger's patience with your wrong corners, spent pips first. */
const pips = computed(() => Array.from({ length: PATIENCE }, (_, i) => i < state.value.patience))

/** Every sum on screen is soʻm, grouped the way the bazar prints its prices. */
function som(amount: number): string {
  return formatSom(amount, locale.value)
}

/**
 * Money as it flies past the window: thousands, in a word.
 *
 * A sprite lasts under a second, which is not long enough to read "1 000", so
 * these say "1k" — and every sum in this game is a whole number of thousands.
 */
function shortSom(amount: number): string {
  const thousands = amount / 1_000
  const rounded = Number.isInteger(thousands) ? `${thousands}` : thousands.toFixed(1)
  return t('taxi.thousands', { amount: rounded })
}

/**
 * The little sums that rise off the taxi as money moves.
 *
 * The meter tile changes too quietly to notice mid-drag, so every block of fuel
 * and every word bought throws its price up off the roof of the cab, where the
 * driver is already looking. Spending is not a mistake — it is the job, and a
 * word bought is a word learned — so a price leaves in the same warm brown the
 * cab is drawn in and only the fare coming back is coloured. They are keyed and
 * kept in a list because several can be in the air at once: a fast drag spends
 * a block a frame.
 */
interface Coin {
  id: number
  text: string
  earned: boolean
  x: number
  y: number
}

const coins = ref<Coin[]>([])
let coinId = 0
/** Long enough to read, short enough not to trail behind a fast drag. */
const COIN_MS = 900

function throwCoin(amount: number, earned: boolean) {
  const id = ++coinId
  coins.value = [
    ...coins.value,
    {
      id,
      text: `💰 ${earned ? '+' : '\u2212'}${shortSom(amount)}`,
      earned,
      x: px(state.value.taxi.x),
      // Every other one starts a little lower, so two sums in quick succession
      // rise as a pair rather than on top of each other.
      y: px(state.value.taxi.y) + (id % 2 ? 0 : 20),
    },
  ]
  setTimeout(() => {
    coins.value = coins.value.filter((coin) => coin.id !== id)
  }, COIN_MS)
}

/** Whether this word's meaning has been paid for on this fare. */
function bought(word: Word): boolean {
  return state.value.bought.includes(wordKey(word.text))
}

/** The meaning the driver bought, in their own language. */
function wordGloss(word: Word): string {
  return t(`taxi.word.${word.key}`, word.place ? { place: placeName(word.place) } : {})
}

/**
 * Buys a word, or — once it is bought — simply says it again.
 *
 * Re-reading the half of an instruction you have paid for has to be free, or
 * the driver is taxed for going back over the thing they are trying to learn.
 */
function tapWord(word: Word) {
  if (!playable.value) return
  if (bought(word)) {
    void speakUzbekWord(word.text.toLowerCase())
    return
  }
  spendAnd(buyWord(state.value, word.text))
  void speakUzbekWord(word.text.toLowerCase())
}

function placeName(id: string): string {
  const found = landmark(id)
  return found ? gloss(found) : ''
}

/** Map labels are sentence case; the names are stored as they read mid-sentence. */
function placeLabel(place: Landmark): string {
  const name = gloss(place)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** A step in the learner's own language — shown only once it has been driven. */
function stepGloss(step: Step): string {
  switch (step.kind) {
    case 'turn':
      return t('taxi.gloss.turn', {
        ordinal: t(`taxi.ordinal.${step.ordinal}`),
        side: t(`taxi.side.${step.side}`),
      })
    case 'straight':
      return t('taxi.gloss.straight', { blocks: step.blocks }, step.blocks)
    case 'turnNow':
      return t('taxi.gloss.turnNow', { side: t(`taxi.side.${step.side}`) })
    case 'landmarkTurn':
      return t('taxi.gloss.landmarkTurn', {
        side: t(`taxi.side.${step.side}`),
        place: placeName(step.place),
      })
    default:
      return t('taxi.gloss.toLandmark', { place: placeName(step.place) })
  }
}

const answerGloss = computed(() =>
  outcome.value ? outcome.value.steps.map(stepGloss).join(' ') : '',
)

const answerUzbek = computed(() => (outcome.value ? routeUzbek(outcome.value.steps) : ''))

// --- Saying it --------------------------------------------------------------

/**
 * Reads the instruction out, clause by clause.
 *
 * Each clause is its own recording, so the pause between them is the pause a
 * person leaves between "go four blocks" and "turn left" rather than a seam in
 * the middle of a sentence. The token guards against a fare that changes while
 * the last one is still being read.
 *
 * Where a clip is missing these are whole sentences to synthesise, so they take
 * a Turkish, Russian or Arabic voice over a default English one, which mangles
 * Uzbek badly enough that the instruction stops being followable.
 */
let sayToken = 0

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

const CLAUSE_GAP_MS = 260

async function sayFare(current: Fare): Promise<void> {
  const token = ++sayToken
  speaking.value = true
  try {
    for (const [index, clause] of current.clauses.entries()) {
      if (token !== sayToken) return
      if (index > 0) await wait(CLAUSE_GAP_MS)
      if (token !== sayToken) return
      await speakUzbek(clause, { langs: NEIGHBOUR_VOICE_LANGS })
    }
  } finally {
    if (token === sayToken) speaking.value = false
  }
}

function repeat() {
  if (!fare.value || state.value.status === 'ready') return
  void sayFare(fare.value)
}

/** A new fare is read out as it arrives, and its clips opened before that. */
watch(
  () => state.value.fareId,
  () => {
    const current = fare.value
    if (!current) return
    void primeUzbekAudio(current.clauses)
    if (state.value.status === 'playing') void sayFare(current)
  },
)

// --- Driving ----------------------------------------------------------------

const stage = ref<SVGSVGElement | null>(null)
/** How close to the taxi a press has to land to pick it up, in blocks. */
const GRAB_BLOCKS = 0.65

let dragging = false
let steered = false

/** Pointer position in city units — 1.0 is one block, whole numbers are corners. */
function cityAt(event: PointerEvent): { x: number; y: number } | null {
  const svg = stage.value
  if (!svg) return null
  const rect = svg.getBoundingClientRect()
  if (!rect.width || !rect.height) return null
  // The map is drawn with preserveAspectRatio "meet", so it is letterboxed
  // inside its box at a single scale.
  const scale = Math.min(rect.width / viewWidth, rect.height / viewHeight)
  const x = (event.clientX - rect.left - (rect.width - viewWidth * scale) / 2) / scale
  const y = (event.clientY - rect.top - (rect.height - viewHeight * scale) / 2) / scale
  return { x: (x - PAD) / STEP, y: (y - PAD) / STEP }
}

/**
 * Drives towards where the finger is, one block at a time.
 *
 * The longer axis is tried first so a diagonal drag follows the street the
 * player is clearly heading down, and a blocked turning simply stops the taxi
 * rather than routing around it: the streets are the puzzle, so the taxi may
 * only go where the driver actually steers it.
 */
function steerTowards(target: { x: number; y: number }) {
  for (let guard = 0; guard < 12; guard++) {
    const taxi = state.value.taxi
    const dx = Math.max(0, Math.min(CITY_WIDTH - 1, Math.round(target.x))) - taxi.x
    const dy = Math.max(0, Math.min(CITY_HEIGHT - 1, Math.round(target.y))) - taxi.y
    if (!dx && !dy) return

    const wanted: Dir[] = []
    if (dx) wanted.push(dx > 0 ? EAST : WEST)
    if (dy) wanted.push(dy > 0 ? SOUTH : NORTH)
    if (Math.abs(dy) > Math.abs(dx)) wanted.reverse()

    const before = state.value
    for (const dir of wanted) {
      const next = drive(before, dir)
      if (next !== before) {
        spendAnd(next)
        steered = true
        break
      }
    }
    if (state.value === before) return
  }
}

function onPointerDown(event: PointerEvent) {
  if (!playable.value) return
  const at = cityAt(event)
  if (!at) return
  const taxi = state.value.taxi
  if (Math.hypot(at.x - taxi.x, at.y - taxi.y) > GRAB_BLOCKS) return
  dragging = true
  steered = false
  ;(event.target as Element).setPointerCapture?.(event.pointerId)
  event.preventDefault()
}

function onPointerMove(event: PointerEvent) {
  if (!dragging || !playable.value) return
  const at = cityAt(event)
  if (at) steerTowards(at)
}

function onPointerUp() {
  if (!dragging) return
  dragging = false
  // Picking the taxi up and putting it straight back down is the drop-off:
  // you have arrived, so you let them out.
  if (!steered) letThemOut()
}

function onKey(event: KeyboardEvent) {
  if (state.value.status !== 'playing') return
  const arrows: Record<string, Dir> = {
    ArrowUp: NORTH,
    ArrowRight: EAST,
    ArrowDown: SOUTH,
    ArrowLeft: WEST,
  }
  if (event.key in arrows) {
    if (!playable.value) return
    event.preventDefault()
    spendAnd(drive(state.value, arrows[event.key]))
    return
  }
  if (event.key === 'Enter' || event.key === ' ') {
    if (!playable.value) return
    event.preventDefault()
    letThemOut()
  }
}

// --- Dropping off -----------------------------------------------------------

/** How long the payslip is left up before the next passenger gets in. */
const THANKS_MS = 1900
/** How long "not here" stays over the instruction after a refused corner. */
const REFUSAL_MS = 1400
/** How long the depot's re-float stays up after the meter runs dry. */
const BUST_MS = 2200

/** Set while the passenger is saying this is not the place; keyed so a second
 *  refusal re-runs the flash rather than sitting on the first one. */
const refused = ref(false)
const refusedKey = ref(0)
/** Set when the depot has just had to float the driver again. */
const bust = ref(false)
const bustKey = ref(0)

let advance: ReturnType<typeof setTimeout> | undefined

function letThemOut() {
  if (!playable.value) return
  sayToken++
  speaking.value = false
  stopSpeaking()

  const drop = dropOff(state.value)
  state.value = drop.state
  if (drop.result === 'ignored') return

  if (drop.result === 'arrived') {
    playChime()
    buzz(20)
    if (drop.paid > 0) throwCoin(drop.paid, true)
    // The payslip stays up for a moment and then the next passenger gets in;
    // a passenger who gave up leaves the route they wanted on screen until the
    // driver has looked at it.
    advance = setTimeout(nextPassenger, THANKS_MS)
  } else {
    playHorn()
    buzz([40, 60, 90])
    // Refused: they stay in the cab, so all that changes is the nudge.
    if (drop.result === 'refused') flashRefusal()
  }
  if (state.value.status === 'over') finish()
}

/**
 * Applies a move or a purchase: throws the price up off the cab, and says so
 * if that was the last of the fare.
 */
function spendAnd(next: TaxiState) {
  const before = state.value
  if (next === before) return
  const spent = next.spent - before.spent
  state.value = next
  if (spent > 0) throwCoin(spent, false)
  if (next.lives >= before.lives) return

  playHorn()
  buzz([60, 80, 60])
  if (next.status === 'over') {
    finish()
    return
  }
  bust.value = true
  bustKey.value++
  const shown = bustKey.value
  setTimeout(() => {
    if (bustKey.value === shown) bust.value = false
  }, BUST_MS)
}

/** Shows "not here" over the instruction for a moment. */
function flashRefusal() {
  refused.value = true
  refusedKey.value++
  const shown = refusedKey.value
  setTimeout(() => {
    if (refusedKey.value === shown) refused.value = false
  }, REFUSAL_MS)
}

function nextPassenger() {
  clearAdvance()
  if (!state.value.outcome) return
  state.value = continueRun(state.value)
}

function clearAdvance() {
  if (advance !== undefined) clearTimeout(advance)
  advance = undefined
}

function finish() {
  newBest.value = recordHighScore(state.value.takings)
  best.value = readHighScore()
}

function buzz(pattern: number | number[]) {
  try {
    navigator.vibrate?.(pattern)
  } catch {
    // no haptics
  }
}

// --- Shell ------------------------------------------------------------------

function begin() {
  if (state.value.status !== 'ready') return
  // The tap that starts the shift is also what lets the passenger be heard.
  resumeAudio()
  state.value = startGame(state.value)
  if (fare.value) void sayFare(fare.value)
}

function playAgain() {
  clearAdvance()
  sayToken++
  stopSpeaking()
  newBest.value = false
  paused.value = false
  state.value = startGame(createGame())
  if (fare.value) void sayFare(fare.value)
}

function done() {
  clearAdvance()
  sayToken++
  stopSpeaking()
  // A shift has no natural end, so a driver who has had enough and closes the
  // game still keeps what they delivered.
  recordHighScore(state.value.takings)
  emit('done')
}

function resume() {
  paused.value = false
}

function onVisibility() {
  if (document.hidden && state.value.status === 'playing') {
    paused.value = true
    sayToken++
    speaking.value = false
    stopSpeaking()
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKey)
  document.addEventListener('visibilitychange', onVisibility)
  if (fare.value) void primeUzbekAudio(fare.value.clauses)
})

onBeforeUnmount(() => {
  clearAdvance()
  window.removeEventListener('keydown', onKey)
  document.removeEventListener('visibilitychange', onVisibility)
  stopSpeaking()
})
</script>

<template>
  <div class="taxi" role="dialog" :aria-label="$t('taxi.aria')">
    <div class="taxi__card">
      <header class="taxi__header">
        <div class="taxi__titles">
          <span class="taxi__eyebrow">
            {{ $t('taxi.eyebrow') }} · {{ $t('taxi.level', { level }) }}
          </span>
          <h2 class="taxi__title">{{ $t('taxi.title') }}</h2>
        </div>
        <button class="taxi__close" type="button" :aria-label="$t('taxi.skip')" @click="done">
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M4 4l8 8M12 4l-8 8" stroke-linecap="round" />
          </svg>
        </button>
      </header>

      <div class="taxi__hud">
        <span class="taxi__stat taxi__stat--cash">
          <span class="taxi__stat-label">{{ $t('taxi.takings') }}</span>
          <strong class="taxi__stat-value">{{ som(state.takings) }}</strong>
        </span>
        <span class="taxi__stat">
          <span class="taxi__stat-label">{{ $t('taxi.fare') }}</span>
          <strong class="taxi__stat-value">{{ som(purse(state)) }}</strong>
        </span>
        <span class="taxi__stat">
          <span class="taxi__stat-label">{{ $t('taxi.best') }}</span>
          <strong class="taxi__stat-value">{{ som(best) }}</strong>
        </span>
        <span class="taxi__lamps" :aria-label="$t('taxi.livesLeft', { count: state.lives })">
          <span
            v-for="(spent, i) in lamps"
            :key="i"
            class="taxi__lamp"
            :class="{ 'taxi__lamp--spent': spent }"
            aria-hidden="true"
          />
        </span>
      </div>

      <!-- What the passenger said, or what they meant, once they are out. -->
      <div
        class="taxi__fare"
        :class="{
          'taxi__fare--right': outcome?.result === 'arrived',
          'taxi__fare--wrong': outcome?.result === 'gaveUp' || refused || bust,
        }"
      >
        <span class="taxi__who">
          <span class="taxi__rider" aria-hidden="true">
            {{ outcome?.result === 'arrived' ? '🙋' : '🧕' }}
          </span>
          <!-- How many more wrong corners this passenger will sit through. -->
          <span
            v-if="!outcome"
            class="taxi__pips"
            :aria-label="$t('taxi.patience', { count: PATIENCE - state.patience })"
          >
            <span
              v-for="(spent, i) in pips"
              :key="i"
              class="taxi__pip"
              :class="{ 'taxi__pip--spent': spent }"
              aria-hidden="true"
            />
          </span>
        </span>

        <!-- The words they used, kept next to what they meant: reading the
             clause again with its meaning under it is the lesson. -->
        <div v-if="outcome" class="taxi__verdict">
          <p class="taxi__verdict-title">
            <span>{{ $t(`taxi.${outcome.result}`) }}</span>
            <strong v-if="outcome.paid" class="taxi__paid">
              {{ $t('taxi.paid', { amount: som(outcome.paid) }) }}
            </strong>
          </p>
          <p class="taxi__verdict-said">{{ answerUzbek }}</p>
          <p class="taxi__verdict-body">{{ answerGloss }}</p>
        </div>

        <!-- Every word is a button: tapping one buys its meaning, and having
             bought it, says it again for nothing. -->
        <div v-else class="taxi__bubble" :class="{ 'taxi__bubble--speaking': speaking }">
          <span class="taxi__clauses">
            <span v-if="bust" class="taxi__refusal">{{ $t('taxi.bust') }}</span>
            <span v-else-if="refused" class="taxi__refusal">{{ $t('taxi.notThere') }}</span>
            <span v-for="(clause, i) in fare?.words ?? []" :key="i" class="taxi__clause">
              <button
                v-for="(word, j) in clause"
                :key="j"
                class="taxi__word"
                :class="{ 'taxi__word--bought': bought(word) }"
                type="button"
                :aria-label="
                  bought(word)
                    ? $t('taxi.sayWord', { word: word.text })
                    : $t('taxi.buyWord', { word: word.text, price: som(WORD_PRICE) })
                "
                @click="tapWord(word)"
              >
                <span class="taxi__word-uz">{{ word.text }}</span>
                <span v-if="bought(word)" class="taxi__word-gloss">{{ wordGloss(word) }}</span>
              </button>
            </span>
          </span>
          <button
            class="taxi__speaker"
            type="button"
            :aria-label="$t('taxi.hearAgain')"
            @click="repeat"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M4 9v6h4l5 4V5L8 9H4z"
                fill="currentColor"
                stroke="currentColor"
                stroke-width="1.5"
                stroke-linejoin="round"
              />
              <path
                d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </div>
      </div>

      <div class="taxi__stage">
        <svg
          ref="stage"
          class="taxi__map"
          :viewBox="viewBox"
          preserveAspectRatio="xMidYMid meet"
          role="img"
          :aria-label="$t('taxi.mapAria')"
          @pointerdown="onPointerDown"
          @pointermove="onPointerMove"
          @pointerup="onPointerUp"
          @pointercancel="onPointerUp"
        >
          <!-- The streets: a dark casing with the carriageway laid over it. -->
          <g class="taxi__casing">
            <line
              v-for="(road, i) in streets"
              :key="`c-${i}`"
              :x1="road.x1"
              :y1="road.y1"
              :x2="road.x2"
              :y2="road.y2"
            />
          </g>
          <g class="taxi__road">
            <line
              v-for="(road, i) in streets"
              :key="`r-${i}`"
              :x1="road.x1"
              :y1="road.y1"
              :x2="road.x2"
              :y2="road.y2"
            />
          </g>

          <!-- Where the driver has been since this passenger got in. -->
          <polyline
            v-if="state.trail.length > 1"
            class="taxi__trail"
            :points="pointsOf(state.trail)"
          />

          <!-- After a drop-off: the route the instruction described. -->
          <polyline
            v-if="outcome"
            class="taxi__answer"
            :class="{ 'taxi__answer--right': outcome.result === 'arrived' }"
            :points="pointsOf(outcome.route.path)"
          />

          <g v-for="place in places" :key="place.id" class="taxi__place">
            <circle :cx="px(place.x)" :cy="px(place.y)" r="23" />
            <text :x="px(place.x)" :y="px(place.y) + 8" class="taxi__place-icon">
              {{ place.landmark.emoji }}
            </text>
            <text :x="px(place.x)" :y="px(place.y) + 45" class="taxi__place-name">
              {{ placeLabel(place.landmark) }}
            </text>
          </g>

          <g class="taxi__cab" :transform="taxiTransform">
            <!-- Which way it is pointing decides left from right, so the nose
                 carries a beam the eye can pick up without hunting. -->
            <path class="taxi__beam" d="M-13 -22 L0 -40 L13 -22 Z" />
            <rect x="-14" y="-21" width="28" height="42" rx="9" class="taxi__body" />
            <rect x="-10" y="-16" width="20" height="11" rx="4" class="taxi__glass" />
            <rect x="-10" y="7" width="20" height="9" rx="4" class="taxi__glass" />
            <rect x="-7" y="-3" width="14" height="7" rx="2" class="taxi__sign" />
          </g>

          <!-- Money on its way out of the window, or into it. -->
          <text
            v-for="coin in coins"
            :key="coin.id"
            class="taxi__coin"
            :class="{ 'taxi__coin--earned': coin.earned }"
            :x="coin.x"
            :y="coin.y - 30"
          >
            {{ coin.text }}
          </text>

          <!-- The corner they wanted, and the one they were left on. Drawn
               last, so a cross over the cab is a cross over the cab. -->
          <g v-if="outcome" class="taxi__marks">
            <circle
              class="taxi__target"
              :cx="px(outcome.route.dest.x)"
              :cy="px(outcome.route.dest.y)"
              r="29"
            />
            <path
              v-if="outcome.result !== 'arrived'"
              class="taxi__missed"
              :d="`M${px(outcome.dropped.x) - 15} ${px(outcome.dropped.y) - 15}l30 30M${px(outcome.dropped.x) + 15} ${px(outcome.dropped.y) - 15}l-30 30`"
            />
          </g>
        </svg>

        <div v-if="state.status === 'ready'" class="taxi__overlay">
          <p class="taxi__howto">{{ $t('taxi.howTo') }}</p>
          <button class="btn btn--primary" type="button" autofocus @click="begin">
            {{ $t('taxi.start') }}
          </button>
        </div>

        <div v-else-if="paused" class="taxi__overlay">
          <p class="taxi__cue">{{ $t('taxi.paused') }}</p>
          <button class="btn btn--primary" type="button" @click="resume">
            {{ $t('taxi.resume') }}
          </button>
        </div>

        <div v-else-if="state.status === 'over'" class="taxi__overlay">
          <p class="taxi__over-title">{{ $t('taxi.over') }}</p>
          <p v-if="newBest" class="taxi__new-best">{{ $t('taxi.newBest') }}</p>
          <p class="taxi__over-score">
            {{ $t('taxi.finalScore', { takings: som(state.takings), count: state.delivered }) }}
          </p>
          <div class="taxi__actions">
            <button class="btn btn--primary" type="button" @click="playAgain">
              {{ $t('taxi.again') }}
            </button>
            <button class="btn btn--ghost" type="button" @click="done">
              {{ $t('taxi.done') }}
            </button>
          </div>
        </div>
      </div>

      <footer class="taxi__footer">
        <button
          v-if="outcome"
          class="btn btn--primary taxi__drop"
          type="button"
          @click="nextPassenger"
        >
          {{ $t('taxi.nextFare') }}
        </button>
        <button
          v-else
          class="btn btn--gold taxi__drop"
          type="button"
          :disabled="!playable"
          @click="letThemOut"
        >
          {{ $t('taxi.dropOff') }}
        </button>
        <p class="taxi__hint">
          {{ $t('taxi.steer', { fuel: som(FUEL_PER_BLOCK), word: som(WORD_PRICE) }) }}
        </p>
      </footer>
    </div>
  </div>
</template>

<style scoped>
.taxi {
  position: fixed;
  inset: 0;
  z-index: 75;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: rgba(37, 28, 18, 0.55);
  backdrop-filter: blur(4px);
}

.taxi__card {
  display: flex;
  flex-direction: column;
  gap: 0.55rem;
  width: 100%;
  max-width: 440px;
  height: 100%;
  max-height: 780px;
  padding: 0.9rem 0.9rem calc(0.9rem + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
}

.taxi__header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.taxi__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.taxi__eyebrow {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.taxi__title {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1.2;
}

.taxi__close {
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

.taxi__close svg {
  width: 14px;
  height: 14px;
}

.taxi__hud {
  display: flex;
  align-items: stretch;
  gap: 0.4rem;
}

.taxi__stat {
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

.taxi__stat-label {
  font-size: 0.65rem;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.taxi__stat-value {
  font-size: 0.95rem;
  font-variant-numeric: tabular-nums;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

.taxi__stat--cash .taxi__stat-value {
  color: var(--color-teal);
}

/* The three lights on the meter: one goes out per passenger left astray. */
.taxi__lamps {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 0.25rem;
  padding: 0.35rem 0.45rem;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.taxi__lamp {
  width: 12px;
  height: 12px;
  border-radius: 50%;
  background: var(--color-gold);
  box-shadow: 0 0 0 1.5px rgba(0, 0, 0, 0.12);
}

.taxi__lamp--spent {
  background: transparent;
  box-shadow: inset 0 0 0 1.5px var(--color-border);
}

.taxi__fare {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  min-height: 4.4rem;
  padding: 0.5rem;
  background: var(--color-primary-wash);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.taxi__fare--right {
  background: rgba(26, 94, 82, 0.1);
  border-color: var(--color-teal);
}

.taxi__fare--wrong {
  background: rgba(194, 82, 42, 0.1);
  border-color: var(--color-terracotta);
}

.taxi__who {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
}

.taxi__rider {
  font-size: 1.6rem;
  line-height: 1.2;
}

.taxi__pips {
  display: flex;
  gap: 0.15rem;
}

.taxi__pip {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--color-primary-light);
}

.taxi__pip--spent {
  background: transparent;
  box-shadow: inset 0 0 0 1px var(--color-border);
}

.taxi__bubble {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.35rem 0.4rem;
  text-align: left;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  color: var(--color-text);
}

.taxi__bubble--speaking {
  border-color: var(--color-primary);
  box-shadow: 0 0 0 3px rgba(27, 79, 138, 0.15);
}

.taxi__clauses {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
}

.taxi__clause {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 0.15rem 0.3rem;
}

/* Each word is a price tag as much as a word: untouched it is just the Uzbek,
   and once bought it carries its meaning underneath for the rest of the fare. */
.taxi__word {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0;
  padding: 0.05rem 0.15rem;
  border: 0;
  border-radius: 4px;
  background: transparent;
  text-align: left;
  color: var(--color-primary);
}

.taxi__word-uz {
  font-size: 0.95rem;
  font-weight: 700;
  line-height: 1.2;
  border-bottom: 1.5px dotted var(--color-gold);
}

.taxi__word--bought .taxi__word-uz {
  border-bottom-color: transparent;
}

.taxi__word-gloss {
  font-size: 0.65rem;
  line-height: 1.15;
  color: var(--color-text-muted);
}

.taxi__refusal {
  font-size: 0.8rem;
  font-weight: 800;
  color: var(--color-terracotta);
}

.taxi__speaker {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-primary-light);
}

.taxi__speaker svg {
  width: 18px;
  height: 18px;
}

.taxi__verdict {
  flex: 1;
  min-width: 0;
}

.taxi__verdict-title {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  margin: 0 0 0.15rem;
  font-size: 0.95rem;
  font-weight: 800;
  color: var(--color-text);
}

.taxi__paid {
  flex-shrink: 0;
  font-size: 1rem;
  color: var(--color-teal);
  font-variant-numeric: tabular-nums;
}

.taxi__verdict-said {
  margin: 0 0 0.1rem;
  font-size: 0.85rem;
  font-weight: 700;
  line-height: 1.25;
  color: var(--color-primary);
}

.taxi__verdict-body {
  margin: 0;
  font-size: 0.85rem;
  line-height: 1.3;
  color: var(--color-text-muted);
}

.taxi__stage {
  position: relative;
  flex: 1;
  min-height: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: #e9e0c8;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}

.taxi__map {
  width: 100%;
  height: 100%;
  /* Dragging the taxi must not scroll or pull-to-refresh the page. */
  touch-action: none;
  user-select: none;
}

.taxi__casing line {
  stroke: #cdbf9d;
  stroke-width: 34;
  stroke-linecap: round;
}

.taxi__road line {
  stroke: #f6f1e4;
  stroke-width: 26;
  stroke-linecap: round;
}

.taxi__trail {
  fill: none;
  stroke: rgba(201, 168, 76, 0.75);
  stroke-width: 12;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.taxi__answer {
  fill: none;
  stroke: var(--color-terracotta);
  stroke-width: 9;
  stroke-linecap: round;
  stroke-linejoin: round;
  stroke-dasharray: 4 14;
}

.taxi__answer--right {
  stroke: var(--color-teal);
}

.taxi__place circle {
  fill: var(--color-surface);
  stroke: var(--color-gold);
  stroke-width: 3;
}

.taxi__place-icon {
  font-size: 24px;
  text-anchor: middle;
}

.taxi__place-name {
  font-size: 15px;
  font-weight: 700;
  text-anchor: middle;
  fill: var(--color-text);
  stroke: #e9e0c8;
  stroke-width: 4;
  paint-order: stroke;
}

.taxi__target {
  fill: none;
  stroke: var(--color-teal);
  stroke-width: 6;
}

.taxi__missed {
  fill: none;
  stroke: var(--color-terracotta);
  stroke-width: 7;
  stroke-linecap: round;
}

/* A price rising off the roof of the cab and fading out with it. */
.taxi__coin {
  font-size: 22px;
  font-weight: 800;
  text-anchor: middle;
  /* The cab's own outline: money going out is ordinary, not an alarm. */
  fill: #6b4a12;
  stroke: #e9e0c8;
  stroke-width: 4;
  paint-order: stroke;
  pointer-events: none;
  animation: taxi-coin 0.9s ease-out forwards;
}

.taxi__coin--earned {
  font-size: 26px;
  fill: var(--color-teal);
}

@keyframes taxi-coin {
  from {
    transform: translateY(0);
    opacity: 0;
  }
  20% {
    opacity: 1;
  }
  to {
    transform: translateY(-42px);
    opacity: 0;
  }
}

@media (prefers-reduced-motion: reduce) {
  .taxi__coin {
    animation-duration: 0.9s;
    animation-name: taxi-coin-still;
  }

  @keyframes taxi-coin-still {
    from {
      opacity: 1;
    }
    to {
      opacity: 0;
    }
  }
}

.taxi__beam {
  fill: rgba(201, 168, 76, 0.45);
}

.taxi__body {
  fill: #f2c14e;
  stroke: #6b4a12;
  stroke-width: 3;
}

.taxi__glass {
  fill: #cfe6f5;
  stroke: #6b4a12;
  stroke-width: 2;
}

.taxi__sign {
  fill: var(--color-surface);
  stroke: #6b4a12;
  stroke-width: 2;
}

.taxi__overlay {
  position: absolute;
  inset: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.7rem;
  padding: 1.2rem;
  text-align: center;
  background: rgba(255, 255, 255, 0.92);
}

.taxi__howto,
.taxi__cue {
  margin: 0;
  font-size: 0.9rem;
  line-height: 1.4;
  color: var(--color-text);
}

.taxi__over-title {
  margin: 0;
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
}

.taxi__over-score {
  margin: 0;
  font-size: 0.95rem;
  color: var(--color-text-muted);
}

.taxi__new-best {
  margin: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-gold);
}

.taxi__actions {
  display: flex;
  gap: 0.5rem;
}

.taxi__footer {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.3rem;
}

.taxi__drop {
  width: 100%;
}

.taxi__hint {
  margin: 0;
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-align: center;
}
</style>
