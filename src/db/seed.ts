import { load } from 'js-yaml'
import type { LugatchaDB } from './LugatchaDB'
import type { Word, Story, Roleplay } from './types'

const wordFiles = import.meta.glob('../data/words/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const storyFiles = import.meta.glob('../data/stories/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

const roleplayFiles = import.meta.glob('../data/roleplay/*.yaml', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>

export async function seedDatabase(db: LugatchaDB): Promise<void> {
  const words: Word[] = Object.values(wordFiles).flatMap((raw) => load(raw) as Word[])
  const stories: Story[] = Object.values(storyFiles).map((raw) => load(raw) as Story)
  const roleplayItems: Roleplay[] = Object.values(roleplayFiles).map((raw) => load(raw) as Roleplay)

  await Promise.all([
    db.words.bulkPut(words),
    db.stories.bulkPut(stories),
    db.roleplay.bulkPut(roleplayItems),
  ])
}

// Called on app start; no-ops if data is already present.
// Increment DB version in LugatchaDB to trigger a re-seed after content updates.
export async function ensureSeeded(db: LugatchaDB): Promise<void> {
  const count = await db.words.count()
  if (count === 0) await seedDatabase(db)
}
