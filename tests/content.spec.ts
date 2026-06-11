import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { tokenize, normalizeToken } from '@/exercises/validate'
import type { Word, Story, Roleplay } from '@/db/types'

const DATA = join(__dirname, '..', 'public', 'data')
const read = <T>(p: string): T => JSON.parse(readFileSync(join(DATA, p), 'utf8'))

interface Manifest {
  words: string[]
  stories: string[]
  roleplay: string[]
}
const manifest = read<Manifest>('manifest.json')

const allWords: Word[] = manifest.words.flatMap((n) => read<Word[]>(`words/${n}.json`))
const allStories: Story[] = manifest.stories.flatMap((n) => read<Story[]>(`stories/${n}.json`))
const allRoleplays: Roleplay[] = manifest.roleplay.flatMap((n) => read<Roleplay[]>(`roleplay/${n}.json`))

/** Surface forms the storytime tooltip can resolve: vocab + inflections + this story's glossary. */
function glossaryLookup(story: Story): Set<string> {
  const lookup = new Set<string>()
  for (const w of allWords) {
    lookup.add(normalizeToken(w.uzbek))
    for (const inf of w.inflections ?? []) lookup.add(normalizeToken(inf))
  }
  for (const key of Object.keys(story.glossary ?? {})) lookup.add(normalizeToken(key))
  return lookup
}

describe('vocabulary', () => {
  it('has unique ids and a valid level on every word', () => {
    const ids = new Set<string>()
    for (const w of allWords) {
      expect(ids.has(w.id), `duplicate word id ${w.id}`).toBe(false)
      ids.add(w.id)
      expect([1, 2, 3], `${w.id} level`).toContain(w.level)
      expect(w.theme.length).toBeGreaterThan(0)
    }
  })

  it('covers every manifest theme with at least 10 words', () => {
    for (const theme of manifest.words) {
      const count = allWords.filter((w) => w.theme === theme).length
      expect(count, `theme ${theme} word count`).toBeGreaterThanOrEqual(10)
    }
  })
})

describe('stories', () => {
  it.each(allStories.map((s) => [s.id, s] as const))('%s glosses every word', (_id, story) => {
    expect(story.sentences.length).toBeGreaterThanOrEqual(4)

    // The tooltip is per-word, so multi-token glossary keys can never match
    for (const key of Object.keys(story.glossary ?? {})) {
      expect(key.trim().split(/\s+/).length, `${story.id}: multi-word glossary key "${key}"`).toBe(1)
    }

    const lookup = glossaryLookup(story)
    for (const sentence of story.sentences) {
      for (const token of tokenize(sentence.uzbek)) {
        const norm = normalizeToken(token)
        const resolved =
          lookup.has(norm) ||
          [...lookup].some((stem) => stem.length >= 3 && norm.startsWith(stem))
        expect(resolved, `${story.id}: no gloss for "${token}"`).toBe(true)
      }
    }
  })
})

describe('roleplay scenarios', () => {
  it.each(allRoleplays.map((r) => [r.id, r] as const))('%s is well-formed', (_id, rp) => {
    expect(rp.variants.length, `${rp.id} needs a base + alternatives`).toBeGreaterThanOrEqual(2)
    expect(rp.scenario.length).toBeGreaterThan(0)

    const ids = new Set<string>()
    for (const variant of rp.variants) {
      expect(ids.has(variant.id), `${rp.id}: duplicate variant ${variant.id}`).toBe(false)
      ids.add(variant.id)

      const userTurns = variant.turns.filter((t) => t.speaker === 'user')
      expect(userTurns.length, `${rp.id}/${variant.id} has no user turns`).toBeGreaterThan(0)

      for (const turn of userTurns) {
        // Pre-tokenized answer must match what the validator will derive
        if (turn.tokens) {
          expect(turn.tokens, `${rp.id}/${variant.id}: tokens drift from uzbek`).toEqual(
            tokenize(turn.uzbek),
          )
        }
      }
    }
  })

  it('gives most scenarios the requested handful of variants', () => {
    // The brief asks for a base + ~5 complications; allow a soft floor of 4
    const slim = allRoleplays.filter((r) => r.variants.length < 4).map((r) => r.id)
    expect(slim, `scenarios with few variants: ${slim.join(', ')}`).toHaveLength(0)
  })
})
