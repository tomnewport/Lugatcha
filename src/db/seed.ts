import type { LugatchaDB } from './LugatchaDB'
import type { Word, Story, Roleplay, TravelPlace, VocabGroup, VocabGroupMeta } from './types'

interface DataManifest {
  words: string[]
  stories: string[]
  roleplay: string[]
}

const base = import.meta.env.BASE_URL

async function fetchData<T>(path: string): Promise<T> {
  const res = await fetch(`${base}data/${path}`)
  if (!res.ok) throw new Error(`Failed to fetch data file: ${path} (${res.status})`)
  return res.json() as Promise<T>
}

export async function seedDatabase(db: LugatchaDB): Promise<void> {
  const manifest = await fetchData<DataManifest>('manifest.json')

  // Each stories/roleplay file holds every item for one theme. Travel-place
  // vocab lives inline in travel.json (a few bespoke words per place) and seeds
  // into the same words table under each place's theme.
  const [wordArrays, storyArrays, roleplayArrays, travelPlaces, groupWords] = await Promise.all([
    Promise.all(manifest.words.map((name) => fetchData<Word[]>(`words/${name}.json`))),
    Promise.all(manifest.stories.map((name) => fetchData<Story[]>(`stories/${name}.json`))),
    Promise.all(manifest.roleplay.map((name) => fetchData<Roleplay[]>(`roleplay/${name}.json`))),
    fetchTravelWords(),
    fetchGroupWords(),
  ])

  await Promise.all([
    db.words.bulkPut([...wordArrays.flat(), ...travelPlaces, ...groupWords]),
    db.stories.bulkPut(storyArrays.flat()),
    db.roleplay.bulkPut(roleplayArrays.flat()),
  ])
}

/**
 * Vocab-group words (issue #62). Each group lists its words inline; they seed
 * into the same `words` table as ordinary `core` vocab, tagged with `group` so
 * the School can gather them. Tolerant of the files being absent (e.g. tests).
 */
async function fetchGroupWords(): Promise<Word[]> {
  try {
    const index = await fetchData<VocabGroupMeta[]>('groups/index.json')
    if (!Array.isArray(index)) return []
    const groups = await Promise.all(
      index.map((meta) => fetchData<VocabGroup>(`groups/${meta.id}.json`)),
    )
    return groups.flatMap((g) => g.words ?? [])
  } catch {
    return []
  }
}

/** Travel-place vocab, tolerant of the file being absent (e.g. in tests). */
async function fetchTravelWords(): Promise<Word[]> {
  try {
    const places = await fetchData<TravelPlace[]>('travel.json')
    return Array.isArray(places) ? places.flatMap((p) => p.words ?? []) : []
  } catch {
    return []
  }
}

// Bump when shipped data files change: bulkPut overwrites by id, so
// re-seeding refreshes content without touching progress tables.
// v6: added Russian translations (russian/ru fields) across all content.
// v7: added the Welcome Center onboarding vocabulary.
// v8: added basic Welcome Center stories and roleplay.
export const CONTENT_VERSION = 8
const CONTENT_VERSION_KEY = 'lugatcha.contentVersion'

function storedContentVersion(): string | null {
  try {
    return localStorage.getItem(CONTENT_VERSION_KEY)
  } catch {
    return null
  }
}

export async function ensureSeeded(db: LugatchaDB): Promise<void> {
  const count = await db.words.count()
  if (count > 0 && storedContentVersion() === String(CONTENT_VERSION)) return
  await seedDatabase(db)
  try {
    localStorage.setItem(CONTENT_VERSION_KEY, String(CONTENT_VERSION))
  } catch {
    // private mode etc. — worst case we re-seed next visit
  }
}
