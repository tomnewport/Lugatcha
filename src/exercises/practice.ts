import type { Word, WordProgress, PhraseProgress, TestQuestionType } from '@/db/types'
import {
  selectDailyPracticePairs,
  buildOptionBank,
  DAILY_PRACTICE_LENGTH,
} from './test'
import { isDue, overdueRatio } from './spacedRepetition'
import { shuffle } from './validate'
import { PHRASE_MODES, type PhrasePromptMode, type PracticePhrase } from './phrases'

/**
 * The mixed Daily Practice session: word questions remain the backbone, phrase
 * building joins the rotation (with its own spaced repetition), and — when the
 * learner is on top of their reviews — spare room introduces new words and
 * phrases instead of padding the session with busywork re-tests.
 */

/** Max review phrases folded into one session, so words stay the backbone. */
export const PHRASES_PER_PRACTICE = 5
/** New-material caps for a session with spare room (learning going well). */
export const NEW_WORDS_PER_PRACTICE = 3
export const NEW_PHRASES_PER_PRACTICE = 2

export type PracticeItem =
  | { kind: 'word'; word: Word; type: TestQuestionType; isNew?: boolean }
  | { kind: 'phrase'; phrase: PracticePhrase; mode: PhrasePromptMode; isNew?: boolean }

/** A renderable question: word items gain their option bank, phrase items their decoy pool. */
export type PracticeQuestion =
  | { kind: 'word'; word: Word; type: TestQuestionType; options: Word[]; isNew?: boolean }
  | {
      kind: 'phrase'
      phrase: PracticePhrase
      mode: PhrasePromptMode
      /** Corpus the component draws decoy tokens from (in the active language). */
      pool: PracticePhrase[]
      isNew?: boolean
    }

export interface DailyPracticeSessionData {
  /** Words the learner has met — the drilling pool. */
  seenWords: Word[]
  /** Words never met — introduction candidates when the session has room. */
  unseenWords: Word[]
  /** The whole phrase corpus (loadPracticePhrases). */
  phrases: PracticePhrase[]
  /** Word progress keyed by word id (matches loadDailyPracticeData). */
  progress: Map<string, WordProgress | undefined>
  phraseProgress: Map<string, PhraseProgress | undefined>
}

/** Spreads the extras roughly evenly through the base list, keeping both orders. */
export function intersperse<T>(base: T[], extras: T[]): T[] {
  if (extras.length === 0) return [...base]
  const out: T[] = [...base]
  extras.forEach((extra, i) => {
    const pos = Math.round(((i + 1) * (base.length + extras.length)) / (extras.length + 1))
    out.splice(Math.min(pos, out.length), 0, extra)
  })
  return out
}

/**
 * Builds one Daily Practice session, in priority order:
 *  1. word weak skills and due word reviews (selectDailyPracticePairs, no filler),
 *  2. due phrase reviews — most overdue first, capped so words keep the lead,
 *  3. with spare room ("learning is going well"): introduce a few new words
 *     (started areas and essential words first) and new phrases (started areas
 *     only, where the scenario gives them context), flagged `isNew` so the UI
 *     presents them before asking,
 *  4. only then the old busywork filler, so a mature vocabulary still gets a
 *     full retention session when nothing new remains.
 * Phrase and introduction items are spread through the word backbone rather
 * than clustered at the end.
 */
export function buildDailyPracticeSession(
  data: DailyPracticeSessionData,
  count = DAILY_PRACTICE_LENGTH,
  now: number = Date.now(),
): PracticeItem[] {
  const { seenWords, unseenWords, phrases, progress, phraseProgress } = data
  const phraseProg = (p: PracticePhrase) => phraseProgress.get(p.key)

  // 2 first, so the word backbone can be sized around the phrases it must fit.
  const met = phrases.filter((p) => phraseProg(p)?.seenAt)
  const duePhrases = shuffle(met.filter((p) => isDue(phraseProg(p)?.review, now)))
    .sort((a, b) => overdueRatio(phraseProg(b)?.review, now) - overdueRatio(phraseProg(a)?.review, now))
    .slice(0, Math.min(PHRASES_PER_PRACTICE, count))
  const phraseItems: PracticeItem[] = duePhrases.map((phrase, i) => ({
    kind: 'phrase',
    phrase,
    mode: PHRASE_MODES[i % PHRASE_MODES.length],
  }))

  // 1. The word backbone: weak skills + due reviews only — no filler, so any
  // spare room is visible and can go to new material instead.
  const wordItems: PracticeItem[] = selectDailyPracticePairs(
    seenWords,
    progress,
    count - phraseItems.length,
    undefined,
    now,
    false,
  ).map((p) => ({ kind: 'word', word: p.word, type: p.type }))

  // 3. Introductions, while room remains: alternate new words and new phrases.
  const introItems: PracticeItem[] = []
  let spare = count - wordItems.length - phraseItems.length
  if (spare > 0) {
    const startedThemes = new Set(seenWords.map((w) => w.theme))
    // Essential words first; areas already started before unexplored ones.
    const newWords = shuffle(unseenWords)
      .sort((a, b) => (a.level ?? 2) - (b.level ?? 2))
      .sort((a, b) => Number(startedThemes.has(b.theme)) - Number(startedThemes.has(a.theme)))
      .slice(0, NEW_WORDS_PER_PRACTICE)
    // A phrase without its scenario is just noise — only started areas.
    const newPhrases = shuffle(
      phrases.filter((p) => !phraseProg(p)?.seenAt && startedThemes.has(p.theme)),
    ).slice(0, NEW_PHRASES_PER_PRACTICE)

    const wordQueue: PracticeItem[] = newWords.map((word) => ({
      kind: 'word',
      word,
      // Meet-then-answer: the gentlest skill right after the intro card.
      type: 'read-choice',
      isNew: true,
    }))
    const phraseQueue: PracticeItem[] = newPhrases.map((phrase) => ({
      kind: 'phrase',
      phrase,
      // Build the Uzbek just met, from a bank that contains every piece.
      mode: 'english',
      isNew: true,
    }))
    while (spare > 0 && (wordQueue.length > 0 || phraseQueue.length > 0)) {
      const next = wordQueue.shift() ?? phraseQueue.shift()
      if (next) {
        introItems.push(next)
        spare--
      }
      if (spare > 0) {
        const alt = phraseQueue.shift()
        if (alt) {
          introItems.push(alt)
          spare--
        }
      }
    }
  }

  // 4. Last resort: pad with retests so a fully-explored city still practises.
  const wordFiller: PracticeItem[] = []
  if (spare > 0) {
    const used = new Set(
      wordItems.map((i) => (i.kind === 'word' ? `${i.word.id}:${i.type}` : '')),
    )
    for (const p of selectDailyPracticePairs(seenWords, progress, count, undefined, now)) {
      if (spare <= 0) break
      const key = `${p.word.id}:${p.type}`
      if (used.has(key)) continue
      used.add(key)
      wordFiller.push({ kind: 'word', word: p.word, type: p.type })
      spare--
    }
  }

  return intersperse([...wordItems, ...wordFiller], [...phraseItems, ...introItems])
}

/** Turns session items into renderable questions (option banks, decoy pools). */
export function buildPracticeSessionQuestions(
  items: PracticeItem[],
  allWords: Word[],
  phrasePool: PracticePhrase[],
): PracticeQuestion[] {
  return items.map((item) =>
    item.kind === 'word'
      ? {
          ...item,
          options: item.type === 'type' ? [] : buildOptionBank(item.word, allWords),
        }
      : { ...item, pool: phrasePool },
  )
}
