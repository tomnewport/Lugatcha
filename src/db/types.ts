import type { ReviewSchedule } from '@/exercises/spacedRepetition'

export interface Word {
  id: string // stable slug, e.g. "airport.passport"
  uzbek: string
  english: string
  /** Russian gloss; falls back to `english` when absent. */
  russian?: string
  usageNotes?: string
  /** Russian usage notes; falls back to `usageNotes` when absent. */
  usageNotesRu?: string
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
  /** Russian translation; falls back to `english` when absent. */
  russian?: string
}

export interface Story {
  id: string
  theme: string
  title: { en: string; uz: string; ru?: string }
  sentences: StorySentence[]
  /** Per-story word glosses (surface form -> English) for tooltip lookups. */
  glossary?: Record<string, string>
  /** Per-story word glosses in Russian; falls back to `glossary` per key. */
  glossaryRu?: Record<string, string>
}

export interface RoleplayTurn {
  speaker: 'user' | 'npc'
  uzbek: string
  english: string
  /** Russian translation; falls back to `english` when absent. */
  russian?: string
  tokens?: string[] // pre-tokenized Uzbek words for phrase-assembly
}

export interface RoleplayVariant {
  id: string
  description: string
  /** Russian description; falls back to `description` when absent. */
  descriptionRu?: string
  turns: RoleplayTurn[]
}

export interface Roleplay {
  id: string
  theme: string
  title: { en: string; uz: string; ru?: string }
  scenario: string
  /** Russian scenario; falls back to `scenario` when absent. */
  scenarioRu?: string
  variants: RoleplayVariant[]
}

/**
 * The four ways a word is quizzed in a Test. A word is "learned" only once all
 * four have been passed (issue #61): identified by sound, by sight in Latin and
 * in Cyrillic, and spelled at 100% with no tips.
 */
export const TEST_QUESTION_TYPES = [
  'listen-choice',
  'read-choice',
  'read-cyrillic-choice',
  'type',
] as const
export type TestQuestionType = (typeof TEST_QUESTION_TYPES)[number]

export interface WordProgress {
  wordId: string
  seenAt?: number // unix timestamp of first exposure
  lastResults: boolean[] // newest first, capped at 4 entries
  /** Test question types passed at least once — all of them means "learned". */
  testPassed?: TestQuestionType[]
  /**
   * Best spelling score so far, 0–1 (1 = spelled with no tips). The 'type'
   * requirement only counts as passed at a full 1, but partial scores persist
   * so the learner can see how close they are.
   */
  spellMastery?: number
  /** When the word was first fully learned (all four types). Drives the chest. */
  learnedAt?: number
  /** Failed test questions accrued since it was learned; two of them unlearns it. */
  failsSinceLearned?: number
  /**
   * Spaced-repetition schedule (SM-2). Set the first time the word is answered
   * in a test/practice question and advanced on every answer; drives which
   * words fall due for review. See src/exercises/spacedRepetition.ts.
   */
  review?: ReviewSchedule
}

/**
 * Spaced-repetition state for a roleplay phrase, keyed by its folded Uzbek text
 * (see src/exercises/phrases.ts). Phrases have no learned/unlearned state —
 * the review schedule alone decides when Daily Practice re-serves them.
 */
export interface PhraseProgress {
  phraseKey: string
  /** Unix ms of first exposure in any phrase-building exercise. */
  seenAt?: number
  /** SM-2 schedule, advanced by every graded phrase-building answer. */
  review?: ReviewSchedule
}

/**
 * Which stories the learner has already been shown, so Storytime doesn't keep
 * serving the same one (issue: "getting a lot of the same story"). A story is
 * only reshown once every other story for its location has been seen; `shownAt`
 * lets the picker fall back to the least-recently-shown when they run out.
 */
export interface StoryProgress {
  storyId: string
  /** Unix timestamp the story was last served. */
  shownAt: number
}

/**
 * Which roleplay variants (individual conversation paths) the learner has
 * already been shown, so the auto-assigned Continue Learning flow serves each
 * once rather than re-rolling the same scenario at random. Keyed by the
 * variant's id; `shownAt` lets the picker fall back to the least-recently-shown
 * once every variant at a location has been seen.
 */
export interface RoleplayProgress {
  variantId: string
  /** Unix timestamp the variant was last served. */
  shownAt: number
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
  /**
   * When the Welcome Center was first fully completed (welcome-center row
   * only). Graduation latches permanently: daily practice can later un-learn a
   * welcome word (two misses), and that must send the word back into rotation —
   * not lock the whole city behind onboarding again.
   */
  graduatedAt?: number
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
  /** Russian translation; falls back to `english` when absent. */
  russian?: string
  /** Morpheme split for the agglutination visual, e.g. ["uy","lar","im"] */
  breakdown?: string[]
  /** Per-morpheme gloss aligned to breakdown, e.g. ["house","PLURAL","my"] */
  gloss?: string[]
  /** Russian per-morpheme gloss; falls back to `gloss` when absent. */
  glossRu?: string[]
}

export interface LessonSection {
  heading?: string
  /** Russian heading; falls back to `heading` when absent. */
  headingRu?: string
  body: string[] // paragraphs; **bold** is supported
  /** Russian paragraphs; falls back to `body` when absent. */
  bodyRu?: string[]
  examples?: LessonExample[]
}

export interface LessonChoiceOption {
  text: string
  /** Russian option text; falls back to `text` when absent. */
  textRu?: string
  correct?: boolean
  explain?: string
  /** Russian explanation; falls back to `explain` when absent. */
  explainRu?: string
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
  /** Russian instruction; falls back to `instruction` when absent. */
  instructionRu?: string
  prompt?: string
  /** Russian prompt; falls back to `prompt` when absent. */
  promptRu?: string
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
  /** Russian translation; falls back to `translation` when absent. */
  translationRu?: string
}

export interface LessonMeta {
  id: string
  order: number
  title: { en: string; uz?: string; ru?: string }
  blurb: string
  /** Russian blurb; falls back to `blurb` when absent. */
  blurbRu?: string
  estimatedMinutes: number
  prerequisites?: string[]
}

export interface Lesson extends LessonMeta {
  sections: LessonSection[]
  exercises: LessonExercise[]
  wrapUp: string
  /** Russian wrap-up; falls back to `wrapUp` when absent. */
  wrapUpRu?: string
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
  title: { en: string; uz: string; ru?: string }
  /** Emoji shown on the School card. */
  icon: string
  blurb: string
  /** Russian blurb; falls back to `blurb` when absent. */
  blurbRu?: string
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
  name: { en: string; uz: string; ru?: string }
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
  name: { en: string; uz: string; ru?: string }
  /** Real-world location, projected onto the map at render time. */
  lat: number
  lon: number
  article: string[]
  /** Russian article paragraphs; falls back to `article` when absent. */
  articleRu?: string[]
  words: Word[]
}

/** Pre-built Uzbekistan map layers (public/data/uzbekistan.geo.json). */
export interface UzbekMap {
  border: { type: 'Polygon' | 'MultiPolygon'; coordinates: number[][][] | number[][][][] }
  railways: number[][][]
  towns: { name: string; lon: number; lat: number; rank: number }[]
}
