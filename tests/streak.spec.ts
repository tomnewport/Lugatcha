import { describe, it, expect } from 'vitest'
import {
  streakChips,
  streakString,
  planIncrement,
  recordStreakDay,
  currentStreak,
} from '@/streak'

describe('streakChips', () => {
  it('renders the worked examples from the brief', () => {
    expect(streakString(1)).toBe('🔹')
    expect(streakString(2)).toBe('🔹🔸')
    expect(streakString(26)).toBe('💠🔹')
    expect(streakString(74)).toBe('💠✴️🔷🔶🔷🔶🔹🔸🔹🔸')
  })

  it('is empty for a streak of zero', () => {
    expect(streakChips(0)).toEqual([])
  })

  it('fuses five singles into one five-chip', () => {
    expect(streakString(4)).toBe('🔹🔸🔹🔸')
    expect(streakString(5)).toBe('🔷')
    expect(streakString(6)).toBe('🔷🔹')
  })

  it('fuses five five-chips into one twenty-five-chip', () => {
    expect(streakString(24)).toBe('🔷🔶🔷🔶🔹🔸🔹🔸')
    expect(streakString(25)).toBe('💠')
    expect(streakString(50)).toBe('💠✴️')
  })

  it('alternates colour within each tier', () => {
    const chips = streakChips(2)
    expect(chips[0].color).toBe('blue')
    expect(chips[1].color).toBe('orange')
  })
})

describe('planIncrement', () => {
  it('adds a lone single chip when there is no carry', () => {
    const plan = planIncrement(5) // 5 -> 6
    expect(plan.added.symbol).toBe('🔹')
    expect(plan.merges).toHaveLength(0)
  })

  it('fuses a five-chip when the fifth single lands', () => {
    const plan = planIncrement(4) // 4 -> 5
    expect(plan.merges).toHaveLength(1)
    const [merge] = plan.merges
    expect(merge.tier).toBe(0)
    expect(merge.components.map((c) => c.symbol)).toEqual(['🔹', '🔸', '🔹', '🔸', '🔹'])
    expect(merge.result.symbol).toBe('🔷')
  })

  it('cascades two merges when crossing twenty-five', () => {
    const plan = planIncrement(24) // 24 -> 25
    expect(plan.merges).toHaveLength(2)
    expect(plan.merges[0].result.symbol).toBe('🔷') // fifth five-chip
    expect(plan.merges[1].tier).toBe(1)
    expect(plan.merges[1].components.map((c) => c.symbol)).toEqual([
      '🔷',
      '🔶',
      '🔷',
      '🔶',
      '🔷',
    ])
    expect(plan.merges[1].result.symbol).toBe('💠')
  })

  it('the added chip matches the new streak length', () => {
    // First day of all.
    expect(planIncrement(0).added.symbol).toBe('🔹')
    expect(planIncrement(0).merges).toHaveLength(0)
  })
})

describe('recordStreakDay', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`)

  it('starts a streak at one on the first practice', () => {
    const update = recordStreakDay(day('2026-06-29'))
    expect(update).toEqual({ from: 0, to: 1, extended: true })
    expect(currentStreak(day('2026-06-29'))).toBe(1)
  })

  it('grows the streak when practising on consecutive days', () => {
    recordStreakDay(day('2026-06-29'))
    const update = recordStreakDay(day('2026-06-30'))
    expect(update).toEqual({ from: 1, to: 2, extended: true })
  })

  it('does not double-count a second practice on the same day', () => {
    recordStreakDay(day('2026-06-29'))
    const update = recordStreakDay(day('2026-06-29'))
    expect(update).toEqual({ from: 1, to: 1, extended: false })
  })

  it('resets to one after a missed day', () => {
    recordStreakDay(day('2026-06-29'))
    const update = recordStreakDay(day('2026-07-02'))
    expect(update).toEqual({ from: 0, to: 1, extended: true })
  })
})

describe('currentStreak', () => {
  const day = (iso: string) => new Date(`${iso}T12:00:00`)

  it('survives until the day after the last practice', () => {
    recordStreakDay(day('2026-06-29'))
    expect(currentStreak(day('2026-06-30'))).toBe(1) // still extendable today
  })

  it('lapses to zero once a day is missed', () => {
    recordStreakDay(day('2026-06-29'))
    expect(currentStreak(day('2026-07-01'))).toBe(0)
  })
})
