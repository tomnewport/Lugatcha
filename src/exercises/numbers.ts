/**
 * Uzbek counting (issue #59). The cardinals are wonderfully regular: learn the
 * ten units, the eight tens, plus yuz (hundred) and ming (thousand), and every
 * number is just those pieces in a row — biggest first, no joining words, no
 * irregularities. This module turns any 0–9999 integer into its Uzbek reading
 * and generates a procedural counting quiz from it.
 */

const ONES = ['nol', 'bir', 'ikki', 'uch', "to'rt", 'besh', 'olti', 'yetti', 'sakkiz', "to'qqiz"]
// Index = the tens digit; index 1 is o'n (10), 2 is yigirma (20), …
const TENS = ['', "o'n", 'yigirma', "o'ttiz", 'qirq', 'ellik', 'oltmish', 'yetmish', 'sakson', "to'qson"]

/** Renders a non-negative integer (0–9999) as its spoken Uzbek cardinal. */
export function numberToUzbek(n: number): string {
  if (!Number.isInteger(n) || n < 0 || n > 9999) {
    throw new RangeError(`numberToUzbek supports integers 0–9999, got ${n}`)
  }
  if (n === 0) return 'nol'

  const parts: string[] = []
  const thousands = Math.floor(n / 1000)
  const hundreds = Math.floor((n % 1000) / 100)
  const tens = Math.floor((n % 100) / 10)
  const ones = n % 10

  // "ming" and "yuz" stand alone when there's just one of them (ming, not bir ming)
  if (thousands > 0) {
    if (thousands > 1) parts.push(numberToUzbek(thousands))
    parts.push('ming')
  }
  if (hundreds > 0) {
    if (hundreds > 1) parts.push(ONES[hundreds])
    parts.push('yuz')
  }
  if (tens > 0) parts.push(TENS[tens])
  if (ones > 0) parts.push(ONES[ones])

  return parts.join(' ')
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
