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

async function finishAllPractice() {
  for (const exercise of WELCOME_REQUIRED_EXERCISES) {
    await completeExercise(db, WELCOME_CENTER_ID, exercise)
  }
}

/** Pass every test question type for every word, so each becomes "learned". */
async function learnAllWords() {
  for (const w of words) {
    for (const type of TEST_QUESTION_TYPES) {
      await recordTestResult(db, w.id, type, true)
    }
  }
}

describe('isWelcomeCenterComplete', () => {
  it('is false before anything is done', async () => {
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false with words met and practice done but the exam unfinished', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    await finishAllPractice()
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false when words are learned but a practice activity is missing', async () => {
    await learnAllWords()
    for (const exercise of WELCOME_REQUIRED_EXERCISES) {
      if (exercise !== 'storytime') await completeExercise(db, WELCOME_CENTER_ID, exercise)
    }
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false when only some words are learned', async () => {
    await finishAllPractice()
    await markWordsSeen(db, words.map((w) => w.id))
    for (const type of TEST_QUESTION_TYPES) {
      await recordTestResult(db, 'welcome-center.hello', type, true) // only one word learned
    }
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is true once every word is learned and every practice activity is done', async () => {
    await learnAllWords()
    await finishAllPractice()
    expect(await isWelcomeCenterComplete(db)).toBe(true)
  })
})
