/**
 * Choosing which piece of repeatable content (a story, for now) to serve so the
 * learner doesn't keep seeing the same one. Kept as a pure function so it can be
 * unit tested away from Dexie; the exercise supplies the items and a map of when
 * each was last shown.
 */

/**
 * Pick the item least recently shown: any never-shown item wins (in the order
 * given, so a location's first story stays deterministic), otherwise the one
 * whose `shownAt` is oldest. Returns null only for an empty list. This means a
 * story is never repeated while an unseen alternative exists, and once every
 * story has been seen the rotation keeps cycling the oldest back in rather than
 * getting stuck on one.
 */
export function pickLeastRecentlyShown<T extends { id: string }>(
  items: T[],
  shownAt: Map<string, number>,
): T | null {
  if (items.length === 0) return null
  let best = items[0]
  let bestScore = shownAt.get(best.id) ?? -1
  for (const item of items) {
    // Never shown → -1, which sorts before any real timestamp.
    const score = shownAt.get(item.id) ?? -1
    if (score < bestScore) {
      best = item
      bestScore = score
    }
  }
  return best
}
