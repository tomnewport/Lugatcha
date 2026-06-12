import { db } from '@/db'
import type { Word, WordProgress } from '@/db/types'
import { shuffle } from './validate'
import { isWordLearned } from './test'

async function seenWordIds(): Promise<Set<string>> {
  const progress = await db.wordProgress.toArray()
  return new Set(progress.filter((p) => p.seenAt).map((p) => p.wordId))
}

/** Essential words first; random within the same level (stable sort after shuffle). */
function byLevel(words: Word[]): Word[] {
  return shuffle(words).sort((a, b) => (a.level ?? 2) - (b.level ?? 2))
}

/**
 * Words for the intro exercise: unseen theme words first (essential levels
 * before nice-to-have), padded with unseen core vocabulary, then (when nearly
 * everything is seen) already-seen words.
 */
export async function pickIntroWords(theme: string, count = 5): Promise<Word[]> {
  const [themeWords, coreWords, seen] = await Promise.all([
    db.words.where('theme').equals(theme).toArray(),
    db.words.where('theme').equals('core').toArray(),
    seenWordIds(),
  ])
  const unseenTheme = byLevel(themeWords.filter((w) => !seen.has(w.id)))
  const unseenCore = byLevel(coreWords.filter((w) => !seen.has(w.id)))
  const seenAny = shuffle([...themeWords, ...coreWords].filter((w) => seen.has(w.id)))
  return [...unseenTheme, ...unseenCore, ...seenAny].slice(0, count)
}

/**
 * Words for flashcards: only words the learner has met. Theme words first,
 * padded with seen core vocabulary.
 */
export async function pickFlashcardWords(theme: string, count = 5): Promise<Word[]> {
  const [themeWords, coreWords, seen] = await Promise.all([
    db.words.where('theme').equals(theme).toArray(),
    db.words.where('theme').equals('core').toArray(),
    seenWordIds(),
  ])
  const seenTheme = shuffle(themeWords.filter((w) => seen.has(w.id)))
  const seenCore = shuffle(coreWords.filter((w) => seen.has(w.id)))
  // Fallback for the (unreachable in normal flow) case of too few seen words
  const unseenTheme = shuffle(themeWords.filter((w) => !seen.has(w.id)))
  return [...seenTheme, ...seenCore, ...unseenTheme].slice(0, count)
}

export interface TestData {
  /** Seen words at this location (theme + core), the pool for new test words. */
  candidates: Word[]
  /** Already-learned words anywhere, the pool for re-testing retention. */
  learnedPool: Word[]
  /** Every word, used to fill the searchable option banks. */
  allWords: Word[]
  /** Progress keyed by word id, for learned/partial classification. */
  progress: Map<string, WordProgress | undefined>
}

/** Loads everything a Test needs in one pass: candidates, re-test pool, banks. */
export async function loadTestData(theme: string): Promise<TestData> {
  const [themeWords, coreWords, allWords, allProgress] = await Promise.all([
    db.words.where('theme').equals(theme).toArray(),
    db.words.where('theme').equals('core').toArray(),
    db.words.toArray(),
    db.wordProgress.toArray(),
  ])
  const progress = new Map<string, WordProgress | undefined>(
    allProgress.map((p) => [p.wordId, p]),
  )
  const seen = new Set(allProgress.filter((p) => p.seenAt).map((p) => p.wordId))
  const byId = new Map(allWords.map((w) => [w.id, w]))

  const candidates = [...themeWords, ...coreWords].filter((w) => seen.has(w.id))
  const learnedPool = allProgress
    .filter((p) => isWordLearned(p))
    .map((p) => byId.get(p.wordId))
    .filter((w): w is Word => Boolean(w))

  return { candidates, learnedPool, allWords, progress }
}

/**
 * Test data for an explicit pool of words (a vocab group, issue #62). Every
 * word in the pool is a candidate — focused practice tests the whole set rather
 * than only the words already met elsewhere. Option banks still draw from all
 * vocabulary so the choices stay varied.
 */
export async function loadPoolTestData(pool: Word[]): Promise<TestData> {
  const [allWords, allProgress] = await Promise.all([
    db.words.toArray(),
    db.wordProgress.toArray(),
  ])
  const progress = new Map<string, WordProgress | undefined>(
    allProgress.map((p) => [p.wordId, p]),
  )
  const learnedPool = pool.filter((w) => isWordLearned(progress.get(w.id)))
  return { candidates: pool, learnedPool, allWords, progress }
}
