/**
 * Pure validation helpers shared by the assembly-style exercises.
 *
 * Uzbek Latin text renders apostrophe-like marks inconsistently (ʻ, ʼ, ', ´),
 * so normalisation folds them together before comparing tokens.
 */

const APOSTROPHES = /[‘’ʻʼ`´']/g
const PUNCTUATION = /[.,!?;:"«»()\[\]—–]/g

export function normalizeToken(token: string): string {
  return token
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(PUNCTUATION, '')
    .trim()
}

export function tokenize(sentence: string): string[] {
  return sentence.split(/\s+/).filter((t) => normalizeToken(t).length > 0)
}

/**
 * A translation can mark clarifying words as optional by wrapping them in
 * [square brackets] — e.g. "Can you tell me [when we get there]?". Bracketed
 * words render as part of the sentence but may be built or omitted when
 * assembling the phrase. Returns the ordered display tokens (brackets removed)
 * and the set of normalised words that were marked optional.
 */
export function parseOptional(sentence: string): { tokens: string[]; optional: Set<string> } {
  const optional = new Set<string>()
  for (const match of sentence.matchAll(/\[([^\]]*)\]/g)) {
    for (const token of tokenize(match[1])) optional.add(normalizeToken(token))
  }
  const tokens = tokenize(sentence.replace(/[[\]]/g, ' '))
  return { tokens, optional }
}

const EDGE_PUNCT = /^[\s.,!?;:"«»()\[\]{}—–…·+\-“”]+|[\s.,!?;:"«»()\[\]{}—–…·+\-“”]+$/g

/**
 * Canonical spoken form of a single tapped word: NFC, surrounding punctuation
 * trimmed, lowercased — so one prebuilt audio clip serves a word wherever it
 * appears (sentence-initial or mid-sentence, with or without trailing comma).
 * Apostrophe variants are left for audioKey() to fold. Mirrors
 * scripts/generate_audio.py:spoken_word_form so taps resolve to generated clips.
 */
export function spokenWordForm(token: string): string {
  return token.normalize('NFC').replace(EDGE_PUNCT, '').toLowerCase()
}

/** Strict matching: every token in the canonical order. Used by phrase assembly and roleplay. */
export function validateStrictOrder(assembled: string[], canonical: string[]): boolean {
  if (assembled.length !== canonical.length) return false
  return assembled.every((token, i) => normalizeToken(token) === normalizeToken(canonical[i]))
}

/**
 * Function words that don't have to appear (and don't count against you)
 * when loosely validating an assembled English translation.
 */
export const ENGLISH_STOPWORDS = new Set([
  'a',
  'an',
  'the',
  'am',
  'is',
  'are',
  'was',
  'were',
  'be',
  'been',
  'being',
  'do',
  'does',
  'did',
  'have',
  'has',
  'had',
  'to',
  'of',
  'at',
  'in',
  'on',
  'for',
  'from',
  'with',
  'by',
  'as',
  'into',
  'out',
  'and',
  'or',
  'but',
  'so',
  'that',
  'this',
  'these',
  'those',
  'there',
  'here',
  'i',
  'you',
  'he',
  'she',
  'it',
  'we',
  'they',
  'my',
  'your',
  'his',
  'her',
  'its',
  'our',
  'their',
  'me',
  'him',
  'them',
  'us',
  'please',
  'will',
  'would',
  'shall',
  'should',
  'can',
  'could',
  'may',
  'not',
])

export function contentWords(tokens: string[]): string[] {
  return tokens.map(normalizeToken).filter((t) => t.length > 0 && !ENGLISH_STOPWORDS.has(t))
}

/**
 * Loose matching for story translations: every required content word of the
 * canonical sentence must be present, no foreign (decoy) content words may be
 * included, and word order is ignored. Words in `optional` (normalised) are
 * neither required nor counted as foreign, so they may be built or left out.
 */
export function validateLoose(
  assembled: string[],
  canonical: string[],
  optional: Set<string> = new Set(),
): boolean {
  const wanted = new Set(contentWords(canonical).filter((word) => !optional.has(word)))
  const got = new Set(contentWords(assembled))
  for (const word of wanted) if (!got.has(word)) return false
  for (const word of got) if (!wanted.has(word) && !optional.has(word)) return false
  return true
}

export function shuffle<T>(items: T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/**
 * Picks up to `count` decoy tokens from `pool`, excluding anything that
 * normalises to a token already in the answer.
 */
export function buildDecoys(canonical: string[], pool: string[], count: number): string[] {
  const taken = new Set(canonical.map(normalizeToken))
  const decoys: string[] = []
  for (const candidate of shuffle(pool)) {
    const norm = normalizeToken(candidate)
    if (norm.length === 0 || taken.has(norm)) continue
    taken.add(norm)
    decoys.push(candidate)
    if (decoys.length >= count) break
  }
  return decoys
}
