import type { Word, WordProgress, TestQuestionType } from '@/db/types'
import { TEST_QUESTION_TYPES } from '@/db/types'
import { shuffle } from './validate'

export const TEST_LENGTH = 5
export const OPTION_BANK_SIZE = 40
/** A test usually mixes new words with a couple of learned ones to re-test. */
export const NEW_WORDS_PER_TEST = 3
export const RETEST_WORDS_PER_TEST = TEST_LENGTH - NEW_WORDS_PER_TEST

const APOSTROPHES = /[‘’ʻʼ`´']/g

/** Folds case and apostrophe variants so typed input compares to the target. */
export function foldTyping(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(APOSTROPHES, "'")
}

/**
 * The spelling a typing question expects: punctuation other than apostrophes
 * dropped, whitespace collapsed. Case is preserved for display.
 */
export function typingTarget(uzbek: string): string {
  return uzbek
    .normalize('NFC')
    .replace(/[^\p{L}\s‘’ʻʼ`´']/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function passedTypes(progress: WordProgress | undefined): TestQuestionType[] {
  return progress?.testPassed ?? []
}

/** A word is learned once it has passed all three test question types. */
export function isWordLearned(progress: WordProgress | undefined): boolean {
  const passed = passedTypes(progress)
  return TEST_QUESTION_TYPES.every((t) => passed.includes(t))
}

/** Seen and started, but not yet learned. Tests prioritise these. */
export function isWordPartiallyLearned(progress: WordProgress | undefined): boolean {
  const n = passedTypes(progress).length
  return n > 0 && n < TEST_QUESTION_TYPES.length
}

/**
 * Question type for a word: a random one it hasn't passed yet (so each test
 * moves it toward learned), or — for an already-learned word being re-tested —
 * any of the three at random.
 */
export function pickQuestionType(
  progress: WordProgress | undefined,
  rng: () => number = Math.random,
): TestQuestionType {
  const passed = passedTypes(progress)
  const remaining = TEST_QUESTION_TYPES.filter((t) => !passed.includes(t))
  const pool = remaining.length > 0 ? remaining : [...TEST_QUESTION_TYPES]
  return pool[Math.floor(rng() * pool.length)]
}

/**
 * Selects the five words for a test: up to three "new" (not-yet-learned) words —
 * partially-learned ones first — plus up to two learned words to re-test, then
 * tops up from whichever pool has spares. With no learned words yet, it's all new.
 */
export function selectTestWords(
  candidates: Word[],
  learnedPool: Word[],
  progress: Map<string, WordProgress | undefined>,
  count = TEST_LENGTH,
): Word[] {
  const learned = (w: Word) => isWordLearned(progress.get(w.id))
  const partial = (w: Word) => isWordPartiallyLearned(progress.get(w.id))

  const newPool = [
    ...shuffle(candidates.filter(partial)),
    ...shuffle(candidates.filter((w) => !learned(w) && !partial(w))),
  ]
  const retestPool = shuffle(learnedPool.filter(learned))

  const result: Word[] = []
  const used = new Set<string>()
  const push = (w: Word) => {
    if (result.length < count && !used.has(w.id)) {
      used.add(w.id)
      result.push(w)
    }
  }

  newPool.slice(0, NEW_WORDS_PER_TEST).forEach(push)
  retestPool.slice(0, RETEST_WORDS_PER_TEST).forEach(push)
  // Top up if either pool was short of its quota.
  newPool.forEach(push)
  retestPool.forEach(push)
  return result
}

/**
 * A searchable bank of `size` option words, always including the answer.
 *
 * Holds the words themselves rather than pre-glossed strings so the choices
 * re-render in the active base language — otherwise a test built in one
 * language keeps showing its distractors in that language after the learner
 * switches language. Deduplicated by the canonical English gloss so distinct
 * meanings show regardless of which language is displayed.
 */
export function buildOptionBank(
  correct: Word,
  allWords: Word[],
  size = OPTION_BANK_SIZE,
): Word[] {
  const seen = new Set<string>([correct.english])
  const bank: Word[] = [correct]
  for (const w of shuffle(allWords)) {
    if (bank.length >= size) break
    if (seen.has(w.english)) continue
    seen.add(w.english)
    bank.push(w)
  }
  return shuffle(bank)
}

export interface TestQuestion {
  word: Word
  type: TestQuestionType
  /** Option words for the choice question types (glossed at render); empty for 'type'. */
  options: Word[]
}

