import type { Word, WordProgress } from '@/db/types'
import type { PracticeItem } from './practice'

/**
 * Spelling info cards.
 *
 * Spelling a word you have never seen written out is guesswork, not recall — so
 * before a spelling question the learner meets the word on an interstitial card
 * showing its meaning, both scripts and the letters that spell it. The card is
 * shown until the word has been spelled perfectly once, and comes back the next
 * time round whenever a spelling attempt is given up on.
 */

/**
 * Questions that must sit between a card and the spelling question it prepares
 * for. Typing back a word read moments earlier is copying, not memory; a few
 * questions in between make the spelling worth something.
 */
export const SPELL_CARD_GAP = 3

/** An interstitial card introducing a word's spelling. */
export interface SpellCardItem {
  kind: 'spell-card'
  word: Word
}

/**
 * Whether a spelling question for this word needs its info card first: any time
 * the last spelling attempt failed, or the word has never been spelled at 100%
 * (the 'type' skill is only banked on a tip-free spelling). Un-learning a word
 * clears its passed skills, so its card comes back with it.
 */
export function needsSpellCard(progress: WordProgress | undefined): boolean {
  return Boolean(progress?.lastSpellFailed) || !progress?.testPassed?.includes('type')
}

/**
 * Inserts a spelling info card ahead of every spelling question that needs one,
 * spaced SPELL_CARD_GAP questions back from the question it prepares (cards
 * themselves aren't questions, so they don't fill the gap).
 *
 * One greedy pass is enough because a card is not a question: inserting one
 * between an earlier card and its spelling can only widen that gap, never close
 * it. Keep that property — counting cards toward `between` would let a later
 * insertion silently break an earlier pair's spacing, and a run of spellings
 * (every one of them deferred, so they arrive back-to-back) is exactly the
 * shape that would expose it.
 *
 * Sessions too short to space a card — a spelling question in the opening
 * questions with nothing to push it back behind — still get the card, but the
 * question is marked `noCredit`: the learner sees the word either way, and a
 * spelling copied off a card seconds earlier must not bank mastery.
 */
export function withSpellCards(
  items: PracticeItem[],
  progress: Map<string, WordProgress | undefined>,
  gap = SPELL_CARD_GAP,
): PracticeItem[] {
  const needsCard = (item: PracticeItem) =>
    item.kind === 'word' && item.type === 'type' && needsSpellCard(progress.get(item.word.id))

  const out: PracticeItem[] = []
  for (const item of deferOpeningSpellings(items, needsCard, gap)) {
    if (item.kind !== 'word' || !needsCard(item)) {
      out.push(item)
      continue
    }
    // Walk back over the questions already queued to the latest slot that
    // leaves `gap` of them between the card and this question.
    let between = 0
    let at = out.length
    while (at > 0 && between < gap) {
      at--
      if (out[at].kind !== 'spell-card') between++
    }
    out.splice(at, 0, { kind: 'spell-card', word: item.word })
    out.push(between < gap ? { ...item, noCredit: true } : item)
  }
  return out
}

/**
 * Moves spelling questions out of the session's opening slots so there is room
 * to space their cards. Everything else keeps its order; when the session has
 * too few other questions to shelter behind, they stay where they are and are
 * marked as earning no credit.
 */
function deferOpeningSpellings(
  items: PracticeItem[],
  needsCard: (item: PracticeItem) => boolean,
  gap: number,
): PracticeItem[] {
  const deferred: PracticeItem[] = []
  const rest: PracticeItem[] = []
  for (const item of items) {
    if (needsCard(item) && rest.length < gap) deferred.push(item)
    else rest.push(item)
  }
  rest.splice(gap, 0, ...deferred)
  return rest
}
