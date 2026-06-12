import type { TravelPlace } from './types'

const base = import.meta.env.BASE_URL
let cached: TravelPlace[] | null = null

export async function loadTravelPlaces(): Promise<TravelPlace[]> {
  if (cached) return cached
  const res = await fetch(`${base}data/travel.json`)
  if (!res.ok) throw new Error(`Failed to fetch travel places (${res.status})`)
  cached = (await res.json()) as TravelPlace[]
  return cached
}

export async function getTravelPlace(id: string): Promise<TravelPlace | undefined> {
  const places = await loadTravelPlaces()
  return places.find((p) => p.id === id)
}

// ---------------------------------------------------------------------------
// "Disabled once clicked" — a pin you've just visited is greyed out, and you
// must visit three different places before the set resets and all reopen.
// Lightweight gameplay state, so it lives in localStorage (like lastTried).
// ---------------------------------------------------------------------------

const VISITED_KEY = 'lugatcha.travelVisited'
/** Visit this many distinct places and the disabled set resets to empty. */
export const TRAVEL_RESET_AT = 3

export function loadVisitedPlaces(): string[] {
  try {
    const raw = localStorage.getItem(VISITED_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? (parsed as string[]) : []
  } catch {
    return []
  }
}

function saveVisitedPlaces(ids: string[]): void {
  try {
    localStorage.setItem(VISITED_KEY, JSON.stringify(ids))
  } catch {
    // private mode — the worst case is pins not staying disabled
  }
}

/**
 * Records a visit to a place and returns the new disabled set. Reaching the
 * reset threshold clears the set, so the places become available again.
 */
export function recordTravelVisit(id: string): string[] {
  const visited = loadVisitedPlaces()
  if (!visited.includes(id)) visited.push(id)
  const next = visited.length >= TRAVEL_RESET_AT ? [] : visited
  saveVisitedPlaces(next)
  return next
}
