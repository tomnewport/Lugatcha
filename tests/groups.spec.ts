import { describe, it, expect } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import type { VocabGroup, VocabGroupMeta, Word, TravelPlace } from '@/db/types'

const DATA = join(__dirname, '..', 'public', 'data')
const GROUPS_DIR = join(DATA, 'groups')
const read = <T>(p: string): T => JSON.parse(readFileSync(join(DATA, p), 'utf8'))

const index: VocabGroupMeta[] = read('groups/index.json')
const groups: VocabGroup[] = index.map((m) => read(`groups/${m.id}.json`))

interface Manifest {
  words: string[]
}
const manifest = read<Manifest>('manifest.json')
const manifestWords: Word[] = manifest.words.flatMap((n) => read<Word[]>(`words/${n}.json`))
const travelWords: Word[] = read<TravelPlace[]>('travel.json').flatMap((p) => p.words ?? [])

describe('vocab group data integrity', () => {
  it('index covers every group file exactly once', () => {
    const files = readdirSync(GROUPS_DIR).filter((f) => f !== 'index.json')
    expect(new Set(index.map((m) => `${m.id}.json`))).toEqual(new Set(files))
    expect(new Set(index.map((m) => m.id)).size).toBe(index.length)
    expect(new Set(index.map((m) => m.order)).size).toBe(index.length)
  })

  it.each(groups.map((g) => [g.id, g] as const))('%s is well-formed', (_id, group) => {
    expect(group.article.length).toBeGreaterThan(0)
    for (const section of group.article) {
      expect(section.body.length).toBeGreaterThan(0)
    }
    expect(group.words.length).toBeGreaterThanOrEqual(10)
    for (const w of group.words) {
      expect([1, 2, 3], `${w.id} level`).toContain(w.level)
      // Group words are ordinary core vocab tagged with the group id.
      expect(w.theme, `${w.id} theme`).toBe('core')
      expect(w.group, `${w.id} group`).toBe(group.id)
      if (w.swatch) expect(w.swatch).toMatch(/^#[0-9a-fA-F]{6}$/)
    }
  })

  it('only the numbers group declares the counting quiz', () => {
    const withQuiz = groups.filter((g) => g.quiz === 'counting').map((g) => g.id)
    expect(withQuiz).toEqual(['numbers'])
  })

  it('group word ids are globally unique', () => {
    const groupIds = groups.flatMap((g) => g.words.map((w) => w.id))
    expect(new Set(groupIds).size, 'duplicate ids within groups').toBe(groupIds.length)

    const otherIds = new Set([...manifestWords, ...travelWords].map((w) => w.id))
    for (const id of groupIds) {
      expect(otherIds.has(id), `group word ${id} collides with existing vocab`).toBe(false)
    }
  })
})
