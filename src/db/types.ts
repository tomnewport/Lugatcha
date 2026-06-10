export interface Word {
  id: string // stable slug, e.g. "airport.passport"
  uzbek: string
  english: string
  usageNotes?: string
  inflections?: string[]
  theme: string // location id or 'core'
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
  /** Per-story word glosses (surface form -> English) for tooltip lookups. */
  glossary?: Record<string, string>
}

export interface RoleplayTurn {
  speaker: 'user' | 'npc'
  uzbek: string
  english: string
  tokens?: string[] // pre-tokenized Uzbek words for phrase-assembly
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
  seenAt?: number // unix timestamp of first exposure
  lastResults: boolean[] // newest first, capped at 4 entries
}

export interface LocationProgress {
  locationId: string
  completedExercises: ExerciseType[]
}

export type ExerciseType =
  | 'intro'
  | 'flashcards'
  | 'listening'
  | 'phrase-assembly'
  | 'roleplay'
  | 'storytime'

// ---------------------------------------------------------------------------
// Language School lessons (issue #8). Lesson content is static config fetched
// from public/data/lessons/ (like locations); only progress lives in Dexie.
// ---------------------------------------------------------------------------

export interface LessonExample {
  uzbek: string
  english: string
  /** Morpheme split for the agglutination visual, e.g. ["uy","lar","im"] */
  breakdown?: string[]
  /** Per-morpheme gloss aligned to breakdown, e.g. ["house","PLURAL","my"] */
  gloss?: string[]
}

export interface LessonSection {
  heading?: string
  body: string[] // paragraphs; **bold** is supported
  examples?: LessonExample[]
}

export interface LessonChoiceOption {
  text: string
  correct?: boolean
  explain?: string
}

/**
 * Two exercise engines cover the School's mechanics: 'choice' (pick the right
 * answer, optionally audio-led via promptUzbek) and 'build' (assemble tokens
 * in order — words from morphemes, sentences from words).
 */
export interface LessonExercise {
  id: string
  engine: 'choice' | 'build'
  instruction: string
  prompt?: string
  /** Uzbek text spoken as the prompt (sound-led exercises). */
  promptUzbek?: string
  /** choice engine */
  options?: LessonChoiceOption[]
  /** build engine: canonical token order */
  tokens?: string[]
  decoys?: string[]
  /** build engine: how tokens join into the final form ('' for suffixes) */
  joiner?: string
  /** Spoken aloud (and shown) once solved. */
  audioText?: string
  translation?: string
}

export interface LessonMeta {
  id: string
  order: number
  title: { en: string; uz?: string }
  blurb: string
  estimatedMinutes: number
  prerequisites?: string[]
}

export interface Lesson extends LessonMeta {
  sections: LessonSection[]
  exercises: LessonExercise[]
  wrapUp: string
}

export interface LessonProgress {
  lessonId: string
  completedAt?: number
  exercisesPassed: string[]
}

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
