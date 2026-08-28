import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import {
  markWordsSeen,
  forgetWord,
  recordTestResult,
  recordMatchResult,
  markWordsKnown,
  isWelcomeCenterComplete,
  familyOf,
} from '@/db/progress'
import {
  canonicalId,
  isAlias,
  buildFamilyIndex,
  familyIds,
  dedupeFamilies,
  mergeFamilyProgress,
} from '@/exercises/wordFamilies'
import { isWordLearned } from '@/exercises/test'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { Word, WordProgress } from '@/db/types'

/**
 * Word families: the same word listed by several topics is one word to learn.
 * These cover the two halves of that — a family is served as one card, and its
 * progress is shared, so a common word is never taught twice over.
 */

const word = (id: string, uzbek: string, theme: string, sameAs?: string): Word => ({
  id,
  uzbek,
  english: uzbek,
  theme,
  level: 1,
  ...(sameAs ? { sameAs } : {}),
})

const CHOY = [
  word('restaurant.tea', 'choy', 'restaurant'),
  word('cafe.tea', 'choy', 'cafe', 'restaurant.tea'),
  word('choyxona.tea', 'choy', 'choyxona', 'restaurant.tea'),
]

describe('word family helpers', () => {
  it('reads the canonical id off an entry', () => {
    expect(canonicalId(CHOY[0])).toBe('restaurant.tea')
    expect(canonicalId(CHOY[1])).toBe('restaurant.tea')
    expect(isAlias(CHOY[0])).toBe(false)
    expect(isAlias(CHOY[1])).toBe(true)
  })

  it('indexes every member of a family, and leaves lone words out', () => {
    const index = buildFamilyIndex([...CHOY, word('airport.passport', 'pasport', 'airport')])
    for (const w of CHOY) {
      expect(familyIds(w.id, index).sort()).toEqual(CHOY.map((c) => c.id).sort())
    }
    expect(familyIds('airport.passport', index)).toEqual(['airport.passport'])
  })

  it('groups aliases even when the canonical entry is absent from the list', () => {
    const index = buildFamilyIndex([CHOY[1], CHOY[2]])
    expect(familyIds('cafe.tea', index)).toContain('restaurant.tea')
    expect(familyIds('cafe.tea', index)).toContain('choyxona.tea')
  })

  it('serves a family as one card, preferring the canonical copy', () => {
    const picked = dedupeFamilies([...CHOY, word('airport.passport', 'pasport', 'airport')])
    expect(picked.map((w) => w.id)).toEqual(['restaurant.tea', 'airport.passport'])
  })

  it('keeps an alias when its canonical is not in the pool (a topic-only list)', () => {
    // The cafe's own word list holds only the cafe's copy — dropping it would
    // leave the topic with no card for tea at all.
    const picked = dedupeFamilies([CHOY[1]])
    expect(picked.map((w) => w.id)).toEqual(['cafe.tea'])
  })

  it('does not reorder the words it keeps', () => {
    const other = word('airport.passport', 'pasport', 'airport')
    expect(dedupeFamilies([other, ...CHOY]).map((w) => w.id)).toEqual([
      'airport.passport',
      'restaurant.tea',
    ])
  })
})

describe('mergeFamilyProgress', () => {
  const row = (wordId: string, extra: Partial<WordProgress> = {}): WordProgress => ({
    wordId,
    lastResults: [],
    ...extra,
  })

  it('is undefined when the family has no progress at all', () => {
    expect(mergeFamilyProgress([undefined, undefined])).toBeUndefined()
  })

  it('loses nothing when rows written before the link are reconciled', () => {
    const merged = mergeFamilyProgress([
      row('restaurant.tea', {
        seenAt: 200,
        testPassed: ['read-choice'],
        spellMastery: 0.5,
        review: { reps: 1, intervalDays: 1, ease: 2.5, dueAt: 900, lastReviewedAt: 100 },
      }),
      row('cafe.tea', {
        seenAt: 100,
        testPassed: ['listen-choice', 'type'],
        spellMastery: 1,
        learnedAt: 300,
        review: { reps: 3, intervalDays: 6, ease: 2.5, dueAt: 500, lastReviewedAt: 100 },
      }),
    ])
    expect(merged?.seenAt).toBe(100)
    expect(merged?.testPassed?.sort()).toEqual(['listen-choice', 'read-choice', 'type'])
    expect(merged?.spellMastery).toBe(1)
    expect(merged?.learnedAt).toBe(300)
    // The soonest review wins, so merging never postpones a due word.
    expect(merged?.review?.dueAt).toBe(500)
  })
})

