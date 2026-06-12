import type { ExerciseType, LocationProgress } from '@/db/types'
import type { LugatchaDB } from '@/db/LugatchaDB'
import { isWordKnown } from '@/db/useDb'

export const ACTIVITY_ORDER: ExerciseType[] = [
  'intro',
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
  'test',
]

export const EXERCISE_LABELS: Record<ExerciseType, string> = {
  intro: 'New Words',
  flashcards: 'Matching',
  listening: 'Listening',
  'phrase-assembly': 'Phrase Assembly',
  roleplay: 'Roleplay',
  storytime: 'Storytime',
  test: 'Test',
}

export const EXERCISE_DESCRIPTIONS: Record<ExerciseType, string> = {
  intro: 'Meet five new words and hear them spoken',
  flashcards: 'Match Uzbek and English pairs',
  listening: 'Hear real phrases with their meaning',
  'phrase-assembly': 'Build phrases from a word bank',
  roleplay: 'Hold a conversation, turn by turn',
  storytime: 'Read a short story and translate it',
  test: 'Prove you know five words to learn them',
}

/** Seen-word thresholds that bring each activity to the table. */
export const UNLOCK_AT: Record<ExerciseType, number> = {
  intro: 0,
  flashcards: 5,
  listening: 5,
  'phrase-assembly': 5,
  roleplay: 5,
  storytime: 5,
  test: 5,
}

export interface LocationStats {
  locationId: string
  totalWords: number
  seenWords: number
  knownWords: number
  completed: ExerciseType[]
  /** Exercises finished here across repeats; the auto-launch rotation cursor. */
  visits: number
}

export interface Activity {
  type: ExerciseType
  state: 'available' | 'locked'
  done: boolean
  hint?: string
}

/**
 * The potluck: which activities a location offers right now. Vocabulary is
 * always on the table while new words remain; everything else unlocks as you
 * meet more of the location's words — so coming back after a couple of word
 * sessions can reveal a roleplay or a story.
 */
export function buildPotluck(stats: LocationStats): Activity[] {
  const done = new Set(stats.completed)
  // Small locations shouldn't have unreachable activities
  const needed = (type: ExerciseType) => Math.min(UNLOCK_AT[type], stats.totalWords)
  const moreWords = (type: ExerciseType) => {
    const missing = needed(type) - stats.seenWords
    return `Meet ${missing} more ${missing === 1 ? 'word' : 'words'} to unlock`
  }

  return ACTIVITY_ORDER.map((type): Activity => {
    const base = { type, done: done.has(type) }

    if (type === 'intro') {
      if (stats.seenWords >= stats.totalWords && stats.totalWords > 0) {
        return { ...base, state: 'locked', hint: "You've met every word here" }
      }
      return { ...base, state: 'available' }
    }

    if (stats.seenWords < needed(type)) {
      return { ...base, state: 'locked', hint: moreWords(type) }
    }

    return { ...base, state: 'available' }
  })
}

/**
 * Live stats for a location. Runs inside a Dexie liveQuery so the menu
 * refreshes as word and exercise progress changes.
 */
export async function loadLocationStats(
  db: LugatchaDB,
  locationId: string,
): Promise<LocationStats> {
  const [themeWords, locationProgress] = await Promise.all([
    db.words.where('theme').equals(locationId).toArray(),
    db.locationProgress.get(locationId) as Promise<LocationProgress | undefined>,
  ])
  const progress = await db.wordProgress.bulkGet(themeWords.map((w) => w.id))

  let seenWords = 0
  let knownWords = 0
  for (const p of progress) {
    if (p?.seenAt) seenWords++
    if (isWordKnown(p)) knownWords++
  }

  return {
    locationId,
    totalWords: themeWords.length,
    seenWords,
    knownWords,
    completed: locationProgress?.completedExercises ?? [],
    visits: locationProgress?.visits ?? 0,
  }
}

/** The practice activities that fill the gaps between meeting words and testing. */
const PRACTICE_EXERCISES: ExerciseType[] = [
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
]

/**
 * The repeating shape of a location's visits. New words and practice alternate
 * so the seen-word ring keeps climbing, then a test lands on the fifth visit —
 * and every fifth after — to turn met words into learned ones. Once every word
 * is met the "new words" slots fall through to a test, which is what drives the
 * last words to "learned".
 */
const VISIT_CYCLE = ['intro', 'practice', 'intro', 'practice', 'test'] as const

/** Practice slots in one turn of the cycle. */
const PRACTICE_SLOTS_PER_CYCLE = VISIT_CYCLE.filter((slot) => slot === 'practice').length

/**
 * How many practice slots have come round by a given visit — a counter that
 * ticks once per practice slot. Rotating on raw `visits` would alias: practice
 * only ever lands on the same residues of the cycle, so `visits % 5` would pick
 * just two of the five exercises and starve the rest (roleplay/storytime).
 */
function practiceSlotsSoFar(visits: number): number {
  const period = VISIT_CYCLE.length
  let withinCycle = 0
  for (let i = 0; i < visits % period; i++) {
    if (VISIT_CYCLE[i] === 'practice') withinCycle++
  }
  return Math.floor(visits / period) * PRACTICE_SLOTS_PER_CYCLE + withinCycle
}

/**
 * The single exercise a location auto-launches on a given visit. Keyed off how
 * many exercises have been finished here (`stats.visits`) so the activity
 * rotates — meeting new words "every now and again" and reaching a first test
 * around the fifth visit — instead of sticking on whichever exercise comes
 * first and only ever doing the first five words.
 */
export function selectAutoExercise(stats: LocationStats): ExerciseType | null {
  const potluck = buildPotluck(stats)
  const byType = new Map(potluck.map((a) => [a.type, a]))
  const available = (type: ExerciseType) => byType.get(type)?.state === 'available'

  // Resolve a "practice" slot to a concrete exercise: an undone one first (so
  // the five types each get a turn and fill the completion ring), then an even
  // rotation through the unlocked set so roleplay and storytime keep coming up.
  const pickPractice = (): ExerciseType | null => {
    const unlocked = PRACTICE_EXERCISES.filter(available)
    if (unlocked.length === 0) return null
    const undone = unlocked.find((type) => !byType.get(type)!.done)
    return undone ?? unlocked[practiceSlotsSoFar(stats.visits) % unlocked.length]
  }

  const slot = VISIT_CYCLE[stats.visits % VISIT_CYCLE.length]
  // Per slot, the order to try kinds in; the first unlocked one wins, so a slot
  // whose activity isn't available yet gracefully gives way to one that is.
  const preference: ('intro' | 'practice' | 'test')[] =
    slot === 'intro'
      ? ['intro', 'test', 'practice']
      : slot === 'test'
        ? ['test', 'practice', 'intro']
        : ['practice', 'test', 'intro']

  for (const kind of preference) {
    if (kind === 'intro' && available('intro')) return 'intro'
    if (kind === 'test' && available('test')) return 'test'
    if (kind === 'practice') {
      const practice = pickPractice()
      if (practice) return practice
    }
  }

  // Defensive: nothing matched (e.g. a word-less theme) — take anything unlocked.
  return potluck.find((a) => a.state === 'available')?.type ?? null
}
