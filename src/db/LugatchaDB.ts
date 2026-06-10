import Dexie, { type Table } from 'dexie'
import type { Word, Story, Roleplay, WordProgress, LocationProgress } from './types'
import { seedDatabase } from './seed'

export class LugatchaDB extends Dexie {
  words!: Table<Word, string>
  stories!: Table<Story, string>
  roleplay!: Table<Roleplay, string>
  wordProgress!: Table<WordProgress, string>
  locationProgress!: Table<LocationProgress, string>

  constructor() {
    super('lugatcha')
    this.version(1).stores({
      words: 'id, theme',
      stories: 'id, theme',
      roleplay: 'id, theme',
      wordProgress: 'wordId',
      locationProgress: 'locationId',
    })
    // Fires only on first-ever open of this DB in the browser
    this.on('populate', () => seedDatabase(this))
  }
}

export const db = new LugatchaDB()
