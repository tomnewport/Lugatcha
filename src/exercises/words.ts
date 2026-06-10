import { db } from '@/db'
import type { Word } from '@/db/types'
import { shuffle } from './validate'

async function seenWordIds(): Promise<Set<string>> {
  const progress = await db.wordProgress.toArray()
  return new Set(progress.filter((p) => p.seenAt).map((p) => p.wordId))
}

/**
 * Words for the intro exercise: unseen theme words first, padded with unseen
 * core vocabulary, then (when nearly everything is seen) already-seen words.
 */
export async function pickIntroWords(theme: string, count = 5): Promise<Word[]> {
  const [themeWords, coreWords, seen] = await Promise.all([
    db.words.where('theme').equals(theme).toArray(),
    db.words.where('theme').equals('core').toArray(),
    seenWordIds(),
  ])
  const unseenTheme = shuffle(themeWords.filter((w) => !seen.has(w.id)))
  const unseenCore = shuffle(coreWords.filter((w) => !seen.has(w.id)))
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
