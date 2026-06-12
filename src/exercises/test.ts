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

/** A searchable bank of `size` English meanings, always including the answer. */
export function buildOptionBank(
  correct: Word,
  allWords: Word[],
  size = OPTION_BANK_SIZE,
): string[] {
  const options = new Set<string>([correct.english])
  for (const english of shuffle(allWords.map((w) => w.english))) {
    if (options.size >= size) break
    options.add(english)
  }
  return shuffle([...options])
}

export interface TestQuestion {
  word: Word
  type: TestQuestionType
  /** English meanings for the choice question types; empty for 'type'. */
  options: string[]
}

export function buildTest(
  words: Word[],
  progress: Map<string, WordProgress | undefined>,
  allWords: Word[],
  rng: () => number = Math.random,
): TestQuestion[] {
  return words.map((word) => {
    const type = pickQuestionType(progress.get(word.id), rng)
    return {
      word,
      type,
      options: type === 'type' ? [] : buildOptionBank(word, allWords),
    }
  })
}
