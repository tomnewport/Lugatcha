import type { Word } from '@/db/types'

/**
 * High-frequency vocabulary: the little words and everyday verbs that every
 * phrase the app teaches is built out of — men, bu, mana, va, juda, olaman,
 * bering, kuting. Their home is the School (two vocabulary sets you can read
 * and drill on purpose), but they belong to no single topic and pay off in all
 * of them, so no learner should have to go looking for them.
 *
 * This module is the one place the priority is spelled out. Every way into the
 * app keeps a share of its slots for them:
 *
 *  - a New Words session at any location or travel place opens with a couple
 *    (exercises/words.ts),
 *  - Daily Practice reserves a slot to introduce one even when the session is
 *    full of reviews, and keeps a share of its active batch for the ones met
 *    but not yet learned (exercises/practice.ts, exercises/test.ts),
 *  - a location's Test leads its batch with one, so they reach "learned"
 *    wherever the learner happens to be working.
 *
 * The shares are deliberately fractions, never the whole session: a topic must
 * still teach its own vocabulary.
 */

/** Slots kept in a New Words session (of five cards). */
export const HIGH_FREQUENCY_PER_INTRO = 2
/** Slots kept in Daily Practice's active batch (of DAILY_ACTIVE_WORDS). */
export const HIGH_FREQUENCY_PRACTICE_SLOTS = 3
/** Slots kept in a location Test's new-word batch (of NEW_WORDS_PER_TEST). */
export const HIGH_FREQUENCY_PER_TEST = 1

export function isHighFrequency(word: Word): boolean {
  return Boolean(word.highFrequency)
}

/**
 * Moves up to `slots` high-frequency words to the front, keeping the order of
 * everything else — the shape every reservation above takes. Capping the lead
 * is the point: the glue arrives steadily from the first session without
 * crowding out the words the learner came to this topic for.
 */
export function leadWithHighFrequency(words: Word[], slots: number): Word[] {
  if (slots <= 0) return [...words]
  const lead = words.filter(isHighFrequency).slice(0, slots)
  if (lead.length === 0) return [...words]
  const leading = new Set(lead.map((w) => w.id))
  return [...lead, ...words.filter((w) => !leading.has(w.id))]
}
