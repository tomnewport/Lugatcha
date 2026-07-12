import { describe, it, expect } from 'vitest'
import {
  buildDailyPracticeSession,
  buildPracticeSessionQuestions,
  intersperse,
  PHRASES_PER_PRACTICE,
  NEW_WORDS_PER_PRACTICE,
  NEW_PHRASES_PER_PRACTICE,
  type DailyPracticeSessionData,
} from '@/exercises/practice'
import type { PracticePhrase } from '@/exercises/phrases'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { PhraseProgress, Word, WordProgress } from '@/db/types'
import type { ReviewSchedule } from '@/exercises/spacedRepetition'

const NOW = 1_700_000_000_000
const DAY = 24 * 60 * 60 * 1000

const word = (id: string, theme = 'airport', level: 1 | 2 | 3 = 1): Word => ({
  id,
  uzbek: id,
  english: id,
  theme,
  level,
})

const phrase = (key: string, theme = 'airport'): PracticePhrase => ({
  key,
  uzbek: key,
  english: `en ${key}`,
  tokens: key.split(' '),
  theme,
})

const schedule = (dueAt: number): ReviewSchedule => ({
  reps: 1,
  intervalDays: 1,
  ease: 2.5,
  dueAt,
  lastReviewedAt: dueAt - DAY,
})

const seenWordProgress = (): WordProgress => ({ wordId: 'w', lastResults: [], seenAt: 1 })
const learnedWordProgress = (due: boolean): WordProgress => ({
  wordId: 'w',
  lastResults: [],
  seenAt: 1,
  testPassed: [...TEST_QUESTION_TYPES],
  learnedAt: 1,
  review: schedule(due ? NOW - DAY : NOW + 30 * DAY),
})
const phraseProgress = (due: boolean): PhraseProgress => ({
  phraseKey: 'p',
  seenAt: 1,
  review: schedule(due ? NOW - DAY : NOW + 30 * DAY),
})

function data(partial: Partial<DailyPracticeSessionData>): DailyPracticeSessionData {
  return {
    seenWords: [],
    unseenWords: [],
    phrases: [],
    progress: new Map(),
    phraseProgress: new Map(),
    ...partial,
  }
}

