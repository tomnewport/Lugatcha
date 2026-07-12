import type { LugatchaDB } from '@/db/LugatchaDB'
import { tokenize, normalizeToken } from './validate'

/**
 * Phrase-building over the roleplay corpus. Every user-side turn across the
 * city's roleplay scenarios is a buildable phrase; this module gives each one a
 * stable identity so it can carry spaced-repetition progress (PhraseProgress),
 * and gathers the corpus for Daily Practice and the location exercise to share.
 */

/**
 * Decoy tokens mixed into a phrase-building word bank. Doubled from the
 * original 3 so the bank can't be solved by elimination alone.
 */
export const PHRASE_DECOYS = 6

/** The three ways a phrase is prompted; sessions rotate through them. */
export type PhrasePromptMode = 'english' | 'uzbek-to-english' | 'audio'
export const PHRASE_MODES: PhrasePromptMode[] = ['english', 'uzbek-to-english', 'audio']

/**
 * Stable identity for a phrase across minor content edits: case and apostrophe
 * variants folded, punctuation dropped, whitespace collapsed — so progress on
 * "Mana pasportim." survives the content gaining or losing a full stop, and the
 * same phrase appearing in two scenarios counts as one thing to remember.
 */
export function phraseKey(uzbek: string): string {
  return tokenize(uzbek).map(normalizeToken).join(' ')
}

/** A user-side roleplay turn, ready to drill as a phrase-building question. */
export interface PracticePhrase {
  key: string
  uzbek: string
  english: string
  /** Russian translation; falls back to `english` when absent. */
  russian?: string
  /** Canonical Uzbek token order (pre-tokenized in content, else derived). */
  tokens: string[]
  /** Location the phrase belongs to (the roleplay's theme). */
  theme: string
}

/**
 * The whole phrase corpus: every user turn from every roleplay, deduplicated by
 * folded form (the same greeting recurs across scenarios). NPC turns are the
 * interlocutor's lines — the learner never builds those.
 */
export async function loadPracticePhrases(db: LugatchaDB): Promise<PracticePhrase[]> {
  const roleplays = await db.roleplay.toArray()
  const seen = new Set<string>()
  const phrases: PracticePhrase[] = []
  for (const rp of roleplays) {
    for (const variant of rp.variants) {
      for (const turn of variant.turns) {
        if (turn.speaker !== 'user') continue
        const key = phraseKey(turn.uzbek)
        if (!key || seen.has(key)) continue
        seen.add(key)
        phrases.push({
          key,
          uzbek: turn.uzbek,
          english: turn.english,
          russian: turn.russian,
          tokens: turn.tokens ?? tokenize(turn.uzbek),
          theme: rp.theme,
        })
      }
    }
  }
  return phrases
}
