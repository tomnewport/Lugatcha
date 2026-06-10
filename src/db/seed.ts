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

  const [wordArrays, stories, roleplayItems] = await Promise.all([
    Promise.all(manifest.words.map((name) => fetchData<Word[]>(`words/${name}.json`))),
    Promise.all(manifest.stories.map((name) => fetchData<Story>(`stories/${name}.json`))),
    Promise.all(manifest.roleplay.map((name) => fetchData<Roleplay>(`roleplay/${name}.json`))),
  ])

  await Promise.all([
    db.words.bulkPut(wordArrays.flat()),
    db.stories.bulkPut(stories),
    db.roleplay.bulkPut(roleplayItems),
  ])
}

// No-ops once words exist. Increment the DB version in LugatchaDB to force
// a re-seed after a content update.
export async function ensureSeeded(db: LugatchaDB): Promise<void> {
  const count = await db.words.count()
  if (count === 0) await seedDatabase(db)
}
