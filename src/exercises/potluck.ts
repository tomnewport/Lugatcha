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
  }
}
