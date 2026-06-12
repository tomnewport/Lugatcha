export interface Word {
  id: string // stable slug, e.g. "airport.passport"
  uzbek: string
  english: string
  usageNotes?: string
  inflections?: string[]
  theme: string // location id or 'core'
  /** 1 = essential, 2 = useful, 3 = nice-to-have. Intro serves level 1 first. */
  level?: 1 | 2 | 3
  cyrillic?: string
  /**
   * Vocab group this word belongs to (issue #62), e.g. 'numbers', 'colours'.
   * Group words are normal `core` vocab — they show up in ordinary tests — but
   * the School can also gather them for focused, themed learning.
   */
  group?: string
  /** Hex swatch for colour words, shown in the group's review gallery. */
  swatch?: string
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

/**
 * The three ways a word is quizzed in a Test. A word is "learned" only once all
 * three have been passed at least once (issue #61).
 */
export const TEST_QUESTION_TYPES = ['listen-choice', 'read-choice', 'type'] as const
export type TestQuestionType = (typeof TEST_QUESTION_TYPES)[number]

export interface WordProgress {
  wordId: string
  seenAt?: number // unix timestamp of first exposure
  lastResults: boolean[] // newest first, capped at 4 entries
  /** Test question types passed at least once — three of them means "learned". */
  testPassed?: TestQuestionType[]
  /** When the word was first fully learned (all three types). Drives the chest. */
  learnedAt?: number
  /** Failed test questions accrued since it was learned; two of them unlearns it. */
  failsSinceLearned?: number
}

export interface LocationProgress {
  locationId: string
  completedExercises: ExerciseType[]
  /**
   * Exercises completed here, counted across repeats — the cursor that rotates
   * the auto-launched activity so a tile keeps meeting new words and reaches a
   * test, instead of sticking on whichever exercise is first in the list.
   */
  visits?: number
}

export type ExerciseType =
  | 'intro'
  | 'flashcards'
  | 'listening'
  | 'phrase-assembly'
  | 'roleplay'
  | 'storytime'
  | 'test'

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
  /** How many times the lesson has been completed; drives example rotation. */
  visitCount?: number
}

// ---------------------------------------------------------------------------
// Vocab groups (issue #62). A themed set of words — colours, numbers, animals,
// foods — that the School lets you learn and test together. Each group opens
// with a short article about how the group behaves in Uzbek; its words are
// ordinary `core` vocab, so they also surface in normal location tests. The
// numbers group additionally offers a procedurally generated counting quiz
// (issue #59) in place of the standard word test.
// ---------------------------------------------------------------------------

export interface VocabGroupMeta {
  id: string
  order: number
  title: { en: string; uz: string }
  /** Emoji shown on the School card. */
  icon: string
  blurb: string
}

export interface VocabGroup extends VocabGroupMeta {
  /** The fun read shown before reviewing — reuses the lesson section shape. */
  article: LessonSection[]
  /** Words in the group. Seeded as `core` vocab with `group` set to this id. */
  words: Word[]
  /** Swaps the standard word test for the bespoke counting quiz. */
  quiz?: 'counting'
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

/**
 * A significant place on the Travel Agency map of Uzbekistan (issue #63). Each
 * place is its own vocab theme — its words seed into the same `words` table —
 * plus an article and a pin position on the cartoon map (viewBox 1000×620).
 */
export interface TravelPlace {
  id: string
  name: { en: string; uz: string }
  /** Real-world location, projected onto the map at render time. */
  lat: number
  lon: number
  article: string[]
  words: Word[]
}

/** Pre-built Uzbekistan map layers (public/data/uzbekistan.geo.json). */
export interface UzbekMap {
  border: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
  railways: number[][][]
  towns: { name: string; lon: number; lat: number; rank: number }[]
}
