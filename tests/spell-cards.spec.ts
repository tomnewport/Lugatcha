import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import { recordTestResult } from '@/db/progress'
import { needsSpellCard, withSpellCards, SPELL_CARD_GAP } from '@/exercises/spellCards'
import type { PracticeItem } from '@/exercises/practice'
import { TEST_QUESTION_TYPES } from '@/db/types'
import type { Word, WordProgress, TestQuestionType } from '@/db/types'

const word = (id: string): Word => ({ id, uzbek: id, english: id, theme: 'airport', level: 1 })

const item = (id: string, type: TestQuestionType): PracticeItem => ({
  kind: 'word',
  word: word(id),
  type,
})

/** Progress rows keyed by word id; anything absent is a word never spelled. */
const progressOf = (rows: Record<string, Partial<WordProgress>>) =>
  new Map<string, WordProgress | undefined>(
    Object.entries(rows).map(([wordId, p]) => [wordId, { wordId, lastResults: [], ...p }]),
  )

const spelled = { testPassed: [...TEST_QUESTION_TYPES] }

describe('needsSpellCard', () => {
  it('requires a card for a word never met or never spelled perfectly', () => {
    expect(needsSpellCard(undefined)).toBe(true)
    expect(needsSpellCard({ wordId: 'w', lastResults: [], testPassed: ['read-choice'] })).toBe(true)
    expect(needsSpellCard({ wordId: 'w', lastResults: [], spellMastery: 0.8 })).toBe(true)
  })

  it('drops the card once the word has been spelled with no tips', () => {
    expect(needsSpellCard({ wordId: 'w', lastResults: [], testPassed: ['type'] })).toBe(false)
  })

  it('brings the card back after a failed spelling attempt', () => {
    expect(
      needsSpellCard({
        wordId: 'w',
        lastResults: [],
        testPassed: ['type'],
        lastSpellFailed: true,
      }),
    ).toBe(true)
  })
})

describe('withSpellCards', () => {
  const cardIndex = (items: PracticeItem[], id: string) =>
    items.findIndex((i) => i.kind === 'spell-card' && i.word.id === id)
  const questionIndex = (items: PracticeItem[], id: string) =>
    items.findIndex((i) => i.kind === 'word' && i.word.id === id && i.type === 'type')
  const questionsBetween = (items: PracticeItem[], from: number, to: number) =>
    items.slice(from + 1, to).filter((i) => i.kind !== 'spell-card').length

  it('leaves a session with no unspelled words untouched', () => {
    const items = [item('a', 'type'), item('b', 'read-choice'), item('c', 'type')]
    expect(withSpellCards(items, progressOf({ a: spelled, c: spelled }))).toEqual(items)
  })

  it('cards a spelling question and spaces it three questions back', () => {
    const items = [
      item('a', 'read-choice'),
      item('b', 'read-choice'),
      item('c', 'listen-choice'),
      item('d', 'read-choice'),
      item('e', 'type'),
    ]
    const out = withSpellCards(items, progressOf({}))
    expect(out).toHaveLength(items.length + 1)
    const card = cardIndex(out, 'e')
    const question = questionIndex(out, 'e')
    expect(card).toBeGreaterThanOrEqual(0)
    expect(questionsBetween(out, card, question)).toBe(SPELL_CARD_GAP)
    // The card is not a question, so nothing else moved.
    expect(out.filter((i) => i.kind !== 'spell-card')).toEqual(items)
  })

  it('spaces every card that needs one, cards not counting as filler', () => {
    const items = [
      item('a', 'read-choice'),
      item('b', 'read-choice'),
      item('c', 'listen-choice'),
      item('d', 'type'),
      item('e', 'type'),
    ]
    const out = withSpellCards(items, progressOf({}))
    for (const id of ['d', 'e']) {
      expect(questionsBetween(out, cardIndex(out, id), questionIndex(out, id))).toBe(SPELL_CARD_GAP)
    }
    expect(out.every((i) => i.kind !== 'word' || !i.noCredit)).toBe(true)
  })

  it('pushes a spelling question out of the opening slots to make room', () => {
    const items = [
      item('a', 'type'),
      item('b', 'read-choice'),
      item('c', 'read-choice'),
      item('d', 'listen-choice'),
    ]
    const out = withSpellCards(items, progressOf({}))
    expect(questionsBetween(out, cardIndex(out, 'a'), questionIndex(out, 'a'))).toBe(SPELL_CARD_GAP)
    expect(out.every((i) => i.kind !== 'word' || !i.noCredit)).toBe(true)
  })

  it('still shows the card when the session is too short to space it, for no credit', () => {
    const items = [item('a', 'type'), item('b', 'read-choice')]
    const out = withSpellCards(items, progressOf({}))
    expect(out[0].kind).toBe('spell-card')
    const question = out.find((i) => i.kind === 'word' && i.type === 'type')
    expect(question?.kind === 'word' && question.noCredit).toBe(true)
  })

  it('ignores non-spelling questions and phrases', () => {
    const items: PracticeItem[] = [
      item('a', 'read-choice'),
      { kind: 'phrase', phrase: { key: 'p', uzbek: 'p', english: 'p', tokens: ['p'], theme: 'airport' }, mode: 'english' },
    ]
    expect(withSpellCards(items, progressOf({}))).toEqual(items)
  })
})

describe('recordTestResult spelling history', () => {
  let db: LugatchaDB
  const emptyManifest = { words: [], stories: [], roleplay: [] }

  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      async () =>
        ({ ok: true, status: 200, json: async () => emptyManifest }) as Response,
    )
    db = new LugatchaDB()
  })

  afterEach(async () => {
    await db.delete()
    vi.unstubAllGlobals()
  })

  it('remembers a given-up spelling and forgets it after a real attempt', async () => {
    await recordTestResult(db, 'w', 'type', 0)
    expect((await db.wordProgress.get('w'))?.lastSpellFailed).toBe(true)
    expect(needsSpellCard(await db.wordProgress.get('w'))).toBe(true)

    await recordTestResult(db, 'w', 'type', 1)
    const p = await db.wordProgress.get('w')
    expect(p?.lastSpellFailed).toBe(false)
    expect(needsSpellCard(p)).toBe(false)
  })

  it('leaves the spelling history alone when another skill is answered', async () => {
    await recordTestResult(db, 'w', 'type', 0)
    await recordTestResult(db, 'w', 'read-choice', true)
    expect((await db.wordProgress.get('w'))?.lastSpellFailed).toBe(true)
  })

  it('banks nothing from an uncredited answer but still schedules review', async () => {
    await recordTestResult(db, 'w', 'type', 1, false)
    const p = await db.wordProgress.get('w')
    expect(p?.testPassed).toEqual([])
    expect(p?.spellMastery).toBe(0)
    expect(p?.review).toBeDefined()
    expect(needsSpellCard(p)).toBe(true)
  })

  it('never unlearns a word on an uncredited miss', async () => {
    for (const t of TEST_QUESTION_TYPES) await recordTestResult(db, 'w', t, true)
    await recordTestResult(db, 'w', 'type', 0, false)
    await recordTestResult(db, 'w', 'type', 0, false)
    const p = await db.wordProgress.get('w')
    expect(p?.testPassed).toEqual([...TEST_QUESTION_TYPES])
    // The failure is still remembered, so the card comes back next time.
    expect(needsSpellCard(p)).toBe(true)
  })
})
