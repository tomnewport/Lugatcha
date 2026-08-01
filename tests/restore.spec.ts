import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import { markWordsKnown, markExercisesDone, recordTestResult, completeExercise } from '@/db/progress'
import { isWordLearned } from '@/exercises/test'
import { TEST_QUESTION_TYPES } from '@/db/types'

let db: LugatchaDB

beforeEach(() => {
  // Seed fires on first DB access; restore never needs content, so an empty
  // manifest is enough (travel/group files are allowed to 404).
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace(/^.*\/data\//, '')
    const data = path === 'manifest.json' ? { words: [], stories: [], roleplay: [] } : undefined
    return { ok: data !== undefined, status: data ? 200 : 404, json: async () => data } as Response
  })
  db = new LugatchaDB()
})

afterEach(async () => {
  await db.delete()
  vi.unstubAllGlobals()
})

describe('markWordsKnown', () => {
  it('marks a fresh word as fully learned with a review schedule', async () => {
    await markWordsKnown(db, ['airport.passport'], 1_000)
    const p = await db.wordProgress.get('airport.passport')
    expect(p).toBeDefined()
    expect(isWordLearned(p)).toBe(true)
    expect(p?.testPassed).toEqual([...TEST_QUESTION_TYPES])
    expect(p?.seenAt).toBe(1_000)
    expect(p?.learnedAt).toBe(1_000)
    // Scheduled for future review, not due immediately, so it doesn't flood practice.
    expect(p?.review?.dueAt).toBeGreaterThan(1_000)
  })

  it('fills in the missing skills of a partially-learned word but keeps its history', async () => {
    // Genuinely pass one skill first, recording a real seenAt/review.
    await recordTestResult(db, 'core.hello', 'listen-choice', true)
    const before = await db.wordProgress.get('core.hello')
    expect(isWordLearned(before)).toBe(false)

    await markWordsKnown(db, ['core.hello'], 9_999)
    const after = await db.wordProgress.get('core.hello')
    expect(isWordLearned(after)).toBe(true)
    // Real learning history is preserved, not overwritten by the restore time.
    expect(after?.seenAt).toBe(before?.seenAt)
    expect(after?.review).toEqual(before?.review)
  })

  it('leaves an already-learned word completely untouched', async () => {
    await markWordsKnown(db, ['bank.money'], 1_000)
    const first = await db.wordProgress.get('bank.money')
    await markWordsKnown(db, ['bank.money'], 5_000)
    const second = await db.wordProgress.get('bank.money')
    expect(second).toEqual(first)
  })
})

describe('markExercisesDone', () => {
  it('marks several exercises complete at once', async () => {
    await markExercisesDone(db, 'airport', ['flashcards', 'listening', 'test'])
    const p = await db.locationProgress.get('airport')
    expect(p?.completedExercises).toEqual(
      expect.arrayContaining(['flashcards', 'listening', 'test']),
    )
  })

  it('is idempotent and preserves existing progress fields', async () => {
    await completeExercise(db, 'cafe', 'roleplay')
    await db.locationProgress.update('cafe', { visits: 4, graduatedAt: 42 })

    await markExercisesDone(db, 'cafe', ['roleplay', 'storytime'])
    const p = await db.locationProgress.get('cafe')
    expect(p?.completedExercises).toEqual(['roleplay', 'storytime'])
    expect(p?.visits).toBe(4)
    expect(p?.graduatedAt).toBe(42)
  })
})
