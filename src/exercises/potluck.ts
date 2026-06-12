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

/** Practice activities, in rough difficulty order, used for the fallback search. */
const PRACTICE_EXERCISES: ExerciseType[] = [
  'flashcards',
  'listening',
  'phrase-assembly',
  'roleplay',
  'storytime',
]

interface PlaylistSlot {
  /** The exercise this visit serves. */
  primary: ExerciseType
  /**
   * Only for an `intro` slot: once every word here is met, New Words retires, so
   * the slot serves this richer exercise instead of piling on more tests.
   */
  whenMet?: ExerciseType
}

/**
 * The repeating shape of a location's visits, walked by `stats.visits`. New
 * Words recurs (so the seen ring keeps climbing) until every word is met, the
 * first test lands on the fifth visit, and roleplay/storytime appear early and
 * often — both as their own slots and as what the New-Words slots become once
 * words run out, so the richer exercises stay plentiful rather than the tile
 * turning into a test grind. Every practice type still appears each cycle, so a
 * location's completion ring fills. Tune the feel by editing this list.
 */
const VISIT_PLAYLIST: PlaylistSlot[] = [
  { primary: 'intro', whenMet: 'roleplay' }, //  1
  { primary: 'flashcards' }, //                   2
  { primary: 'intro', whenMet: 'storytime' }, //  3
  { primary: 'roleplay' }, //                     4
  { primary: 'test' }, //                         5 — first test
  { primary: 'intro', whenMet: 'roleplay' }, //   6
  { primary: 'storytime' }, //                    7
  { primary: 'intro', whenMet: 'roleplay' }, //   8
  { primary: 'listening' }, //                    9
  { primary: 'phrase-assembly' }, //             10
  { primary: 'intro', whenMet: 'storytime' }, // 11
  { primary: 'test' }, //                        12
]

/**
 * The single exercise a location auto-launches on a given visit. Walks the
 * visit playlist by how many exercises have been finished here (`stats.visits`)
 * so the activity rotates — meeting new words "every now and again", reaching a
 * first test around the fifth visit, and serving roleplay/storytime plenty —
 * instead of sticking on whichever exercise comes first and only ever doing the
 * first five words.
 */
export function selectAutoExercise(stats: LocationStats): ExerciseType | null {
  const potluck = buildPotluck(stats)
  const byType = new Map(potluck.map((a) => [a.type, a]))
  const available = (type: ExerciseType) => byType.get(type)?.state === 'available'

  const slot = VISIT_PLAYLIST[stats.visits % VISIT_PLAYLIST.length]
  const wanted =
    slot.primary === 'intro' && !available('intro') ? (slot.whenMet ?? 'test') : slot.primary
  if (available(wanted)) return wanted

  // The scheduled exercise isn't unlocked yet (e.g. a test slot before enough
  // words are met): take the next unlocked thing — meet words, then practise,
  // then test — so a tile always has something to offer.
  const fallback: ExerciseType[] = ['intro', ...PRACTICE_EXERCISES, 'test']
  return fallback.find(available) ?? potluck.find((a) => a.state === 'available')?.type ?? null
}
