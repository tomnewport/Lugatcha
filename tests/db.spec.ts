import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import { ensureSeeded } from '@/db/seed'
import {
  markWordsSeen,
  recordMatchResult,
  completeExercise,
  recordLocationVisit,
  recordRoleplayShown,
  loadRoleplayShownMap,
  resetAllProgress,
} from '@/db/progress'
import { isWordKnown } from '@/db/useDb'
import type { Word, Story, Roleplay } from '@/db/types'

const words: Word[] = [
  { id: 'core.hello', uzbek: 'Salom', english: 'Hello', theme: 'core' },
  { id: 'airport.passport', uzbek: 'pasport', english: 'passport', theme: 'airport' },
]

const story: Story = {
  id: 'airport.arrival',
  theme: 'airport',
  title: { en: 'Arrival', uz: 'Kelish' },
  sentences: [{ uzbek: 'Men keldim.', english: 'I arrived.' }],
}

const roleplay: Roleplay = {
  id: 'airport.customs',
  theme: 'airport',
  title: { en: 'At Customs', uz: 'Bojxonada' },
  scenario: 'Customs check',
  variants: [
    {
      id: 'base',
      description: 'All goes well',
      turns: [{ speaker: 'npc', uzbek: 'Salom!', english: 'Hello!' }],
    },
  ],
}

const dataFiles: Record<string, unknown> = {
  'manifest.json': { words: ['core'], stories: ['airport'], roleplay: ['airport'] },
  'words/core.json': words,
  'stories/airport.json': [story],
  'roleplay/airport.json': [roleplay],
}

let db: LugatchaDB

beforeEach(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const path = url.replace(/^.*\/data\//, '')
    const data = dataFiles[path]
    return {
      ok: data !== undefined,
      status: data !== undefined ? 200 : 404,
      json: async () => data,
    } as Response
  })
  db = new LugatchaDB()
})

afterEach(async () => {
  await db.delete()
  vi.unstubAllGlobals()
})

describe('ensureSeeded', () => {
  it('loads every content type listed in the manifest', async () => {
    await ensureSeeded(db)
    expect(await db.words.count()).toBe(2)
    expect(await db.stories.count()).toBe(1)
    expect(await db.roleplay.count()).toBe(1)
    expect((await db.words.get('core.hello'))?.uzbek).toBe('Salom')
  })

  it('is a no-op once words exist', async () => {
    await ensureSeeded(db)
    await db.words.delete('airport.passport')
    await ensureSeeded(db)
    expect(await db.words.count()).toBe(1)
  })
})

describe('markWordsSeen', () => {
  it('stamps seenAt once and keeps the original timestamp', async () => {
    await markWordsSeen(db, ['core.hello'])
    const first = await db.wordProgress.get('core.hello')
    expect(first?.seenAt).toBeTypeOf('number')

    await new Promise((r) => setTimeout(r, 5))
    await markWordsSeen(db, ['core.hello'])
    const second = await db.wordProgress.get('core.hello')
    expect(second?.seenAt).toBe(first?.seenAt)
  })
})

describe('recordMatchResult + isWordKnown', () => {
  it('keeps only the last four results, newest first', async () => {
    for (const result of [true, false, true, true, false]) {
      await recordMatchResult(db, 'core.hello', result)
    }
    const progress = await db.wordProgress.get('core.hello')
    expect(progress?.lastResults).toEqual([false, true, true, false])
  })

  it('marks a word known at 3 of the last 4 correct', async () => {
    for (const result of [true, true, false, true]) {
      await recordMatchResult(db, 'core.hello', result)
    }
    expect(isWordKnown(await db.wordProgress.get('core.hello'))).toBe(true)
  })

  it('does not mark a word known with fewer than 4 results or only 2 correct', async () => {
    for (const result of [true, true, false]) {
      await recordMatchResult(db, 'core.hello', result)
    }
    expect(isWordKnown(await db.wordProgress.get('core.hello'))).toBe(false)

    await recordMatchResult(db, 'core.hello', false)
    expect(isWordKnown(await db.wordProgress.get('core.hello'))).toBe(false)
  })

  it('preserves seenAt when recording results', async () => {
    await markWordsSeen(db, ['core.hello'])
    const seenAt = (await db.wordProgress.get('core.hello'))?.seenAt
    await recordMatchResult(db, 'core.hello', true)
    expect((await db.wordProgress.get('core.hello'))?.seenAt).toBe(seenAt)
  })
})

describe('completeExercise', () => {
  it('appends in order and is idempotent', async () => {
    await completeExercise(db, 'airport', 'intro')
    await completeExercise(db, 'airport', 'intro')
    await completeExercise(db, 'airport', 'flashcards')
    const progress = await db.locationProgress.get('airport')
    expect(progress?.completedExercises).toEqual(['intro', 'flashcards'])
  })

  it('preserves the visit count when marking an exercise done', async () => {
    await recordLocationVisit(db, 'airport')
    await completeExercise(db, 'airport', 'intro')
    expect((await db.locationProgress.get('airport'))?.visits).toBe(1)
  })
})

describe('recordLocationVisit', () => {
  it('counts up from nothing and preserves completed exercises', async () => {
    await completeExercise(db, 'airport', 'intro')
    await recordLocationVisit(db, 'airport')
    await recordLocationVisit(db, 'airport')
    const progress = await db.locationProgress.get('airport')
    expect(progress?.visits).toBe(2)
    expect(progress?.completedExercises).toEqual(['intro'])
  })
})

describe('roleplay shown tracking', () => {
  it('records when a variant was shown and reads it back', async () => {
    expect((await loadRoleplayShownMap(db, ['base'])).has('base')).toBe(false)
    await recordRoleplayShown(db, 'base')
    const map = await loadRoleplayShownMap(db, ['base'])
    expect(map.get('base')).toBeTypeOf('number')
  })
})

describe('resetAllProgress', () => {
  it('clears progress but keeps content', async () => {
    await markWordsSeen(db, ['core.hello'])
    await completeExercise(db, 'airport', 'intro')
    await recordRoleplayShown(db, 'base')
    await resetAllProgress(db)
    expect(await db.wordProgress.count()).toBe(0)
    expect(await db.locationProgress.count()).toBe(0)
    expect(await db.roleplayProgress.count()).toBe(0)
    expect(await db.words.count()).toBe(2)
  })
})
