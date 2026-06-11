import type { LugatchaDB } from './LugatchaDB'
import type { Word, Story, Roleplay } from './types'

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

  // Each stories/roleplay file holds every item for one theme
  const [wordArrays, storyArrays, roleplayArrays] = await Promise.all([
    Promise.all(manifest.words.map((name) => fetchData<Word[]>(`words/${name}.json`))),
    Promise.all(manifest.stories.map((name) => fetchData<Story[]>(`stories/${name}.json`))),
    Promise.all(manifest.roleplay.map((name) => fetchData<Roleplay[]>(`roleplay/${name}.json`))),
  ])

  await Promise.all([
    db.words.bulkPut(wordArrays.flat()),
    db.stories.bulkPut(storyArrays.flat()),
    db.roleplay.bulkPut(roleplayArrays.flat()),
  ])
}

// Bump when shipped data files change: bulkPut overwrites by id, so
// re-seeding refreshes content without touching progress tables.
export const CONTENT_VERSION = 3
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
