import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import { recordTestResult } from '@/db/progress'
import {
  isWordLearned,
  isWordPartiallyLearned,
  pickQuestionType,
  selectTestWords,
  selectDailyPracticePairs,
  buildOptionBank,
  buildTest,
  typingTarget,
  foldTyping,
} from '@/exercises/test'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { Word, WordProgress } from '@/db/types'

function word(id: string, english = id): Word {
  return { id, uzbek: id, english, theme: 'airport', level: 1 }
}

function progress(passed: string[], extra: Partial<WordProgress> = {}): WordProgress {
  return { wordId: 'w', lastResults: [], seenAt: 1, testPassed: passed as never, ...extra }
}

describe('learned classification', () => {
  it('treats all three passed types as learned', () => {
    expect(isWordLearned(progress([...TEST_QUESTION_TYPES]))).toBe(true)
    expect(isWordLearned(progress(['type']))).toBe(false)
    expect(isWordLearned(undefined)).toBe(false)
  })

  it('treats one or two passed types as partial', () => {
    expect(isWordPartiallyLearned(progress(['type']))).toBe(true)
    expect(isWordPartiallyLearned(progress(['type', 'read-choice']))).toBe(true)
    expect(isWordPartiallyLearned(progress([]))).toBe(false)
    expect(isWordPartiallyLearned(progress([...TEST_QUESTION_TYPES]))).toBe(false)
  })
})

describe('pickQuestionType', () => {
  it('only offers types the word has not passed yet', () => {
    const p = progress(['type', 'read-choice', 'read-cyrillic-choice'])
    for (let i = 0; i < 20; i++) {
      expect(pickQuestionType(p, Math.random)).toBe('listen-choice')
    }
  })

  it('offers any type once the word is fully learned (re-test)', () => {
    const p = progress([...TEST_QUESTION_TYPES])
    const seen = new Set<string>()
    for (let i = 0; i < 60; i++) seen.add(pickQuestionType(p, Math.random))
    expect(seen.size).toBeGreaterThan(1)
  })
})

describe('selectTestWords', () => {
  const prog = new Map<string, WordProgress | undefined>()
  const partial = word('partial')
  const fresh1 = word('fresh1')
  const fresh2 = word('fresh2')
  const fresh3 = word('fresh3')
  const learnedA = word('learnedA')
  const learnedB = word('learnedB')
  prog.set('partial', progress(['type']))
  prog.set('learnedA', progress([...TEST_QUESTION_TYPES]))
  prog.set('learnedB', progress([...TEST_QUESTION_TYPES]))

  it('mixes three new words with two learned re-tests', () => {
    const candidates = [partial, fresh1, fresh2, fresh3, learnedA, learnedB]
    const learnedPool = [learnedA, learnedB]
    const picked = selectTestWords(candidates, learnedPool, prog)
    expect(picked).toHaveLength(5)
    const learnedPicked = picked.filter((w) => isWordLearned(prog.get(w.id)))
    expect(learnedPicked).toHaveLength(2)
    // Partially-learned word is always prioritised into the new slots.
    expect(picked.map((w) => w.id)).toContain('partial')
  })

  it('fills entirely with new words when nothing is learned yet', () => {
    const candidates = [fresh1, fresh2, fresh3, word('fresh4'), word('fresh5')]
    const picked = selectTestWords(candidates, [], new Map())
    expect(picked).toHaveLength(5)
    expect(picked.every(() => !isWordLearned(undefined))).toBe(true)
  })
})

