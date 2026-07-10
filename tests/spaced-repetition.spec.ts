import { describe, it, expect } from 'vitest'
import {
  scheduleReview,
  gradeFromResult,
  isDue,
  overdueRatio,
  reviewStage,
  reviewStatus,
  relativeDue,
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

describe('reviewStage', () => {
  const withInterval = (intervalDays: number): ReviewSchedule => ({
    reps: 3,
    intervalDays,
    ease: DEFAULT_EASE,
    dueAt: T0,
    lastReviewedAt: T0,
  })

  it('classifies memory strength by interval', () => {
    expect(reviewStage(undefined)).toBe('new')
    expect(reviewStage(withInterval(LAPSE_INTERVAL_DAYS))).toBe('learning')
    expect(reviewStage(withInterval(3))).toBe('young')
    expect(reviewStage(withInterval(10))).toBe('growing')
    expect(reviewStage(withInterval(30))).toBe('strong')
  })

  it('grows the stage as a word is repeatedly recalled', () => {
    let s = scheduleReview(undefined, 5, T0)
    const stages: string[] = []
    for (let i = 0; i < 6; i++) {
      stages.push(reviewStage(s))
      s = scheduleReview(s, 5, s.dueAt)
    }
    // Never regresses while consistently recalled, and reaches 'strong'.
    const order = ['new', 'learning', 'young', 'growing', 'strong']
    for (let i = 1; i < stages.length; i++) {
      expect(order.indexOf(stages[i])).toBeGreaterThanOrEqual(order.indexOf(stages[i - 1]))
    }
    expect(stages).toContain('strong')
  })
})

describe('reviewStatus', () => {
  it('reports strength and due-ness together', () => {
    const s = scheduleReview(undefined, 5, T0) // young-ish, due in 1 day
    const before = reviewStatus(s, s.dueAt - DAY_MS / 2)
    expect(before.due).toBe(false)
    expect(before.strength).toBeGreaterThan(0)
    expect(before.dueInMs).toBeGreaterThan(0)

    const after = reviewStatus(s, s.dueAt + DAY_MS)
    expect(after.due).toBe(true)
    expect(after.dueInMs).toBeLessThan(0)
  })

  it('treats an unscheduled word as new and due', () => {
    const st = reviewStatus(undefined, T0)
    expect(st.stage).toBe('new')
    expect(st.strength).toBe(0)
    expect(st.due).toBe(true)
  })
})

describe('relativeDue', () => {
  it('buckets into the largest sensible unit', () => {
    expect(relativeDue(30 * 60_000)).toEqual({ value: 30, unit: 'm' })
    expect(relativeDue(5 * 60 * 60_000)).toEqual({ value: 5, unit: 'h' })
    expect(relativeDue(3 * DAY_MS)).toEqual({ value: 3, unit: 'd' })
    expect(relativeDue(21 * DAY_MS)).toEqual({ value: 3, unit: 'w' })
  })

  it('never returns less than one unit for a positive wait', () => {
    expect(relativeDue(10_000)).toEqual({ value: 1, unit: 'm' })
    expect(relativeDue(-5000).value).toBe(1) // clamped
  })
})
