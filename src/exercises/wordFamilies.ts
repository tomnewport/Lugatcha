import type { Word, WordProgress } from '@/db/types'

/**
 * Word families: one word, several topics.
 *
 * *Choy* belongs in the tea house, the cafe, the restaurant and in Bukhara;
 * *shahar* in four cities. Each topic lists it, and each listing used to be its
 * own word to meet, learn, spell and review — so the simplest, commonest words
 * got taught four times over while the vocabulary that makes a topic distinctive
 * waited its turn.
 *
 * A duplicate entry now carries `sameAs`, pointing at the copy that does the
 * teaching. The family is that canonical word plus everything pointing at it:
 *
 *  - a family is served as one card, not one per topic (`dedupeFamilies`), so a
 *    common word is introduced and drilled once;
 *  - progress is mirrored across the whole family (`familyIds`), so meeting it
 *    in the tea house means the cafe already counts it as met — the topic's tile
 *    credits the word without re-teaching it.
 */

/** The word an entry teaches: itself, or the canonical copy it points at. */
export function canonicalId(word: Word): string {
  return word.sameAs ?? word.id
}

/** True for a duplicate listing — the same word, kept for another topic's list. */
export function isAlias(word: Word): boolean {
  return Boolean(word.sameAs)
}

/**
 * Maps every word id to the ids of its whole family (itself included), for
 * words that have one. Words with no duplicates are left out, so the common
 * case costs nothing to look up.
 */
export function buildFamilyIndex(words: Word[]): Map<string, string[]> {
  const byCanonical = new Map<string, string[]>()
  for (const word of words) {
    const canonical = canonicalId(word)
    const family = byCanonical.get(canonical)
    if (family) family.push(word.id)
    else byCanonical.set(canonical, [word.id])
  }

  const index = new Map<string, string[]>()
  for (const [canonical, members] of byCanonical) {
    // The canonical word may itself be missing from `words` (a theme-scoped
    // query); its aliases are still one family.
    const family = members.includes(canonical) ? members : [canonical, ...members]
    if (family.length < 2) continue
    for (const id of family) index.set(id, family)
  }
  return index
}

/** Every id sharing this word's teaching — just the id itself when it stands alone. */
export function familyIds(wordId: string, index: Map<string, string[]>): string[] {
  return index.get(wordId) ?? [wordId]
}

/**
 * Collapses a list of words to one entry per family — the rule behind "a word
 * is served once, not once per topic". Prefers the canonical copy, but keeps
 * whichever member comes first when the canonical isn't in the list (a
 * theme-scoped pool holding only the alias). Order is otherwise preserved.
 */
export function dedupeFamilies(words: Word[]): Word[] {
  const canonicalPresent = new Set(
    words.filter((w) => !w.sameAs).map((w) => w.id),
  )
  const taken = new Set<string>()
  const out: Word[] = []
  for (const word of words) {
    const canonical = canonicalId(word)
    if (taken.has(canonical)) continue
    // Wait for the canonical copy if it's coming up in this same list.
    if (word.sameAs && canonicalPresent.has(canonical)) continue
    taken.add(canonical)
    out.push(word)
  }
  return out
}

/**
 * Folds a family's progress rows into the one row they all share. Writes are
 * mirrored across a family, so in normal use the rows are already identical —
 * this is what reconciles them the first time, for progress made before the
 * family was linked (or restored from an older backup). Nothing learned is
 * lost: skills union, the best spelling stands, and the earliest first-met and
 * learned times win.
 */
export function mergeFamilyProgress(rows: (WordProgress | undefined)[]): WordProgress | undefined {
  const present = rows.filter((r): r is WordProgress => Boolean(r))
  if (present.length === 0) return undefined
  if (present.length === 1) return present[0]

  const earliest = (values: (number | undefined)[]): number | undefined => {
    const set = values.filter((v): v is number => typeof v === 'number')
    return set.length > 0 ? Math.min(...set) : undefined
  }
  const best = present.reduce((a, b) => (passedCount(b) > passedCount(a) ? b : a))
  const passed = new Set(present.flatMap((r) => r.testPassed ?? []))

  return {
    wordId: best.wordId,
    seenAt: earliest(present.map((r) => r.seenAt)),
    lastResults: best.lastResults ?? [],
    testPassed: [...passed],
    spellMastery: Math.max(...present.map((r) => r.spellMastery ?? 0)),
    lastSpellFailed: best.lastSpellFailed,
    learnedAt: earliest(present.map((r) => r.learnedAt)),
    // The word is only as shaky as its worst copy says it is.
    failsSinceLearned: Math.max(...present.map((r) => r.failsSinceLearned ?? 0)),
    // Soonest due wins, so a merge never postpones a review that had fallen due.
    review: present
      .map((r) => r.review)
      .filter((r): r is NonNullable<WordProgress['review']> => Boolean(r))
      .sort((a, b) => a.dueAt - b.dueAt)[0],
  }
}

function passedCount(row: WordProgress): number {
  return row.testPassed?.length ?? 0
}
