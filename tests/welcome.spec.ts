import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/db'
import {
  WELCOME_CENTER_ID,
  WELCOME_REQUIRED_EXERCISES,
  isWelcomeCenterComplete,
  markWordsSeen,
  completeExercise,
} from '@/db/progress'
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

async function finishAllActivities() {
  for (const exercise of WELCOME_REQUIRED_EXERCISES) {
    await completeExercise(db, WELCOME_CENTER_ID, exercise)
  }
}

describe('isWelcomeCenterComplete', () => {
  it('is false before anything is done', async () => {
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false with every activity done but words still unseen', async () => {
    await finishAllActivities()
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is false with all words seen but an activity (the exam) missing', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    for (const exercise of WELCOME_REQUIRED_EXERCISES) {
      if (exercise !== 'test') await completeExercise(db, WELCOME_CENTER_ID, exercise)
    }
    expect(await isWelcomeCenterComplete(db)).toBe(false)
  })

  it('is true once every word is met and every activity is done', async () => {
    await markWordsSeen(db, words.map((w) => w.id))
    await finishAllActivities()
    expect(await isWelcomeCenterComplete(db)).toBe(true)
  })
})
