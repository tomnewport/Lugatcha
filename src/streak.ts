// Daily-practice streak tracking and its chip encoding.
//
// A streak is a base-5 numeral made of diamond "chips". Three tiers, each a
// blue/orange pair that alternates as chips accumulate:
//   tier 0 — single day   🔹 / 🔸   (worth 1)
//   tier 1 — five days    🔷 / 🔶   (worth 5,  = five tier-0 chips)
//   tier 2 — twenty-five  💠 / ✴️   (worth 25, = five tier-1 chips)
// Rendered highest tier first, so e.g. 74 = 💠✴️🔷🔶🔷🔶🔹🔸🔹🔸.

const COUNT_KEY = 'lugatcha.streakCount'
const DATE_KEY = 'lugatcha.streakLastDate'

export type ChipTier = 0 | 1 | 2
export type ChipColor = 'blue' | 'orange'

export interface Chip {
  tier: ChipTier
  color: ChipColor
  symbol: string
}

/** [blue, orange] glyph for each tier. */
const SYMBOLS: Record<ChipTier, readonly [string, string]> = {
  0: ['🔹', '🔸'],
  1: ['🔷', '🔶'],
  2: ['💠', '✴️'],
}

/** The chip at `index` (0-based) within a tier; colour alternates blue, orange. */
function chip(tier: ChipTier, index: number): Chip {
  const color: ChipColor = index % 2 === 0 ? 'blue' : 'orange'
  return { tier, color, symbol: SYMBOLS[tier][index % 2] }
}

/**
 * The chips representing a streak of `n` days, highest tier first. The 1s and
 * 5s places hold 0–4 chips; the 25s place is unbounded.
 */
export function streakChips(n: number): Chip[] {
  if (n <= 0) return []
  const ones = n % 5
  const fives = Math.floor(n / 5) % 5
  const twentyfives = Math.floor(n / 25)
  const chips: Chip[] = []
  for (let i = 0; i < twentyfives; i++) chips.push(chip(2, i))
  for (let i = 0; i < fives; i++) chips.push(chip(1, i))
  for (let i = 0; i < ones; i++) chips.push(chip(0, i))
  return chips
}

/** Convenience: just the glyphs of a streak, concatenated. */
export function streakString(n: number): string {
  return streakChips(n)
    .map((c) => c.symbol)
    .join('')
}

/** A group of five same-tier chips fusing into one chip of the next tier. */
export interface Merge {
  /** Tier of the components being fused (the result is one tier up). */
  tier: ChipTier
  /** The five chips that join — alternating blue, orange. */
  components: Chip[]
  /** The single higher-tier chip they become. */
  result: Chip
}

export interface IncrementPlan {
  /** The fresh single chip earned for the day. */
  added: Chip
  /** Carry cascade triggered by the new chip, lowest tier first (may be empty). */
  merges: Merge[]
}

/**
 * What changes visually when a streak grows from `from` to `from + 1`: the new
 * single chip, plus any carry merges it triggers (4→5 fuses a 5-chip; if that
 * was the fifth 5-chip it fuses a 25-chip in turn).
 */
export function planIncrement(from: number): IncrementPlan {
  const onesIndex = from % 5
  const added = chip(0, onesIndex)
  const merges: Merge[] = []
  if (onesIndex === 4) {
    const fivesIndex = Math.floor(from / 5) % 5
    merges.push({
      tier: 0,
      components: Array.from({ length: 5 }, (_, i) => chip(0, i)),
      result: chip(1, fivesIndex),
    })
    if (fivesIndex === 4) {
      const twentyfivesIndex = Math.floor(from / 25)
      merges.push({
        tier: 1,
        components: Array.from({ length: 5 }, (_, i) => chip(1, i)),
        result: chip(2, twentyfivesIndex),
      })
    }
  }
  return { added, merges }
}

/** Local calendar date as YYYY-MM-DD (not UTC), so "today" matches the learner. */
export function localDate(d: Date = new Date()): string {
  return d.toLocaleDateString('en-CA')
}

function dayBefore(d: Date): Date {
  const y = new Date(d)
  y.setDate(y.getDate() - 1)
  return y
}

interface StoredStreak {
  count: number
  lastDate: string | null
}

function load(): StoredStreak {
  try {
    const count = parseInt(localStorage.getItem(COUNT_KEY) ?? '0', 10) || 0
    return { count, lastDate: localStorage.getItem(DATE_KEY) }
  } catch {
    return { count: 0, lastDate: null }
  }
}

function save(count: number, date: string): void {
  try {
    localStorage.setItem(COUNT_KEY, String(count))
    localStorage.setItem(DATE_KEY, date)
  } catch {
    // private mode — streak simply won't persist
  }
}

/**
 * The streak the learner can still see today: the stored count if the last
 * practice was today or yesterday, otherwise 0 (the streak has lapsed).
 */
export function currentStreak(now: Date = new Date()): number {
  const { count, lastDate } = load()
  if (!lastDate) return 0
  if (lastDate === localDate(now) || lastDate === localDate(dayBefore(now))) return count
  return 0
}

export interface StreakUpdate {
  /** Streak length before today's practice. */
  from: number
  /** Streak length after today's practice. */
  to: number
  /** True only when this practice actually grew the streak (cue the celebration). */
  extended: boolean
}

/**
 * Records that the learner practised today and returns the transition. Already
 * practised today → no change (`extended: false`). Practised yesterday →
 * streak grows by one. Otherwise the streak resets and starts again at one.
 */
export function recordStreakDay(now: Date = new Date()): StreakUpdate {
  const today = localDate(now)
  const { count, lastDate } = load()
  if (lastDate === today) return { from: count, to: count, extended: false }
  const base = lastDate === localDate(dayBefore(now)) ? count : 0
  const to = base + 1
  save(to, today)
  return { from: base, to, extended: true }
}