/** A single thing to drill: one word tested through one skill (question type). */
export interface PracticePair {
  word: Word
  type: TestQuestionType
}

/** Turns explicit (word, skill) pairs into questions, building option banks. */
export function buildQuestionsFromPairs(pairs: PracticePair[], allWords: Word[]): TestQuestion[] {
  return pairs.map(({ word, type }) => ({
    word,
    type,
    options: type === 'type' ? [] : buildOptionBank(word, allWords),
  }))
}

export function buildTest(
  words: Word[],
  progress: Map<string, WordProgress | undefined>,
  allWords: Word[],
  rng: () => number = Math.random,
): TestQuestion[] {
  const pairs = words.map((word) => ({
    word,
    type: pickQuestionType(progress.get(word.id), rng),
  }))
  return buildQuestionsFromPairs(pairs, allWords)
}

/** How many questions a Daily Practice session serves. */
export const DAILY_PRACTICE_LENGTH = 20
/**
 * Words actively being learned per city area. Each area keeps a rolling batch of
 * this many seen-but-unlearned words; finishing one frees its slot for the next.
 */
export const DAILY_BATCH_PER_THEME = 7

/**
 * The Daily Practice queue: which (word, skill) pairs to drill, weakest first.
 *
 * A "skill" is a test question type; a word is learned once all four pass. Per
 * area we keep an active batch of up to seven seen-but-unlearned words — the
 * ones closest to learned lead, so finishing a word frees its slot for the next.
 * Practice drills only the skills those batch words have NOT passed yet,
 * interleaved across words for variety, so it never re-tests a skill already in
 * hand. Learned words are fair game only to top up once every weak skill is
 * covered, keeping retention light rather than re-asking things you reliably get
 * right.
 */
export function selectDailyPracticePairs(
  seenWords: Word[],
  progress: Map<string, WordProgress | undefined>,
  count = DAILY_PRACTICE_LENGTH,
  batchPerTheme = DAILY_BATCH_PER_THEME,
): PracticePair[] {
  const passedOf = (w: Word) => passedTypes(progress.get(w.id))
  const learned = (w: Word) => isWordLearned(progress.get(w.id))
  const weakSkills = (w: Word) => TEST_QUESTION_TYPES.filter((t) => !passedOf(w).includes(t))

  // Active batch per area: seen, not yet learned, closest-to-learned first so
  // started words get finished before fresh ones crowd in.
  const byTheme = new Map<string, Word[]>()
  for (const w of seenWords) {
    if (learned(w)) continue
    const arr = byTheme.get(w.theme) ?? []
    arr.push(w)
    byTheme.set(w.theme, arr)
  }
  const batch: Word[] = []
  for (const themeWords of byTheme.values()) {
    const ordered = shuffle(themeWords).sort((a, b) => passedOf(b).length - passedOf(a).length)
    batch.push(...ordered.slice(0, batchPerTheme))
  }

  const pairs: PracticePair[] = []
  const used = new Set<string>()
  const add = (word: Word, type: TestQuestionType): boolean => {
    const key = `${word.id}:${type}`
    if (used.has(key) || pairs.length >= count) return false
    used.add(key)
    pairs.push({ word, type })
    return pairs.length < count
  }

  // Drain each batch word's weak skills round-robin so questions alternate
  // between words; near-finished words lead each pass to reach learned sooner.
  const queues = batch
    .map((w) => ({ word: w, skills: shuffle(weakSkills(w)) }))
    .filter((q) => q.skills.length > 0)
    .sort((a, b) => a.skills.length - b.skills.length)
  for (let progressed = true; progressed && pairs.length < count; ) {
    progressed = false
    for (const q of queues) {
      const type = q.skills.shift()
      if (type && add(q.word, type)) progressed = true
      else if (type) return pairs
    }
  }
  if (pairs.length >= count) return pairs

  // Top up with retention on learned words (fair game once weak skills are done).
  for (const w of shuffle(seenWords.filter(learned))) {
    for (const t of shuffle([...TEST_QUESTION_TYPES])) if (!add(w, t)) return pairs
  }
  // Still short (a very small vocabulary): re-ask passed skills on batch words.
  for (const w of shuffle(batch)) {
    for (const t of shuffle([...TEST_QUESTION_TYPES])) if (!add(w, t)) return pairs
  }
  return pairs
}
