import { describe, it, expect } from 'vitest'
import {
  isLocationComplete,
  isLocationStarted,
  completionScore,
  pickContinueTarget,
  countDueReviewWords,
  shouldReviewFirst,
  REVIEW_DUE_THRESHOLD,
  type LocationSummary,
} from '@/exercises/progression'
import { scheduleReview } from '@/exercises/spacedRepetition'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { Location, WordProgress } from '@/db/types'

const T0 = 1_000_000_000_000

function loc(id: string, gridRow = 0, gridCol = 0): Location {
  return { id, name: { en: id, uz: id }, icon: '📍', gridRow, gridCol }
}

function summary(id: string, over: Partial<LocationSummary> = {}): LocationSummary {
  return {
    location: loc(id, over.location?.gridRow, over.location?.gridCol),
    totalWords: 10,
    seenWords: 0,
    knownWords: 0,
    progress: undefined,
    ...over,
  }
}

const bothActivities = (id: string) => ({
  locationId: id,
  completedExercises: ['roleplay', 'storytime'] as const as never,
})

describe('location completion classification', () => {
  it('is complete only when all words learned and both activities done', () => {
    expect(
      isLocationComplete(summary('a', { knownWords: 10, progress: bothActivities('a') })),
    ).toBe(true)
    // Missing an activity
    expect(
      isLocationComplete(
        summary('a', { knownWords: 10, progress: { locationId: 'a', completedExercises: ['roleplay'] } }),
      ),
    ).toBe(false)
    // Words not all learned
    expect(
      isLocationComplete(summary('a', { knownWords: 9, progress: bothActivities('a') })),
    ).toBe(false)
    // Empty location is never "complete"
    expect(isLocationComplete(summary('a', { totalWords: 0 }))).toBe(false)
  })

  it('counts a location started once a word is met or an activity is done', () => {
    expect(isLocationStarted(summary('a'))).toBe(false)
    expect(isLocationStarted(summary('a', { seenWords: 1 }))).toBe(true)
    expect(
      isLocationStarted(summary('a', { progress: { locationId: 'a', completedExercises: ['intro'] } })),
    ).toBe(true)
  })
})

describe('completionScore', () => {
  it('ranks a nearly-learned area above a barely-started one', () => {
    const near = summary('near', { seenWords: 10, knownWords: 8, progress: bothActivities('near') })
    const early = summary('early', { seenWords: 2, knownWords: 1 })
    expect(completionScore(near)).toBeGreaterThan(completionScore(early))
  })
})

describe('pickContinueTarget', () => {
  it('resumes the in-progress location closest to finishing', () => {
    const summaries = [
      summary('a', { seenWords: 3, knownWords: 2 }),
      summary('b', { seenWords: 10, knownWords: 7, progress: bothActivities('b') }),
      summary('c'), // unstarted
    ]
    const target = pickContinueTarget(summaries)
    expect(target?.location.id).toBe('b')
    expect(target?.kind).toBe('in-progress')
  })

  it('never resumes a completed location', () => {
    const summaries = [
      summary('done', { seenWords: 10, knownWords: 10, progress: bothActivities('done') }),
      summary('a', { seenWords: 4, knownWords: 3 }),
    ]
    expect(pickContinueTarget(summaries)?.location.id).toBe('a')
  })

  it('suggests the first unstarted location when nothing is in progress', () => {
    const summaries = [
      summary('done', { seenWords: 10, knownWords: 10, progress: bothActivities('done') }),
      summary('next'),
      summary('later'),
    ]
    const target = pickContinueTarget(summaries)
    expect(target?.location.id).toBe('next')
    expect(target?.kind).toBe('new')
  })

  it('returns null when every location is complete', () => {
    const summaries = [
      summary('a', { seenWords: 10, knownWords: 10, progress: bothActivities('a') }),
      summary('b', { seenWords: 10, knownWords: 10, progress: bothActivities('b') }),
    ]
    expect(pickContinueTarget(summaries)).toBeNull()
  })
})

describe('countDueReviewWords', () => {
  const learned = (over: Partial<WordProgress> = {}): WordProgress => ({
    wordId: 'w',
    seenAt: 1,
    lastResults: [],
    testPassed: [...TEST_QUESTION_TYPES],
    ...over,
  })

  it('counts only learned words whose review is due', () => {
    const list: WordProgress[] = [
      { ...learned(), wordId: 'due-no-schedule' }, // no review → due
      { ...learned({ review: scheduleReview(undefined, 5, T0) }), wordId: 'not-due' }, // due in 1 day
      { ...learned({ review: scheduleReview(undefined, 5, T0 - 5 * 24 * 3600_000) }), wordId: 'overdue' },
      { wordId: 'unlearned', seenAt: 1, lastResults: [], testPassed: ['type'] }, // not learned
      { wordId: 'unseen', lastResults: [], testPassed: [...TEST_QUESTION_TYPES] }, // never seen
    ]
    expect(countDueReviewWords(list, T0)).toBe(2) // due-no-schedule + overdue
  })
})

describe('shouldReviewFirst', () => {
  it('never reviews when nothing is due', () => {
    expect(shouldReviewFirst(0, 0)).toBe(false)
    expect(shouldReviewFirst(0, 2)).toBe(false)
  })

  it('always reviews when a lot has piled up', () => {
    expect(shouldReviewFirst(REVIEW_DUE_THRESHOLD, 0)).toBe(true)
  })

  it('otherwise folds a review in on a gentle rotation', () => {
    // With a few due words, review lands once every three sessions.
    const decisions = [0, 1, 2, 3, 4, 5].map((r) => shouldReviewFirst(3, r))
    expect(decisions).toEqual([false, false, true, false, false, true])
  })
})
