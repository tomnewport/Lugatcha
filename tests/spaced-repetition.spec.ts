import { describe, it, expect } from 'vitest'
import {
  scheduleReview,
  gradeFromResult,
  isDue,
  overdueRatio,
  DAY_MS,
  MIN_EASE,
  DEFAULT_EASE,
  LAPSE_INTERVAL_DAYS,
  type ReviewSchedule,
} from '@/exercises/spacedRepetition'

const T0 = 1_000_000_000_000

describe('gradeFromResult', () => {
  it('maps booleans to easy / lapse', () => {
    expect(gradeFromResult(true)).toBe(5)
    expect(gradeFromResult(false)).toBe(1)
  })

  it('maps spelling scores by quality', () => {
    expect(gradeFromResult(1)).toBe(5)
    expect(gradeFromResult(0.7)).toBe(4)
    expect(gradeFromResult(0.3)).toBe(3)
    expect(gradeFromResult(0)).toBe(1)
  })
})

describe('scheduleReview', () => {
  it('schedules a first success one day out', () => {
    const s = scheduleReview(undefined, 5, T0)
    expect(s.reps).toBe(1)
    expect(s.intervalDays).toBe(1)
    expect(s.dueAt).toBe(T0 + DAY_MS)
    expect(s.ease).toBeGreaterThanOrEqual(DEFAULT_EASE)
  })

  it('grows the interval on a run of successes (1, 3, then × ease)', () => {
    let s = scheduleReview(undefined, 4, T0)
    expect(s.intervalDays).toBe(1)
    s = scheduleReview(s, 4, s.dueAt)
    expect(s.intervalDays).toBe(3)
    const prevInterval = s.intervalDays
    const ease = s.ease
    s = scheduleReview(s, 4, s.dueAt)
    expect(s.intervalDays).toBe(Math.round(prevInterval * ease))
    expect(s.intervalDays).toBeGreaterThan(prevInterval)
  })

  it('brings a lapsed word straight back and lowers ease', () => {
    let s = scheduleReview(undefined, 5, T0)
    s = scheduleReview(s, 5, s.dueAt)
    const easeBefore = s.ease
    const lapsed = scheduleReview(s, 1, s.dueAt)
    expect(lapsed.reps).toBe(0)
    expect(lapsed.intervalDays).toBeCloseTo(LAPSE_INTERVAL_DAYS)
    expect(lapsed.dueAt).toBe(s.dueAt + LAPSE_INTERVAL_DAYS * DAY_MS)
    expect(lapsed.ease).toBeLessThan(easeBefore)
    expect(lapsed.ease).toBeGreaterThanOrEqual(MIN_EASE)
  })

  it('never lets ease fall below the floor', () => {
    let s: ReviewSchedule | undefined
    for (let i = 0; i < 20; i++) s = scheduleReview(s, 1, T0 + i)
    expect(s!.ease).toBe(MIN_EASE)
  })

  it('requires a full day again after a lapse recovers', () => {
    let s = scheduleReview(undefined, 1, T0) // lapse from scratch
    s = scheduleReview(s, 5, T0 + DAY_MS) // recovers
    expect(s.intervalDays).toBeGreaterThanOrEqual(1)
  })
})

describe('isDue / overdueRatio', () => {
  it('treats an unscheduled word as due', () => {
    expect(isDue(undefined, T0)).toBe(true)
    expect(overdueRatio(undefined, T0)).toBe(Number.POSITIVE_INFINITY)
  })

  it('is not due before dueAt and due after', () => {
    const s = scheduleReview(undefined, 5, T0)
    expect(isDue(s, s.dueAt - 1)).toBe(false)
    expect(isDue(s, s.dueAt)).toBe(true)
    expect(overdueRatio(s, s.dueAt - 1)).toBe(0)
  })

  it('ranks more-overdue words higher', () => {
    const s = scheduleReview(undefined, 5, T0) // 1-day interval
    const slightlyLate = overdueRatio(s, s.dueAt + DAY_MS)
    const veryLate = overdueRatio(s, s.dueAt + 10 * DAY_MS)
    expect(veryLate).toBeGreaterThan(slightlyLate)
  })
})
