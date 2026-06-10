export interface Word {
  id: string            // stable slug, e.g. "airport.passport"
  uzbek: string
  english: string
  usageNotes?: string
  inflections?: string[]
  theme: string         // location id or 'core'
  cyrillic?: string
}

export interface StorySentence {
  uzbek: string
  english: string
}

export interface Story {
  id: string
  theme: string
  title: { en: string; uz: string }
  sentences: StorySentence[]
}

export interface RoleplayTurn {
  speaker: 'user' | 'npc'
  uzbek: string
  english: string
  tokens?: string[]     // pre-tokenized Uzbek words for phrase-assembly
}

export interface RoleplayVariant {
  id: string
  description: string
  turns: RoleplayTurn[]
}

export interface Roleplay {
  id: string
  theme: string
  title: { en: string; uz: string }
  scenario: string
  variants: RoleplayVariant[]
}

export interface WordProgress {
  wordId: string
  seenAt?: number        // unix timestamp of first exposure
  lastResults: boolean[] // newest first, capped at 4 entries
}

export interface LocationProgress {
  locationId: string
  completedExercises: ExerciseType[]
}

export type ExerciseType = 'intro' | 'flashcards' | 'phrase-assembly' | 'roleplay' | 'storytime'

// Static config — not stored in IndexedDB, read from locations.yaml at startup
export interface Location {
  id: string
  name: { en: string; uz: string }
  icon: string
  gridRow: number
  gridCol: number
  colSpan?: number
  rowSpan?: number
}
