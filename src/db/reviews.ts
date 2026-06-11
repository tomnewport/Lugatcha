import type { LugatchaDB } from './LugatchaDB'
import type { AudioReview, Verdict } from './types'

/** Sets (or clears) one candidate's verdict for a word, persisting locally. */
export async function setVerdict(
  db: LugatchaDB,
  key: string,
  profileId: string,
  verdict: Verdict | null,
): Promise<void> {
  await db.transaction('rw', db.audioReviews, async () => {
    const existing = await db.audioReviews.get(key)
    const verdicts = { ...(existing?.verdicts ?? {}) }
    if (verdict === null) delete verdicts[profileId]
    else verdicts[profileId] = verdict
    if (Object.keys(verdicts).length === 0) {
      await db.audioReviews.delete(key)
    } else {
      await db.audioReviews.put({ key, verdicts, updatedAt: Date.now() })
    }
  })
}

export async function getAllReviews(db: LugatchaDB): Promise<AudioReview[]> {
  return db.audioReviews.toArray()
}

export async function clearReviews(db: LugatchaDB): Promise<void> {
  await db.audioReviews.clear()
}