describe('selectDailyPracticePairs', () => {
  const themed = (id: string, theme: string): Word => ({ id, uzbek: id, english: id, theme, level: 1 })
  const learnedProgress = () => progress([...TEST_QUESTION_TYPES], { learnedAt: 1 })

  it('drills only un-passed skills, never ones already in hand', () => {
    const prog = new Map<string, WordProgress | undefined>()
    const words = Array.from({ length: 6 }, (_, i) => themed(`w${i}`, 'airport'))
    prog.set('w0', progress(['type', 'read-choice'])) // two skills already passed
    const pairs = selectDailyPracticePairs(words, prog, 20)
    expect(pairs.length).toBeGreaterThan(0)
    for (const p of pairs) {
      expect(prog.get(p.word.id)?.testPassed ?? []).not.toContain(p.type)
    }
  })

  it('keeps at most seven words per area in the active batch', () => {
    const prog = new Map<string, WordProgress | undefined>()
    const words = Array.from({ length: 12 }, (_, i) => themed(`a${i}`, 'airport'))
    const pairs = selectDailyPracticePairs(words, prog, 100)
    expect(new Set(pairs.map((p) => p.word.id)).size).toBeLessThanOrEqual(7)
  })

  it('serves the requested number of questions when there is enough to drill', () => {
    const prog = new Map<string, WordProgress | undefined>()
    // 10 areas × 1 unlearned word × 4 weak skills = 40 candidate pairs.
    const words = Array.from({ length: 10 }, (_, i) => themed(`a${i}`, `t${i}`))
    expect(selectDailyPracticePairs(words, prog, 20)).toHaveLength(20)
  })

  it('leaves learned words out while weak skills remain', () => {
    const prog = new Map<string, WordProgress | undefined>()
    const fresh = Array.from({ length: 6 }, (_, i) => themed(`f${i}`, `t${i}`))
    const done = themed('done', 'airport')
    prog.set('done', learnedProgress())
    const pairs = selectDailyPracticePairs([...fresh, done], prog, 20)
    expect(pairs.some((p) => p.word.id === 'done')).toBe(false)
  })

  it('falls back to learned words for retention once nothing is left to learn', () => {
    const prog = new Map<string, WordProgress | undefined>()
    const learned = Array.from({ length: 3 }, (_, i) => themed(`L${i}`, 'airport'))
    for (const w of learned) prog.set(w.id, learnedProgress())
    const pairs = selectDailyPracticePairs(learned, prog, 20)
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.every((p) => isWordLearned(prog.get(p.word.id)))).toBe(true)
  })

  it('produces no duplicate (word, skill) pairs', () => {
    const prog = new Map<string, WordProgress | undefined>()
    const words = Array.from({ length: 8 }, (_, i) => themed(`d${i}`, `t${i}`))
    const pairs = selectDailyPracticePairs(words, prog, 20)
    const keys = pairs.map((p) => `${p.word.id}:${p.type}`)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('interleaves words so retention top-up never clusters one word back-to-back', () => {
    // A pure-retention session: every word learned, so the whole queue comes
    // from the top-up path. With enough words to spread across, consecutive
    // questions should hop between words rather than drill all four skills of
    // one word in a row.
    const prog = new Map<string, WordProgress | undefined>()
    const learned = Array.from({ length: 8 }, (_, i) => themed(`L${i}`, `t${i}`))
    for (const w of learned) prog.set(w.id, learnedProgress())
    const pairs = selectDailyPracticePairs(learned, prog, 20)
    expect(pairs).toHaveLength(20)
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i].word.id).not.toBe(pairs[i - 1].word.id)
    }
  })

  it('interleaves the active batch across small vocabularies', () => {
    // One area, three unlearned words: the drain plus batch re-ask path still
    // must not serve the same word twice in a row while others are available.
    const prog = new Map<string, WordProgress | undefined>()
    const words = Array.from({ length: 3 }, (_, i) => themed(`b${i}`, 'airport'))
    const pairs = selectDailyPracticePairs(words, prog, 12)
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i].word.id).not.toBe(pairs[i - 1].word.id)
    }
  })
})

describe('buildOptionBank', () => {
  const allWords = Array.from({ length: 60 }, (_, i) => word(`w${i}`, `meaning ${i}`))

  it('returns a fixed-size searchable bank that always holds the answer', () => {
    const correct = allWords[3]
    const bank = buildOptionBank(correct, allWords)
    expect(bank).toHaveLength(40)
    expect(bank).toContain(correct)
    expect(new Set(bank.map((w) => w.english)).size).toBe(bank.length) // no duplicate meanings
  })
})

describe('buildTest', () => {
  it('builds option banks for choice questions and none for typing', () => {
    const allWords = Array.from({ length: 60 }, (_, i) => word(`w${i}`, `m${i}`))
    const words = [word('w0', 'm0')]
    const prog = new Map<string, WordProgress | undefined>([
      ['w0', progress(['listen-choice', 'read-choice', 'read-cyrillic-choice'])], // forces 'type'
    ])
    const [q] = buildTest(words, prog, allWords)
    expect(q.type).toBe('type')
    expect(q.options).toEqual([])
  })
})

