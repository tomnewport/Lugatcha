import { db } from '@/db'
import type { PhraseProgress, Word, WordProgress } from '@/db/types'
import { shuffle, normalizeToken } from './validate'
import { isWordLearned } from './test'
import { loadPracticePhrases, type PracticePhrase } from './phrases'
import { WELCOME_CENTER_ID } from '@/db/progress'
import { dedupeFamilies } from './wordFamilies'

async function seenWordIds(): Promise<Set<string>> {
  const progress = await db.wordProgress.toArray()
  return new Set(progress.filter((p) => p.seenAt).map((p) => p.wordId))
}

/** Essential words first; random within the same level (stable sort after shuffle). */
function byLevel(words: Word[]): Word[] {
  return shuffle(words).sort((a, b) => (a.level ?? 2) - (b.level ?? 2))
}

/**
 * How many slots of a New Words session are kept for high-frequency vocabulary.
 * Enough that the glue words and everyday verbs arrive steadily from the first
 * session; few enough that a topic still teaches its own vocabulary.
 */
export const HIGH_FREQUENCY_PER_INTRO = 2

/**
 * Puts a couple of high-frequency words at the front of a session — the glue
 * (men, bu, va, juda) and the everyday verbs (bering, olaman, kutaman) that run
 * through the phrases every topic teaches. Learning one pays off in every
 * conversation, so it shouldn't queue behind a single topic's nice-to-have
 * nouns; capping the lead keeps the topic teaching its own words too. Order is
 * otherwise preserved.
 */
export function leadWithHighFrequency(words: Word[], slots = HIGH_FREQUENCY_PER_INTRO): Word[] {
  const lead = words.filter((w) => w.highFrequency).slice(0, slots)
  if (lead.length === 0) return [...words]
  const leading = new Set(lead.map((w) => w.id))
  return [...lead, ...words.filter((w) => !leading.has(w.id))]
}

/**
 * Keeps the first word of each Uzbek surface form. Two cards that share a
 * spelling (e.g. a theme word and the identical core word) can't be matched
 * unambiguously, so the duplicate is dropped.
 */
function dedupeBySurface(words: Word[]): Word[] {
  const seen = new Set<string>()
  const out: Word[] = []
  for (const w of words) {
    const form = normalizeToken(w.uzbek)
    if (seen.has(form)) continue
    seen.add(form)
    out.push(w)
  }
  return out
}

/**
 * Words for the intro exercise: unseen theme words first (essential levels
 * before nice-to-have), padded with unseen core vocabulary, then (when nearly
 * everything is seen) already-seen words. The Welcome Center is self-contained
 * onboarding, so it never pads with core — its basics already overlap core
 * vocabulary, which would surface the same word twice.
 */
export async function pickIntroWords(theme: string, count = 5): Promise<Word[]> {
  const [themeWords, coreWords, seen] = await Promise.all([
    db.words.where('theme').equals(theme).toArray(),
    db.words.where('theme').equals('core').toArray(),
    seenWordIds(),
  ])
  const unseenTheme = byLevel(themeWords.filter((w) => !seen.has(w.id)))
  const seenTheme = shuffle(themeWords.filter((w) => seen.has(w.id)))
  if (theme === WELCOME_CENTER_ID) {
    return dedupeBySurface([...unseenTheme, ...seenTheme]).slice(0, count)
  }
  const unseenCore = byLevel(coreWords.filter((w) => !seen.has(w.id)))
  const seenAny = shuffle([...themeWords, ...coreWords].filter((w) => seen.has(w.id)))
  // A couple of high-frequency words lead the session; the topic's own words
  // fill the rest, so both move forward together.
  const fresh = leadWithHighFrequency([...unseenTheme, ...unseenCore])
  return dedupeBySurface([...fresh, ...seenAny]).slice(0, count)
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
  return dedupeFamilies([...seenTheme, ...seenCore, ...unseenTheme]).slice(0, count)
}

export interface DailyPracticeData {
  /** Every word the learner has met anywhere — the Daily Practice pool. */
  seenWords: Word[]
  /** Words never met — introduction candidates when the session has room. */
  unseenWords: Word[]
  /** All vocabulary, for the choice questions' option banks. */
  allWords: Word[]
  /** The roleplay phrase corpus, for phrase-building questions. */
  phrases: PracticePhrase[]
  /** Progress keyed by word id, for weak-skill and learned classification. */
  progress: Map<string, WordProgress | undefined>
  /** Phrase review schedules keyed by phrase key. */
  phraseProgress: Map<string, PhraseProgress | undefined>
}

/**
 * Loads everything Daily Practice needs in one pass. Unlike a location test it
 * draws on all seen vocabulary — and the whole phrase corpus — so a session can
 * range across the whole city.
 */
export async function loadDailyPracticeData(): Promise<DailyPracticeData> {
  const [allWords, allProgress, phrases, allPhraseProgress] = await Promise.all([
    db.words.toArray(),
    db.wordProgress.toArray(),
    loadPracticePhrases(db),
    db.phraseProgress.toArray(),
  ])
  const progress = new Map<string, WordProgress | undefined>(allProgress.map((p) => [p.wordId, p]))
  const phraseProgress = new Map<string, PhraseProgress | undefined>(
    allPhraseProgress.map((p) => [p.phraseKey, p]),
  )
  const seenIds = new Set(allProgress.filter((p) => p.seenAt).map((p) => p.wordId))
  // One card per word family: a word listed by four topics is still one word to
  // drill, not four (exercises/wordFamilies.ts).
  const words = dedupeFamilies(allWords)
  return {
    seenWords: words.filter((w) => seenIds.has(w.id)),
    unseenWords: words.filter((w) => !seenIds.has(w.id)),
    allWords,
    phrases,
    progress,
    phraseProgress,
  }
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

  const candidates = dedupeFamilies([...themeWords, ...coreWords].filter((w) => seen.has(w.id)))
  const learnedPool = dedupeFamilies(
    allProgress
      .filter((p) => isWordLearned(p))
      .map((p) => byId.get(p.wordId))
      .filter((w): w is Word => Boolean(w)),
  )

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
  const words = dedupeFamilies(pool)
  const learnedPool = words.filter((w) => isWordLearned(progress.get(w.id)))
  return { candidates: words, learnedPool, allWords, progress }
}
