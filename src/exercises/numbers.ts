/**
 * Uzbek counting (issue #59). The cardinals are wonderfully regular: learn the
 * ten units, the eight tens, plus yuz (hundred) and ming (thousand), and every
 * number is just those pieces in a row — biggest first, no joining words, no
 * irregularities. This module turns an integer into its Uzbek reading and
 * generates a procedural counting quiz from it.
 *
 * Two entry points, because two callers want different things:
 *   - `numberToUzbek` is the counting quiz's, and stays capped at 0–9999. Its
 *     range is what the quiz drills and what scripts/generate_audio.py records
 *     whole; widening it would silently ask for clips that were never made.
 *   - `uzbekCardinalTokens` is the bazar's, and climbs into the millions one
 *     spoken word at a time — som prices need it, and the game's register is
 *     literally a row of those words (see bazar.ts).
 */

const ONES = ['nol', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"]
// Index = the tens digit; index 1 is o'n (10), 2 is yigirma (20), …
const TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"]

/**
 * The scale word for each group of three digits, smallest first. Uzbek borrows
 * million and milliard wholesale from Russian; only `ming` is native, and only
 * `ming` drops its "bir" (ming = 1000, but *bir* million = 1 000 000).
 */
const SCALES = ['', 'ming', 'million', 'milliard'] as const

/** Largest integer `uzbekCardinalTokens` can read: 999 999 999 999. */
export const MAX_UZBEK_CARDINAL = 10 ** (SCALES.length * 3) - 1

/**
 * Every word an Uzbek cardinal can be built from, in counting order. The bazar
 * fills its register from this list, so a distractor button is always a real
 * number word rather than an obvious dud.
 */
export const UZBEK_NUMBER_WORDS: readonly string[] = [
  ...ONES.slice(1),
  ...TENS.slice(1),
  'yuz',
  ...SCALES.slice(1),
]

/** Renders 1–999 — the body of one three-digit group — as its spoken words. */
function groupTokens(n: number): string[] {
  const tokens: string[] = []
  const hundreds = Math.floor(n / 100)
  const tens = Math.floor((n % 100) / 10)
  const ones = n % 10

  // "yuz" stands alone when there's just one hundred (yuz, not bir yuz).
  if (hundreds > 0) {
    if (hundreds > 1) tokens.push(ONES[hundreds])
    tokens.push('yuz')
  }
  if (tens > 0) tokens.push(TENS[tens])
  if (ones > 0) tokens.push(ONES[ones])
  return tokens
}

/**
 * The spoken Uzbek cardinal for a non-negative integer, one word per element —
 * biggest group first, each group followed by its scale word.
 *
 * Words repeat when the number does (2 200 000 is "ikki million ikki yuz
 * ming"), so callers that treat these as buttons must keep them tappable
 * rather than consuming them.
 */
export function uzbekCardinalTokens(n: number): string[] {
  if (!Number.isInteger(n) || n < 0 || n > MAX_UZBEK_CARDINAL) {
    throw new RangeError(`uzbekCardinalTokens supports integers 0–${MAX_UZBEK_CARDINAL}, got ${n}`)
  }
  if (n === 0) return ['nol']

  const tokens: string[] = []
  for (let scale = SCALES.length - 1; scale >= 0; scale--) {
    const group = Math.floor(n / 10 ** (scale * 3)) % 1000
    if (group === 0) continue
    // A lone "bir" is dropped before ming only — "bir million" keeps its bir.
    if (!(group === 1 && scale === 1)) tokens.push(...groupTokens(group))
    if (scale > 0) tokens.push(SCALES[scale])
  }
  return tokens
}

/** Renders a non-negative integer (0–9999) as its spoken Uzbek cardinal. */
export function numberToUzbek(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    throw new RangeError(`numberToUzbek supports integers 0–9999, got ${n}`)
  }
  return uzbekCardinalTokens(n).join(' ')
}

export type CountingMode = 'read' | 'listen' | 'write' | 'type'

export interface CountingOption {
  value: number
  uzbek: string
}

export interface CountingQuestion {
  value: number
  uzbek: string
  mode: CountingMode
  /** Digit options for read/listen, Uzbek options for write; empty for type. */
  options: CountingOption[]
}

const OPTION_COUNT = 4

/** A spread of plausible wrong answers near the target, then random fillers. */
function pickDistractors(value: number, max: number, rng: () => number): number[] {
  const near = [value + 1, value - 1, value + 2, value - 2, value + 10, value - 10, value + 20]
  const pool = shuffleWith(
    near.filter((n) => n >= 0 && n <= max && n !== value),
    rng,
  )
  const chosen = new Set<number>()
  for (const n of pool) {
    if (chosen.size >= OPTION_COUNT - 1) break
    chosen.add(n)
  }
  // Top up with random numbers in range if the near-misses ran out.
  let guard = 0
  while (chosen.size < OPTION_COUNT - 1 && guard++ < 100) {
    const n = Math.floor(rng() * (max + 1))
    if (n !== value) chosen.add(n)
  }
  return [...chosen]
}

function shuffleWith<T>(items: T[], rng: () => number): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

const MODES: CountingMode[] = ['read', 'listen', 'write', 'type']

function buildQuestion(value: number, mode: CountingMode, max: number, rng: () => number): CountingQuestion {
  const option = (v: number): CountingOption => ({ value: v, uzbek: numberToUzbek(v) })
  const options =
    mode === 'type'
      ? []
      : shuffleWith([value, ...pickDistractors(value, max, rng)], rng).map(option)
  return { value, uzbek: numberToUzbek(value), mode, options }
}

/**
 * A counting quiz that gently ramps up: the first questions stay in single
 * digits, later ones climb toward `max`. Modes rotate so the learner reads,
 * hears, builds and types the numbers. Deterministic given `rng`.
 */
export function generateCountingQuiz(
  count = 6,
  rng: () => number = Math.random,
  max = 100,
): CountingQuestion[] {
  const questions: CountingQuestion[] = []
  const used = new Set<number>()

  for (let i = 0; i < count; i++) {
    // Difficulty band widens as the quiz goes on.
    const ceiling = Math.max(10, Math.round((max * (i + 1)) / count))
    let value = 0
    let guard = 0
    do {
      value = Math.floor(rng() * (ceiling + 1))
      guard++
    } while (used.has(value) && guard < 50)
    used.add(value)

    const mode = MODES[i % MODES.length]
    questions.push(buildQuestion(value, mode, max, rng))
  }

  return questions
}
