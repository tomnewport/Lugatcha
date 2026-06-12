import type { VocabGroup, VocabGroupMeta, Word, WordProgress } from './types'
import { isWordLearned } from '@/exercises/test'

const base = import.meta.env.BASE_URL
let metaCache: VocabGroupMeta[] | null = null
const groupCache = new Map<string, VocabGroup>()

export async function loadGroupIndex(): Promise<VocabGroupMeta[]> {
  if (metaCache) return metaCache
  const res = await fetch(`${base}data/groups/index.json`)
  if (!res.ok) throw new Error(`Failed to fetch group index (${res.status})`)
  metaCache = (await res.json()) as VocabGroupMeta[]
  metaCache.sort((a, b) => a.order - b.order)
  return metaCache
}

export async function loadGroup(id: string): Promise<VocabGroup | undefined> {
  const cached = groupCache.get(id)
  if (cached) return cached
  const res = await fetch(`${base}data/groups/${id}.json`)
  if (!res.ok) return undefined
  const group = (await res.json()) as VocabGroup
  groupCache.set(id, group)
  return group
}

/** How many of a group's words are fully learned, for the School progress dots. */
export function learnedInGroup(words: Word[], progress: Map<string, WordProgress>): number {
  return words.filter((w) => isWordLearned(progress.get(w.id))).length
}
