/**
 * Ranking the answers in a choice question against what the learner has typed.
 *
 * The answer list is long enough to need a search box, and a plain
 * substring filter is unusable for exactly the words that matter most. Type
 * "I" — the answer for *men*, the commonest word in the language — and every
 * gloss with an i in it comes back: "this", "with", "here it is". The one
 * answer that *is* "I" is somewhere in the middle of them, in whatever order
 * the options happened to be shuffled into.
 *
 * So matches are ranked rather than merely filtered. Nothing that matched
 * before is dropped: the list is the same set of answers, ordered so the ones
 * the query almost certainly meant come first.
 *
 * Two things decide the order:
 *
 *  - **How the query matched.** A gloss the query *is* beats one it starts,
 *    which beats one where it starts a word, which beats a match buried inside
 *    another word. Typing "I" means the answer "I" before "here it is" before
 *    "this".
 *  - **How much of the answer it accounts for.** Within a tier, the query
 *    covering more of the gloss wins: "to me" covers half of "to me / for me"
 *    and a fifth of "here it is / here you are".
 *
 * Glosses carry more than one sense — "he / she / it", "a cold (illness)" —
 * and the learner types one of them, not the whole thing. Each sense is
 * therefore matched in its own right, with and without its parenthetical, and
 * the gloss takes the best result any of them managed. That is what lets "she"
 * be an exact answer to "he / she / it" rather than a fragment of it.
 */

/** Senses inside one gloss are written apart by these. */
const SENSE_SEPARATORS = /[/,;]/
const PARENTHETICAL = /\s*\([^)]*\)/g
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u

/** Case and spacing folded, so what was typed can be compared to what is shown. */
function normalize(text: string): string {
  return text.normalize('NFC').toLowerCase().replace(/\s+/g, ' ').trim()
}

/**
 * The strings a query may reasonably be aiming at within one gloss: the whole
 * of it, each sense on its own, and each of those with its parenthetical gloss
 * ("a cold (illness)" → "a cold") taken off.
 */
function candidates(gloss: string): string[] {
  const whole = normalize(gloss)
  const out = new Set<string>()
  for (const part of [whole, ...whole.split(SENSE_SEPARATORS)]) {
    const sense = part.trim()
    if (sense) out.add(sense)
    const bare = part.replace(PARENTHETICAL, '').trim()
    if (bare) out.add(bare)
  }
  return [...out]
}

/** Whether `needle` starts a word somewhere in `haystack`. */
function startsAWord(haystack: string, needle: string): boolean {
  for (let i = haystack.indexOf(needle); i !== -1; i = haystack.indexOf(needle, i + 1)) {
    if (i === 0 || !LETTER_OR_DIGIT.test(haystack[i - 1])) return true
  }
  return false
}

/** How well one candidate string answers the query; higher is a closer match. */
function tierOf(candidate: string, query: string): number | null {
  if (candidate === query) return 3
  if (candidate.startsWith(query)) return 2
  if (startsAWord(candidate, query)) return 1
  if (candidate.includes(query)) return 0
  return null
}

export interface GlossMatch {
  /** 3 exact · 2 starts the gloss · 1 starts a word · 0 buried inside one. */
  tier: number
  /** How much of the matched sense the query accounts for, 0–1. */
  coverage: number
}

/**
 * How well `gloss` answers `query`, or null if it does not match at all.
 * `query` is expected already trimmed; both sides are folded for case.
 */
export function matchGloss(gloss: string, query: string): GlossMatch | null {
  const q = normalize(query)
  if (!q) return null
  let best: GlossMatch | null = null
  for (const candidate of candidates(gloss)) {
    const tier = tierOf(candidate, q)
    if (tier === null) continue
    // Measured against the shortest sense that matched this well: "she" is the
    // whole of one sense of "he / she / it", not a third of the gloss.
    const coverage = q.length / candidate.length
    if (!best || tier > best.tier || (tier === best.tier && coverage > best.coverage)) {
      best = { tier, coverage }
    }
  }
  return best
}

/**
 * The items whose gloss matches `query`, closest match first. An empty query
 * leaves the list exactly as it was — the options are already in the order the
 * question shuffled them into, and that order is part of the question.
 */
export function rankByGloss<T>(
  items: readonly T[],
  glossOf: (item: T) => string,
  query: string,
): T[] {
  if (!query.trim()) return [...items]
  return items
    .map((item, index) => ({ item, index, match: matchGloss(glossOf(item), query) }))
    .filter((row): row is { item: T; index: number; match: GlossMatch } => row.match !== null)
    .sort(
      (a, b) =>
        b.match.tier - a.match.tier ||
        b.match.coverage - a.match.coverage ||
        // Equally good matches keep the order they were offered in.
        a.index - b.index,
    )
    .map((row) => row.item)
}
