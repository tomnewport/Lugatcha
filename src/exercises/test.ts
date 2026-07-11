import type { Word, WordProgress, TestQuestionType } from '@/db/types'
import { TEST_QUESTION_TYPES } from '@/db/types'
import { shuffle } from './validate'
import { isDue, overdueRatio } from './spacedRepetition'

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

/**
 * Whether picking `picked` for a question about `target` is close enough to
 * accept as correct — a curated near-synonym, such as the everyday "Salom"
 * ("Hello") for the formal "Assalomu alaykum" ("Peace be upon you"). Both
 * greetings, so a learner who picks one for the other has the gist; we accept
 * it but still surface the precise meaning.
 *
 * Symmetric: either word may name the other in its `accepts` list. Matched on
 * Uzbek form (folded) rather than gloss so it holds regardless of which base
 * language is displayed and which theme's copy of a word is in play.
 */
export function isCloseEnough(target: Word, picked: Word): boolean {
  const targetForm = foldTyping(target.uzbek)
  const pickedForm = foldTyping(picked.uzbek)
  if (targetForm === pickedForm) return false
  const lists = (w: Word, form: string) => (w.accepts ?? []).some((a) => foldTyping(a) === form)
  return lists(target, pickedForm) || lists(picked, targetForm)
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
 *
 * Distractors that share the answer's Uzbek form are excluded: every choice
 * prompt shows the Uzbek word (heard, or read in Latin/Cyrillic), so a word
 * spelled the same is an equally valid meaning and would be marked wrong for a
 * learner who picks it (e.g. "Kechirasiz" → both "Excuse me" and
 * "Excuse me / sorry").
 */
export function buildOptionBank(
  correct: Word,
  allWords: Word[],
  size = OPTION_BANK_SIZE,
): Word[] {
  const answerForm = foldTyping(correct.uzbek)
  const seen = new Set<string>([correct.english])
  const bank: Word[] = [correct]
  for (const w of shuffle(allWords)) {
    if (bank.length >= size) break
    if (seen.has(w.english)) continue
    if (foldTyping(w.uzbek) === answerForm) continue
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
 * The Daily Practice queue: which (word, skill) pairs to drill, spaced so words
 * come round for review as they start to fade.
 *
 * A "skill" is a test question type; a word is learned once all four pass. Per
 * area we keep an active batch of up to seven seen-but-unlearned words — the
 * ones closest to learned lead, so finishing a word frees its slot for the next.
 * Practice drills only the skills those batch words have NOT passed yet,
 * interleaved across words for variety, so it never re-tests a skill already in
 * hand. Learned words are then folded back in for retention, but spaced: those
 * whose spaced-repetition review has fallen due (see spacedRepetition.ts) lead,
 * most-overdue first, and words reviewed recently are left alone — so practice
 * reinforces what is fading rather than re-asking things you reliably get right.
 */
export function selectDailyPracticePairs(
  seenWords: Word[],
  progress: Map<string, WordProgress | undefined>,
  count = DAILY_PRACTICE_LENGTH,
  batchPerTheme = DAILY_BATCH_PER_THEME,
  now: number = Date.now(),
): PracticePair[] {
  const passedOf = (w: Word) => passedTypes(progress.get(w.id))
  const learned = (w: Word) => isWordLearned(progress.get(w.id))
  const weakSkills = (w: Word) => TEST_QUESTION_TYPES.filter((t) => !passedOf(w).includes(t))
  const dueness = (w: Word) => overdueRatio(progress.get(w.id)?.review, now)

  // Active batch per area: seen, not yet learned, closest-to-learned first so
  // started words get finished before fresh ones crowd in; ties broken by which
  // word is most overdue for review.
  const byTheme = new Map<string, Word[]>()
  for (const w of seenWords) {
    if (learned(w)) continue
    const arr = byTheme.get(w.theme) ?? []
    arr.push(w)
    byTheme.set(w.theme, arr)
  }
  const batch: Word[] = []
  for (const themeWords of byTheme.values()) {
    const ordered = shuffle(themeWords).sort(
      (a, b) => passedOf(b).length - passedOf(a).length || dueness(b) - dueness(a),
    )
    batch.push(...ordered.slice(0, batchPerTheme))
  }

  const pairs: PracticePair[] = []
  const used = new Set<string>()
  const add = (word: Word, type: TestQuestionType) => {
    const key = `${word.id}:${type}`
    if (used.has(key) || pairs.length >= count) return
    used.add(key)
    pairs.push({ word, type })
  }

  /**
   * Round-robin one skill per word per pass, so consecutive questions land on
   * different words instead of clustering every skill of a single word into a
   * back-to-back run. Word order within a pass follows the queue order given.
   */
  type SkillQueue = { word: Word; skills: TestQuestionType[] }
  const interleave = (queues: SkillQueue[]) => {
    for (let progressed = true; progressed && pairs.length < count; ) {
      progressed = false
      for (const q of queues) {
        if (pairs.length >= count) return
        const type = q.skills.shift()
        if (type === undefined) continue
        add(q.word, type)
        progressed = true
      }
    }
  }

  // Drain each batch word's weak skills first; near-finished words lead each
  // pass so they reach "learned" sooner.
  interleave(
    batch
      .map((w) => ({ word: w, skills: shuffle(weakSkills(w)) }))
      .filter((q) => q.skills.length > 0)
      .sort((a, b) => a.skills.length - b.skills.length),
  )

  // Top up with retention on learned words (fair game once weak skills are
  // done), spaced: words whose review has fallen due lead, most-overdue first,
  // so reinforcement lands on what is fading. Interleaved so no single word
  // monopolises a run.
  if (pairs.length < count) {
    const learnedWords = seenWords.filter(learned)
    const due = shuffle(learnedWords.filter((w) => isDue(progress.get(w.id)?.review, now))).sort(
      (a, b) => dueness(b) - dueness(a),
    )
    const notDue = shuffle(learnedWords.filter((w) => !isDue(progress.get(w.id)?.review, now)))
    // Due words first; only reach for not-yet-due ones if the queue is still short.
    interleave([...due, ...notDue].map((w) => ({ word: w, skills: shuffle([...TEST_QUESTION_TYPES]) })))
  }
  // Still short (a very small vocabulary): re-ask batch words' passed skills.
  if (pairs.length < count) {
    interleave(shuffle(batch).map((w) => ({ word: w, skills: shuffle([...TEST_QUESTION_TYPES]) })))
  }
  return pairs
}
