import { describe, it, expect } from 'vitest'
import {
  leadWithHighFrequency,
  isHighFrequency,
  HIGH_FREQUENCY_PER_TEST,
  HIGH_FREQUENCY_PRACTICE_SLOTS,
} from '@/exercises/highFrequency'
import {
  selectTestPairs,
  selectDailyPracticePairs,
  DAILY_ACTIVE_WORDS,
  NEW_WORDS_PER_TEST,
} from '@/exercises/test'
import { buildDailyPracticeSession } from '@/exercises/practice'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { Word, WordProgress } from '@/db/types'

/**
 * High-frequency vocabulary is taught wherever the learner goes. The School is
 * its home, but every other way in — a location's New Words, its Test, and
 * Daily Practice — keeps a share of its slots for it. These pin down that
 * share: present everywhere, and never the whole session.
 */

const NOW = 1_700_000_000_000

const word = (id: string, theme = 'airport'): Word => ({
  id,
  uzbek: id,
  english: id,
  theme,
  level: 1,
})

const common = (id: string): Word => ({ ...word(id, 'core'), highFrequency: true })

const seen = (wordId: string, passed: number = 0): WordProgress => ({
  wordId,
  lastResults: [],
  seenAt: 1,
  testPassed: TEST_QUESTION_TYPES.slice(0, passed),
})

const progressFor = (words: Word[], passed = 0) =>
  new Map<string, WordProgress | undefined>(words.map((w) => [w.id, seen(w.id, passed)]))

describe('leadWithHighFrequency', () => {
  it('puts the high-frequency words first without reordering the rest', () => {
    const ordered = leadWithHighFrequency(
      [word('a'), common('men'), word('b'), common('va'), word('c')],
      2,
    )
    expect(ordered.map((x) => x.id)).toEqual(['men', 'va', 'a', 'b', 'c'])
  })

  it('leads with only as many as the session keeps room for', () => {
    const ordered = leadWithHighFrequency(
      [word('a'), common('men'), common('va'), common('bu'), common('juda')],
      2,
    )
    // Two lead; the others stay in place rather than crowding out the topic.
    expect(ordered.map((x) => x.id)).toEqual(['men', 'va', 'a', 'bu', 'juda'])
  })

  it('changes nothing when there is none left to meet, or no room kept', () => {
    expect(leadWithHighFrequency([word('a'), word('b')], 2).map((x) => x.id)).toEqual(['a', 'b'])
    expect(leadWithHighFrequency([word('a'), common('men')], 0).map((x) => x.id)).toEqual([
      'a',
      'men',
    ])
  })

  it('recognises the flag the vocabulary sets carry', () => {
    expect(isHighFrequency(common('men'))).toBe(true)
    expect(isHighFrequency(word('a'))).toBe(false)
  })
})

describe('a location Test', () => {
  it('leads its batch with a high-frequency word, so they reach learned too', () => {
    // A test is the only place a word becomes learned. Left to chance, the glue
    // met at the airport would only be tested if the shuffle happened to pick it.
    const themeWords = Array.from({ length: 12 }, (_, i) => word(`airport.n${i}`))
    const glue = [common('essentials.men'), common('verbs.bering')]
    const candidates = [...themeWords, ...glue]
    const pairs = selectTestPairs(candidates, [], progressFor(candidates))

    const batch = [...new Set(pairs.map((p) => p.word.id))].slice(0, NEW_WORDS_PER_TEST)
    expect(batch.filter((id) => glue.some((g) => g.id === id))).toHaveLength(
      HIGH_FREQUENCY_PER_TEST,
    )
    // The location still teaches its own vocabulary in the same session.
    expect(batch.filter((id) => id.startsWith('airport.')).length).toBeGreaterThan(0)
  })
})

describe("Daily Practice's active batch", () => {
  it('keeps a share of the batch for high-frequency words', () => {
    // They are all one "area" (core), so without a reservation the whole set
    // competes for a single area's share while each location gets its own.
    const cityWords = ['airport', 'hotel', 'cafe', 'museum'].flatMap((theme) =>
      Array.from({ length: 6 }, (_, i) => word(`${theme}.n${i}`, theme)),
    )
    const glue = Array.from({ length: 10 }, (_, i) => common(`essentials.g${i}`))
    const seenWords = [...cityWords, ...glue]
    // City words are further along, so on merit alone they would take every slot.
    const progress = new Map<string, WordProgress | undefined>([
      ...cityWords.map((w) => [w.id, seen(w.id, 3)] as const),
      ...glue.map((w) => [w.id, seen(w.id, 0)] as const),
    ])

    const pairs = selectDailyPracticePairs(seenWords, progress, 40, undefined, NOW, false)
    const drilled = new Set(pairs.map((p) => p.word.id))
    const glueDrilled = glue.filter((w) => drilled.has(w.id))
    expect(glueDrilled).toHaveLength(HIGH_FREQUENCY_PRACTICE_SLOTS)
    // ...and the rest of the batch still belongs to the city.
    expect(drilled.size).toBeLessThanOrEqual(DAILY_ACTIVE_WORDS)
    expect(cityWords.filter((w) => drilled.has(w.id)).length).toBe(
      drilled.size - HIGH_FREQUENCY_PRACTICE_SLOTS,
    )
  })

  it('leaves the batch to the city when there is no high-frequency word to drill', () => {
    const cityWords = ['airport', 'hotel'].flatMap((theme) =>
      Array.from({ length: 6 }, (_, i) => word(`${theme}.n${i}`, theme)),
    )
    const pairs = selectDailyPracticePairs(
      cityWords,
      progressFor(cityWords),
      40,
      undefined,
      NOW,
      false,
    )
    expect(new Set(pairs.map((p) => p.word.id)).size).toBe(DAILY_ACTIVE_WORDS)
  })
})

describe('Daily Practice introductions', () => {
  it('meets a high-frequency word even when the session is full of reviews', () => {
    // A learner who practises rather than exploring would otherwise only meet
    // these when a session happened to run short of review work.
    const seenWords = Array.from({ length: 12 }, (_, i) => word(`airport.n${i}`))
    const items = buildDailyPracticeSession(
      {
        seenWords,
        unseenWords: [common('essentials.men'), word('airport.spare')],
        phrases: [],
        progress: progressFor(seenWords),
        phraseProgress: new Map(),
      },
      20,
      NOW,
    )
    const introduced = items.filter((i) => i.kind === 'word' && i.isNew)
    expect(introduced).toHaveLength(1)
    expect(introduced[0].kind === 'word' && introduced[0].word.id).toBe('essentials.men')
  })

  it('gives the slot back to review work once they have all been met', () => {
    const seenWords = Array.from({ length: 12 }, (_, i) => word(`airport.n${i}`))
    const items = buildDailyPracticeSession(
      {
        seenWords,
        unseenWords: [],
        phrases: [],
        progress: progressFor(seenWords),
        phraseProgress: new Map(),
      },
      20,
      NOW,
    )
    expect(items.filter((i) => i.kind === 'word' && i.isNew)).toHaveLength(0)
    expect(items.filter((i) => i.kind === 'word').length).toBe(20)
  })
})