describe('buildDailyPracticeSession', () => {
  it('folds due phrases into a word session, capped so words stay the backbone', () => {
    // Plenty of word work: 8 unlearned seen words (4 weak skills each).
    const words = Array.from({ length: 8 }, (_, i) => word(`w${i}`))
    const progress = new Map(words.map((w) => [w.id, seenWordProgress()]))
    // More due phrases than the cap allows.
    const phrases = Array.from({ length: 9 }, (_, i) => phrase(`p${i}`))
    const phraseProg = new Map(phrases.map((p) => [p.key, phraseProgress(true)]))

    const items = buildDailyPracticeSession(
      data({ seenWords: words, phrases, progress, phraseProgress: phraseProg }),
      20,
      NOW,
    )
    expect(items).toHaveLength(20)
    const phraseItems = items.filter((i) => i.kind === 'phrase')
    expect(phraseItems).toHaveLength(PHRASES_PER_PRACTICE)
    expect(items.filter((i) => i.kind === 'word')).toHaveLength(20 - PHRASES_PER_PRACTICE)
    // Reviews, not introductions.
    expect(items.every((i) => !i.isNew)).toBe(true)
  })

  it('leaves not-yet-due phrases alone', () => {
    const words = Array.from({ length: 8 }, (_, i) => word(`w${i}`))
    const progress = new Map(words.map((w) => [w.id, seenWordProgress()]))
    const phrases = [phrase('p0'), phrase('p1')]
    const phraseProg = new Map(phrases.map((p) => [p.key, phraseProgress(false)]))

    const items = buildDailyPracticeSession(
      data({ seenWords: words, phrases, progress, phraseProgress: phraseProg }),
      20,
      NOW,
    )
    expect(items.every((i) => i.kind === 'word')).toBe(true)
  })

  it('never introduces new material while reviews fill the session', () => {
    const words = Array.from({ length: 8 }, (_, i) => word(`w${i}`))
    const progress = new Map(words.map((w) => [w.id, seenWordProgress()]))
    const unseen = Array.from({ length: 5 }, (_, i) => word(`u${i}`))

    const items = buildDailyPracticeSession(
      data({ seenWords: words, unseenWords: unseen, progress }),
      20,
      NOW,
    )
    expect(items.some((i) => i.isNew)).toBe(false)
  })

  it('introduces new words and phrases when the learner is on top of reviews', () => {
    // Learning going well: everything learned, nothing due.
    const words = [word('w0'), word('w1')]
    const progress = new Map(words.map((w) => [w.id, learnedWordProgress(false)]))
    const unseen = Array.from({ length: 6 }, (_, i) => word(`u${i}`))
    const phrases = Array.from({ length: 6 }, (_, i) => phrase(`p${i}`))

    const items = buildDailyPracticeSession(
      data({ seenWords: words, unseenWords: unseen, phrases, progress }),
      20,
      NOW,
    )
    const newWords = items.filter((i) => i.kind === 'word' && i.isNew)
    const newPhrases = items.filter((i) => i.kind === 'phrase' && i.isNew)
    expect(newWords).toHaveLength(NEW_WORDS_PER_PRACTICE)
    expect(newPhrases).toHaveLength(NEW_PHRASES_PER_PRACTICE)
    // New words open with the gentlest skill after their meet card.
    for (const i of newWords) {
      if (i.kind === 'word') expect(i.type).toBe('read-choice')
    }
    // The rest of the session still tops up with retention work.
    expect(items.length).toBeGreaterThan(newWords.length + newPhrases.length)
  })

  it('prefers essential words from started areas when introducing', () => {
    const words = [word('w0', 'airport')]
    const progress = new Map([['w0', learnedWordProgress(false)]])
    const unseen = [
      word('far', 'museum', 1),
      word('started-nice', 'airport', 3),
      word('started-essential', 'airport', 1),
    ]
    const items = buildDailyPracticeSession(
      data({ seenWords: words, unseenWords: unseen, progress }),
      20,
      NOW,
    )
    const introduced = items.filter((i) => i.kind === 'word' && i.isNew).map((i) => i.word.id)
    expect(introduced.slice(0, 2)).toEqual(['started-essential', 'started-nice'])
  })

  it('only introduces phrases whose area the learner has started', () => {
    const words = [word('w0', 'airport')]
    const progress = new Map([['w0', learnedWordProgress(false)]])
    const phrases = [phrase('known area', 'airport'), phrase('strange area', 'museum')]
    const items = buildDailyPracticeSession(
      data({ seenWords: words, phrases, progress }),
      20,
      NOW,
    )
    const introduced = items.filter((i) => i.kind === 'phrase' && i.isNew)
    expect(introduced.map((i) => (i.kind === 'phrase' ? i.phrase.key : ''))).toEqual(['known area'])
  })

  it('falls back to retest filler once nothing new remains', () => {
    const words = [word('w0'), word('w1'), word('w2')]
    const progress = new Map(words.map((w) => [w.id, learnedWordProgress(false)]))
    const items = buildDailyPracticeSession(data({ seenWords: words, progress }), 12, NOW)
    expect(items.length).toBe(12)
    expect(items.every((i) => i.kind === 'word' && !i.isNew)).toBe(true)
  })

  it('spreads phrases through the session instead of clustering them at the end', () => {
    const words = Array.from({ length: 8 }, (_, i) => word(`w${i}`))
    const progress = new Map(words.map((w) => [w.id, seenWordProgress()]))
    const phrases = Array.from({ length: 5 }, (_, i) => phrase(`p${i}`))
    const phraseProg = new Map(phrases.map((p) => [p.key, phraseProgress(true)]))

    const items = buildDailyPracticeSession(
      data({ seenWords: words, phrases, progress, phraseProgress: phraseProg }),
      20,
      NOW,
    )
    const positions = items.flatMap((i, idx) => (i.kind === 'phrase' ? [idx] : []))
    expect(positions[0]).toBeLessThan(items.length - PHRASES_PER_PRACTICE)
  })
})

describe('intersperse', () => {
  it('spreads extras roughly evenly, preserving both orders', () => {
    const out = intersperse(['a', 'b', 'c', 'd', 'e', 'f'], ['X', 'Y'])
    expect(out).toHaveLength(8)
    expect(out.filter((t) => t === 'X' || t === 'Y')).toEqual(['X', 'Y'])
    expect(out.filter((t) => !'XY'.includes(t))).toEqual(['a', 'b', 'c', 'd', 'e', 'f'])
    expect(out.indexOf('X')).toBeGreaterThan(0)
  })
})

describe('buildPracticeSessionQuestions', () => {
  it('gives word questions option banks and phrase questions the decoy pool', () => {
    const allWords = Array.from({ length: 50 }, (_, i) => word(`w${i}`))
    const pool = [phrase('p0'), phrase('p1')]
    const questions = buildPracticeSessionQuestions(
      [
        { kind: 'word', word: allWords[0], type: 'read-choice' },
        { kind: 'word', word: allWords[1], type: 'type' },
        { kind: 'phrase', phrase: pool[0], mode: 'english' },
      ],
      allWords,
      pool,
    )
    expect(questions[0].kind).toBe('word')
    if (questions[0].kind === 'word') expect(questions[0].options).toHaveLength(40)
    if (questions[1].kind === 'word') expect(questions[1].options).toEqual([])
    if (questions[2].kind === 'phrase') expect(questions[2].pool).toBe(pool)
  })
})