describe('shared progress across a family', () => {
  const words: Word[] = [
    ...CHOY,
    word('airport.passport', 'pasport', 'airport'),
    word('welcome-center.hello', 'Salom', 'welcome-center', 'core.hello'),
    word('core.hello', 'Salom', 'core'),
  ]

  let db: LugatchaDB

  beforeEach(async () => {
    // Opening the DB fires its 'populate' seed; an empty manifest makes it a no-op.
    vi.stubGlobal('fetch', async (url: string) => {
      const path = String(url).replace(/^.*\/data\//, '')
      const data = path === 'manifest.json' ? { words: [], stories: [], roleplay: [] } : undefined
      return { ok: data !== undefined, status: data ? 200 : 404, json: async () => data } as Response
    })
    db = new LugatchaDB()
    await db.words.bulkPut(words)
  })

  afterEach(async () => {
    await db.delete()
    vi.unstubAllGlobals()
  })

  it('finds every copy of a word, from any member', async () => {
    const expected = ['restaurant.tea', 'cafe.tea', 'choyxona.tea'].sort()
    expect((await familyOf(db, 'cafe.tea')).sort()).toEqual(expected)
    expect((await familyOf(db, 'restaurant.tea')).sort()).toEqual(expected)
    expect(await familyOf(db, 'airport.passport')).toEqual(['airport.passport'])
  })

  it('meeting a word at one topic means it is met at all of them', async () => {
    await markWordsSeen(db, ['restaurant.tea'])
    for (const id of ['restaurant.tea', 'cafe.tea', 'choyxona.tea']) {
      expect((await db.wordProgress.get(id))?.seenAt, id).toBeTypeOf('number')
    }
    expect(await db.wordProgress.get('airport.passport')).toBeUndefined()
  })

  it('learning a word once learns it everywhere', async () => {
    for (const type of TEST_QUESTION_TYPES) {
      await recordTestResult(db, 'cafe.tea', type, true)
    }
    for (const id of ['restaurant.tea', 'cafe.tea', 'choyxona.tea']) {
      expect(isWordLearned(await db.wordProgress.get(id)), id).toBe(true)
    }
  })

  it('does not announce the same word as newly learned a second time', async () => {
    for (const type of TEST_QUESTION_TYPES) {
      await recordTestResult(db, 'cafe.tea', type, true)
    }
    // The tea house's copy is already learned — passing it again is a re-test.
    const outcome = await recordTestResult(db, 'choyxona.tea', 'read-choice', true)
    expect(outcome.newlyLearned).toBe(false)
  })

  it('keeps a flashcard result from wiping the skills already banked', async () => {
    await recordTestResult(db, 'restaurant.tea', 'read-choice', true)
    await recordMatchResult(db, 'cafe.tea', true)
    expect((await db.wordProgress.get('restaurant.tea'))?.testPassed).toContain('read-choice')
  })

  it('forgetting a word forgets every copy of it', async () => {
    await markWordsSeen(db, ['restaurant.tea', 'airport.passport'])
    await forgetWord(db, 'choyxona.tea')
    for (const id of ['restaurant.tea', 'cafe.tea', 'choyxona.tea']) {
      expect(await db.wordProgress.get(id), id).toBeUndefined()
    }
    expect(await db.wordProgress.get('airport.passport')).toBeDefined()
  })

  it('declaring a word known during recovery marks every copy known', async () => {
    await markWordsKnown(db, ['cafe.tea'])
    expect(isWordLearned(await db.wordProgress.get('restaurant.tea'))).toBe(true)
  })

  it('does not graduate the Welcome Center just because a core copy was written', async () => {
    // Meeting "Salom" at the Welcome Center also writes its core copy. That copy
    // is not "progress beyond the Welcome Center" — the city must stay locked.
    await markWordsSeen(db, ['welcome-center.hello'])
    expect(await isWelcomeCenterComplete(db)).toBe(false)

    await markWordsSeen(db, ['airport.passport'])
    expect(await isWelcomeCenterComplete(db)).toBe(true)
  })
})
