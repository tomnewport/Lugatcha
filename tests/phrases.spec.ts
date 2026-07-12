import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { LugatchaDB } from '@/db/LugatchaDB'
import { recordPhraseResult } from '@/db/progress'
import { phraseKey, loadPracticePhrases, PHRASE_DECOYS } from '@/exercises/phrases'
import { isDue } from '@/exercises/spacedRepetition'
import type { Roleplay } from '@/db/types'

describe('phraseKey', () => {
  it('folds case, apostrophes, punctuation, and whitespace', () => {
    expect(phraseKey('Mana pasportim.')).toBe('mana pasportim')
    expect(phraseKey('  Mana   PASPORTIM! ')).toBe('mana pasportim')
    expect(phraseKey('Toʻxtang!')).toBe(phraseKey("to'xtang"))
  })

  it('keeps distinct phrases distinct', () => {
    expect(phraseKey('Rahmat')).not.toBe(phraseKey('Rahmat, xayr'))
  })
})

const roleplay = (id: string, theme: string, turns: Roleplay['variants'][0]['turns']): Roleplay => ({
  id,
  theme,
  title: { en: id, uz: id },
  scenario: 's',
  variants: [{ id: `${id}-v1`, description: 'd', turns }],
})

describe('loadPracticePhrases / recordPhraseResult', () => {
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

  it('collects only user turns, deduplicated by folded form', async () => {
    await db.roleplay.bulkPut([
      roleplay('a', 'cafe', [
        { speaker: 'npc', uzbek: 'Assalomu alaykum', english: 'Hello' },
        { speaker: 'user', uzbek: 'Bir choy, iltimos.', english: 'One tea, please.' },
      ]),
      roleplay('b', 'choyxona', [
        { speaker: 'user', uzbek: 'bir choy iltimos', english: 'One tea, please.' },
        { speaker: 'user', uzbek: 'Rahmat!', english: 'Thanks!', tokens: ['Rahmat!'] },
      ]),
    ])
    const phrases = await loadPracticePhrases(db)
    expect(phrases.map((p) => p.key).sort()).toEqual(['bir choy iltimos', 'rahmat'])
    const tea = phrases.find((p) => p.key === 'bir choy iltimos')
    // First occurrence wins; tokens derived when the content has none.
    expect(tea?.theme).toBe('cafe')
    expect(tea?.tokens).toEqual(['Bir', 'choy,', 'iltimos.'])
    expect(phrases.find((p) => p.key === 'rahmat')?.tokens).toEqual(['Rahmat!'])
  })

  it('schedules a correct answer out and a miss straight back', async () => {
    await recordPhraseResult(db, 'bir choy iltimos', true)
    let p = await db.phraseProgress.get('bir choy iltimos')
    expect(p?.seenAt).toBeTypeOf('number')
    expect(isDue(p?.review)).toBe(false) // pushed at least a day out

    await recordPhraseResult(db, 'bir choy iltimos', false)
    p = await db.phraseProgress.get('bir choy iltimos')
    expect(p?.review?.reps).toBe(0)
    // A lapse comes back within minutes, not days.
    expect(p!.review!.dueAt - Date.now()).toBeLessThan(60 * 60 * 1000)
  })

  it('doubles the old decoy count', () => {
    expect(PHRASE_DECOYS).toBe(6)
  })
})
