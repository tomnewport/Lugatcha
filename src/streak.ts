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
const SKIPS_KEY = 'lugatcha.streakSkips'
const SKIPS_AT_KEY = 'lugatcha.streakSkipsAt'
const SKIPS_PEAK_KEY = 'lugatcha.streakSkipsPeak'

/**
 * Rest days (the old "weekly skip", now a bank). One is earned every
 * `SKIP_ACCRUAL_DAYS`, they stack up to `SKIP_CAP`, and each missed day spends
 * one — so a long, steady streak buys itself a real cushion, while a new one
 * still starts with a single day of grace.
 */
export const SKIP_CAP = 3
const SKIP_ACCRUAL_DAYS = 7
const SKIP_START = 1

/** Pre-bank key: the date the one-a-week skip was last spent. Migrated below. */
const LEGACY_SKIP_KEY = 'lugatcha.streakSkipDate'

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

/** Whole days between two YYYY-MM-DD dates (positive when `b` is later). */
function daysBetween(a: string, b: string): number {
  const da = new Date(`${a}T00:00:00`)
  const db = new Date(`${b}T00:00:00`)
  return Math.round((db.getTime() - da.getTime()) / 86400000)
}

interface StoredStreak {
  count: number
  lastDate: string | null
  /** Rest days banked right now. */
  skips: number
  /** Date the accrual clock last ticked; null until the first practice. */
  skipsAt: string | null
  /** The most this streak has had banked at once — what the warning compares to. */
  peak: number
}

