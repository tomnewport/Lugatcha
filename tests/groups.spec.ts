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

  it('teaches every verb in the polite forms a visitor needs', () => {
    // A verb is drilled one form at a time, but each entry carries the whole
    // paradigm so the card can show it (src/components/VerbFormStrip.vue). The
    // second person is always the polite siz form — the register a visitor uses.
    const verbWords = groups.flatMap((g) => g.words).filter((w) => w.verb)
    expect(verbWords.length, 'no verb vocabulary found').toBeGreaterThan(0)

    for (const w of verbWords) {
      const verb = w.verb!
      expect(verb.infinitive, `${w.id} infinitive`).toMatch(/moq$/)
      expect(verb.gloss.length, `${w.id} gloss`).toBeGreaterThan(0)
      expect(verb.i, `${w.id} men form`).toMatch(/man$/)
      expect(verb.you, `${w.id} siz form`).toMatch(/siz$/)
      if (verb.request) expect(verb.request, `${w.id} request form`).toMatch(/ng$/)
      // The word drilled must be the form it says it is teaching.
      const taught = verb.form === 'i' ? verb.i : verb.form === 'you' ? verb.you : verb.request
      expect(taught, `${w.id} teaches ${verb.form}, which it does not carry`).toBe(w.uzbek)
    }
  })

  it('teaches both the men and the siz form of the verbs it introduces first', () => {
    // "At least the I and the you form" — every essential (level 1) verb needs
    // its counterpart taught too, so the learner can say it and hear it back.
    const verbWords = groups.flatMap((g) => g.words).filter((w) => w.verb)
    const forms = new Map<string, Set<string>>()
    for (const w of verbWords) {
      const set = forms.get(w.verb!.infinitive) ?? new Set<string>()
      set.add(w.verb!.form)
      forms.set(w.verb!.infinitive, set)
    }
    const lonely = [...forms.entries()].filter(([, set]) => set.size < 2).map(([inf]) => inf)
    expect(lonely, `verbs taught in one form only: ${lonely.join(', ')}`).toHaveLength(0)
  })

  it('flags the words that turn up in every phrase as high-frequency', () => {
    // The little words and the everyday verbs are what phrases are built from,
    // so they lead a New Words session rather than waiting behind topic nouns.
    for (const group of groups.filter((g) => g.id === 'essentials' || g.id === 'verbs')) {
      for (const w of group.words) {
        expect(w.highFrequency, `${w.id} should be high-frequency`).toBe(true)
      }
    }
    const flagged = groups.flatMap((g) => g.words).filter((w) => w.highFrequency)
    expect(flagged.length).toBeGreaterThanOrEqual(40)
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
