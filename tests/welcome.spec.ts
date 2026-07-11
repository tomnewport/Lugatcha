import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/db'
import {
  WELCOME_CENTER_ID,
  WELCOME_REQUIRED_EXERCISES,
  isWelcomeCenterComplete,
  markWordsSeen,
  completeExercise,
  recordTestResult,
} from '@/db/progress'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { Word } from '@/db/types'

const words: Word[] = [
  { id: 'welcome-center.hello', uzbek: 'Salom', english: 'Hello', theme: WELCOME_CENTER_ID, level: 1 },
  { id: 'welcome-center.thanks', uzbek: 'Rahmat', english: 'Thanks', theme: WELCOME_CENTER_ID, level: 1 },
]

beforeEach(async () => {
  // Opening the singleton DB fires its 'populate' seed, which fetches data files.
  vi.stubGlobal('fetch', async (url: string) => {
    const path = String(url).replace(/^.*\/data\//, '')
    const data = path === 'manifest.json' ? { words: [], stories: [], roleplay: [] } : undefined
    return { ok: data !== undefined, status: data ? 200 : 404, json: async () => data } as Response
  })
  await db.words.clear()
  await db.wordProgress.clear()
  await db.locationProgress.clear()
  await db.words.bulkPut(words)
})

afterEach(() => vi.unstubAllGlobals())

/** Every required activity once — including the Learn Vocabulary session. */
async function finishAllActivities() {
  for (const exercise of WELCOME_REQUIRED_EXERCISES) {
    await completeExercise(db, WELCOME_CENTER_ID, exercise)
  }
}

/** Pass every test question type for a word, so it becomes "learned". */
async function learnWord(wordId: string) {
  for (const type of TEST_QUESTION_TYPES) {
    await recordTestResult(db, wordId, type, true)
  }
}

describe('isWelcomeCenterComplete', () => {
  it('is false before anything is done', async () => {
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false with words met but the vocabulary session unfinished', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    for (const exercise of WELCOME_REQUIRED_EXERCISES) {
      if (exercise !== 'test') await completeExercise(db, WELCOME_CENTER_ID, exercise)
    }
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false when a practice activity is missing', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    for (const exercise of WELCOME_REQUIRED_EXERCISES) {
      if (exercise !== 'storytime') await completeExercise(db, WELCOME_CENTER_ID, exercise)
    }
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false when a word is still unmet', async () => {
    await markWordsSeen(db, [words[0].id])
    await finishAllActivities()
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is true once every word is met and every activity done once — full mastery not required', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    await finishAllActivities()
    // No word has been fully learned; one session of each activity suffices.
    expect(await isWelcomeCenterComplete(db)).toBe(true)
  })

  it('latches: stays complete after a welcome word is later un-learned', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    await finishAllActivities()
    await learnWord('welcome-center.hello')
    expect(await isWelcomeCenterComplete(db)).toBe(true) // records graduatedAt

    // Two outright misses in daily practice un-learn the word (issue #61) —
    // the word returns to rotation, but the city must not lock again.
    await recordTestResult(db, 'welcome-center.hello', 'read-choice', false)
    await recordTestResult(db, 'welcome-center.hello', 'read-choice', false)
    expect(await isWelcomeCenterComplete(db)).toBe(true)

    const progress = await db.locationProgress.get(WELCOME_CENTER_ID)
    expect(progress?.graduatedAt).toBeTypeOf('number')
  })

  it('keeps the latch when later location progress is recorded', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    await finishAllActivities()
    expect(await isWelcomeCenterComplete(db)).toBe(true)

    await completeExercise(db, WELCOME_CENTER_ID, 'test')
    const progress = await db.locationProgress.get(WELCOME_CENTER_ID)
    expect(progress?.graduatedAt).toBeTypeOf('number')
  })

  it('grandfathers users with progress beyond the Welcome Center', async () => {
    // A pre-latch graduate: their welcome progress lapsed before graduatedAt
    // existed, but words outside the Welcome Center prove the city was open.
    await db.words.put({ id: 'cafe.choy', uzbek: 'Choy', english: 'Tea', theme: 'cafe', level: 1 })
    await markWordsSeen(db, [words[0].id, 'cafe.choy'])
    expect(await isWelcomeCenterComplete(db)).toBe(true)
  })

  it('does not grandfather a learner still onboarding', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })
})