describe('typing helpers', () => {
  it('strips punctuation but keeps apostrophes and spaces', () => {
    expect(typingTarget('Rahmat!')).toBe('Rahmat')
    expect(typingTarget('  jo‘nash. ')).toBe('jo‘nash')
    expect(typingTarget('xayrli kun')).toBe('xayrli kun')
  })

  it('folds case and apostrophe variants together', () => {
    expect(foldTyping('Joʻnash')).toBe(foldTyping("jo'nash"))
  })
})

describe('recordTestResult', () => {
  let db: LugatchaDB
  const emptyManifest = { words: [], stories: [], roleplay: [] }
  beforeEach(() => {
    vi.stubGlobal('fetch', async () => ({
      ok: true,
      status: 200,
      json: async () => emptyManifest,
    }) as Response)
    db = new LugatchaDB()
  })
  afterEach(async () => {
    await db.delete()
    vi.unstubAllGlobals()
  })

  it('learns a word only after all four types pass', async () => {
    let r = await recordTestResult(db, 'w', 'type', true)
    expect(r.newlyLearned).toBe(false)
    r = await recordTestResult(db, 'w', 'read-choice', true)
    expect(r.newlyLearned).toBe(false)
    r = await recordTestResult(db, 'w', 'read-cyrillic-choice', true)
    expect(r.newlyLearned).toBe(false)
    r = await recordTestResult(db, 'w', 'listen-choice', true)
    expect(r.newlyLearned).toBe(true)
    const p = await db.wordProgress.get('w')
    expect(isWordLearned(p)).toBe(true)
    expect(p?.learnedAt).toBeTypeOf('number')
  })

  it('only banks the type requirement at a full spelling score', async () => {
    let p = (await recordTestResult(db, 'w', 'type', 0.7), await db.wordProgress.get('w'))
    expect(p?.testPassed).not.toContain('type')
    expect(p?.spellMastery).toBeCloseTo(0.7)
    // A weaker later attempt never lowers the recorded best.
    await recordTestResult(db, 'w', 'type', 0.4)
    p = await db.wordProgress.get('w')
    expect(p?.spellMastery).toBeCloseTo(0.7)
    // A perfect spelling banks the requirement.
    await recordTestResult(db, 'w', 'type', 1)
    p = await db.wordProgress.get('w')
    expect(p?.testPassed).toContain('type')
    expect(p?.spellMastery).toBe(1)
  })

  it('treats a partial spelling as neither pass nor fail on a learned word', async () => {
    for (const t of TEST_QUESTION_TYPES) await recordTestResult(db, 'w', t, true)
    const r = await recordTestResult(db, 'w', 'type', 0.5)
    expect(r.unlearned).toBe(false)
    expect(isWordLearned(await db.wordProgress.get('w'))).toBe(true)
  })

  it('forgives wrong answers on an un-learned word', async () => {
    await recordTestResult(db, 'w', 'type', false)
    const p = await db.wordProgress.get('w')
    expect(p?.testPassed).toEqual([])
  })

  it('unlearns a learned word after two wrong answers', async () => {
    for (const t of TEST_QUESTION_TYPES) await recordTestResult(db, 'w', t, true)
    let r = await recordTestResult(db, 'w', 'type', false)
    expect(r.unlearned).toBe(false)
    expect(isWordLearned(await db.wordProgress.get('w'))).toBe(true)
    r = await recordTestResult(db, 'w', 'type', false)
    expect(r.unlearned).toBe(true)
    const p = await db.wordProgress.get('w')
    expect(isWordLearned(p)).toBe(false)
    expect(p?.learnedAt).toBeUndefined()
  })

  it('resets the fail streak after a correct answer', async () => {
    for (const t of TEST_QUESTION_TYPES) await recordTestResult(db, 'w', t, true)
    await recordTestResult(db, 'w', 'type', false)
    await recordTestResult(db, 'w', 'type', true) // streak reset
    const r = await recordTestResult(db, 'w', 'type', false)
    expect(r.unlearned).toBe(false) // would need two in a row again
  })
})