/** `date` shifted by `n` whole days, as YYYY-MM-DD. */
function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00`)
  d.setDate(d.getDate() + n)
  return localDate(d)
}

function load(): StoredStreak {
  try {
    const count = parseInt(localStorage.getItem(COUNT_KEY) ?? '0', 10) || 0
    const lastDate = localStorage.getItem(DATE_KEY)
    const raw = localStorage.getItem(SKIPS_KEY)
    if (raw === null) return migrate(count, lastDate)
    const skips = clampSkips(parseInt(raw, 10))
    const peak = clampSkips(parseInt(localStorage.getItem(SKIPS_PEAK_KEY) ?? '', 10))
    return {
      count,
      lastDate,
      skips,
      skipsAt: localStorage.getItem(SKIPS_AT_KEY),
      peak: Math.max(peak, skips),
    }
  } catch {
    return { count: 0, lastDate: null, skips: SKIP_START, skipsAt: null, peak: SKIP_START }
  }
}

function clampSkips(n: number): number {
  if (!Number.isFinite(n) || n < 0) return 0
  return Math.min(SKIP_CAP, Math.floor(n))
}

/**
 * Reads a streak saved before rest days were banked. The old scheme stored only
 * the date a skip was last spent, so: spent recently → the bank is empty and
 * refills a week after that day; otherwise the learner had their skip in hand.
 * Either way the peak is one, so a spent skip shows the warning straight away.
 */
function migrate(count: number, lastDate: string | null): StoredStreak {
  const spentOn = localStorage.getItem(LEGACY_SKIP_KEY)
  return spentOn
    ? { count, lastDate, skips: 0, skipsAt: spentOn, peak: SKIP_START }
    : { count, lastDate, skips: SKIP_START, skipsAt: null, peak: SKIP_START }
}

function save(state: StoredStreak): void {
  try {
    localStorage.setItem(COUNT_KEY, String(state.count))
    if (state.lastDate) localStorage.setItem(DATE_KEY, state.lastDate)
    localStorage.setItem(SKIPS_KEY, String(state.skips))
    localStorage.setItem(SKIPS_PEAK_KEY, String(state.peak))
    if (state.skipsAt) localStorage.setItem(SKIPS_AT_KEY, state.skipsAt)
    else localStorage.removeItem(SKIPS_AT_KEY)
    localStorage.removeItem(LEGACY_SKIP_KEY)
  } catch {
    // private mode — streak simply won't persist
  }
}

/**
 * The state brought up to date for `today`: one rest day per full
 * `SKIP_ACCRUAL_DAYS` since the clock last ticked, never past the cap. A full
 * bank idles its clock, so the next week only starts counting once there is
 * room again. Pure, so the display can call it without writing anything.
 */
function accrue(state: StoredStreak, today: string): StoredStreak {
  const anchor = state.skipsAt ?? today
  const elapsed = daysBetween(anchor, today)
  let { skips, skipsAt } = { skips: state.skips, skipsAt: anchor }
  if (elapsed >= SKIP_ACCRUAL_DAYS && skips < SKIP_CAP) {
    const earned = Math.floor(elapsed / SKIP_ACCRUAL_DAYS)
    skips = clampSkips(skips + earned)
    skipsAt = addDays(anchor, earned * SKIP_ACCRUAL_DAYS)
  }
  // A full bank — or a clock that has moved backwards — starts fresh from today.
  if (skips >= SKIP_CAP || elapsed < 0) skipsAt = today
  return { ...state, skips, skipsAt, peak: Math.max(state.peak, skips) }
}

/** Rest days a lapse of `gap` days would cost (one per day with no practice). */
function costOf(gap: number): number {
  return gap - 1
}

export interface SkipState {
  /** Rest days available right now. */
  available: number
  /** The most banked at once during this streak — the warning's benchmark. */
  peak: number
  /** Days until the next rest day is earned; null when the bank is full. */
  nextInDays: number | null
}

/**
 * The rest-day bank as the learner should see it today. `available < peak`
 * means they have spent some of their cushion and it hasn't grown back yet —
 * that is the warning the home screen shows.
 */
export function skipState(now: Date = new Date()): SkipState {
  const today = localDate(now)
  const { skips, skipsAt, peak } = accrue(load(), today)
  return {
    available: skips,
    peak,
    nextInDays: skips >= SKIP_CAP ? null : SKIP_ACCRUAL_DAYS - daysBetween(skipsAt ?? today, today),
  }
}

/**
 * The streak the learner can still see today: the stored count if the last
 * practice was today or yesterday, or if the banked rest days cover every day
 * missed since. Otherwise 0 (the streak has lapsed).
 */
export function currentStreak(now: Date = new Date()): number {
  const today = localDate(now)
  const { count, lastDate, skips } = accrue(load(), today)
  if (!lastDate) return 0
  const gap = daysBetween(lastDate, today)
  if (gap <= 1) return count
  return costOf(gap) <= skips ? count : 0
}

export interface StreakUpdate {
  /** Streak length before today's practice. */
  from: number
  /** Streak length after today's practice. */
  to: number
  /** True only when this practice actually grew the streak (cue the celebration). */
  extended: boolean
  /** Rest days spent to bridge the days missed since the last practice. */
  skipsSpent: number
}

/**
 * Records that the learner practised today and returns the transition. Already
 * practised today → no change (`extended: false`). Practised yesterday →
 * streak grows by one. Missed days → still grows, spending one banked rest day
 * per missed day, if the bank covers them all. Otherwise the streak resets and
 * starts again at one, with a fresh single rest day to its name.
 */
export function recordStreakDay(now: Date = new Date()): StreakUpdate {
  const today = localDate(now)
  const stored = load()
  if (stored.lastDate === today) {
    return { from: stored.count, to: stored.count, extended: false, skipsSpent: 0 }
  }

  const state = accrue(stored, today)
  const gap = state.lastDate ? daysBetween(state.lastDate, today) : Infinity
  const cost = costOf(gap)
  const skipsSpent = gap > 1 && cost <= state.skips ? cost : 0
  const kept = gap <= 1 || skipsSpent > 0
  const from = kept ? state.count : 0

  save(
    kept
      ? { ...state, count: from + 1, lastDate: today, skips: state.skips - skipsSpent }
      : { count: 1, lastDate: today, skips: SKIP_START, skipsAt: today, peak: SKIP_START },
  )
  return { from, to: from + 1, extended: true, skipsSpent }
}
