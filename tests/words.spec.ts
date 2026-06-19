import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { db } from '@/db'
import { pickIntroWords } from '@/exercises/words'
import { normalizeToken } from '@/exercises/validate'
import type { Word } from '@/db/types'

// Opening the singleton DB fires its 'populate' seed, which fetches data files.
// Stub fetch with an empty manifest so the seed is a clean no-op for these tests.
beforeEach(() => {
  vi.stubGlobal('fetch', async (url: string) => {
    const path = String(url).replace(/^.*\/data\//, '')
    const data = path === 'manifest.json' ? { words: [], stories: [], roleplay: [] } : undefined
    return { ok: data !== undefined, status: data ? 200 : 404, json: async () => data } as Response
  })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

/** Marks word ids seen so pickIntroWords treats them as already met. */
async function seed(words: Word[], seenIds: string[] = []): Promise<void> {
  await db.words.clear()
  await db.wordProgress.clear()
  await db.words.bulkPut(words)
  await db.wordProgress.bulkPut(seenIds.map((wordId) => ({ wordId, seenAt: 1, lastResults: [] })))
}

const w = (id: string, uzbek: string, theme: string, english = id): Word => ({
  id,
  uzbek,
  english,
  theme,
  level: 1,
})

function surfaces(words: Word[]): string[] {
  return words.map((x) => normalizeToken(x.uzbek))
}

describe('pickIntroWords', () => {
  beforeEach(async () => {
    await db.words.clear()
    await db.wordProgress.clear()
  })

  it('never returns the same Uzbek word twice', async () => {
    // A theme word and an identical core word would otherwise both appear and be
    // impossible to match (the bug: two "Salom" cards with different glosses).
    await seed([
      w('airport.hello', 'Salom', 'airport'),
      w('core.hello', 'Salom', 'core', 'Hello'),
      w('core.money', 'pul', 'core', 'money'),
    ])
    const picked = await pickIntroWords('airport', 5)
    const forms = surfaces(picked)
    expect(new Set(forms).size).toBe(forms.length)
  })

  it('keeps the Welcome Center self-contained — no core padding', async () => {
    // The Welcome Center basics overlap core (Kechirasiz, Salom, …); padding with
    // core would surface the same word twice, so it must use only its own words.
    const welcome = [
      w('welcome-center.hello', 'Salom', 'welcome-center'),
      w('welcome-center.excuse-me', 'Kechirasiz', 'welcome-center'),
      w('welcome-center.please', 'Iltimos', 'welcome-center'),
      w('welcome-center.goodbye', 'Xayr', 'welcome-center'),
      w('welcome-center.thank-you', 'Rahmat', 'welcome-center'),
    ]
    const core = [
      w('core.excuse-me', 'Kechirasiz', 'core', 'Excuse me'),
      w('core.hello', 'Salom', 'core', 'Hello'),
      w('core.money', 'pul', 'core', 'money'),
    ]
    // All welcome words seen except excuse-me, mirroring the reported session.
    await seed(
      [...welcome, ...core],
      ['welcome-center.hello', 'welcome-center.please', 'welcome-center.goodbye', 'welcome-center.thank-you'],
    )
    const picked = await pickIntroWords('welcome-center', 5)

    expect(picked.every((x) => x.theme === 'welcome-center')).toBe(true)
    const forms = surfaces(picked)
    expect(new Set(forms).size).toBe(forms.length)
  })
})
