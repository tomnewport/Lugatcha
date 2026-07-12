import Dexie, { type Table } from 'dexie'
import type {
  Word,
  Story,
  Roleplay,
  WordProgress,
  LocationProgress,
  LessonProgress,
  StoryProgress,
  RoleplayProgress,
  PhraseProgress,
} from './types'
import { seedDatabase } from './seed'

export class LugatchaDB extends Dexie {
  words!: Table<Word, string>
  stories!: Table<Story, string>
  roleplay!: Table<Roleplay, string>
  wordProgress!: Table<WordProgress, string>
  locationProgress!: Table<LocationProgress, string>
  lessonProgress!: Table<LessonProgress, string>
  storyProgress!: Table<StoryProgress, string>
  roleplayProgress!: Table<RoleplayProgress, string>
  phraseProgress!: Table<PhraseProgress, string>

  constructor() {
    super('lugatcha')
    this.version(1).stores({
      words: 'id, theme',
      stories: 'id, theme',
      roleplay: 'id, theme',
      wordProgress: 'wordId',
      locationProgress: 'locationId',
    })
    // v2: Language School lesson progress
    this.version(2).stores({
      lessonProgress: 'lessonId',
    })
    // v3: audio candidate reviews (no longer used — kept for upgrade path)
    this.version(3).stores({
      audioReviews: 'key',
    })
    // v4: drop the audio review table now that Sayro TTS is retired
    this.version(4).stores({
      audioReviews: null,
    })
    // v5: track which stories have been shown so Storytime stops repeating one
    this.version(5).stores({
      storyProgress: 'storyId',
    })
    // v6: phrase spaced-repetition state — Daily Practice drills phrases too
    this.version(6).stores({
      phraseProgress: 'phraseKey',
    })
    // v7: track which roleplay variants have been shown so Continue Learning
    // serves each once instead of re-rolling the same scenario at random
    this.version(7).stores({
      roleplayProgress: 'variantId',
    })
    // Fires only on first-ever open of this DB in the browser
    this.on('populate', () => seedDatabase(this))
  }
}

export const db = new LugatchaDB()
