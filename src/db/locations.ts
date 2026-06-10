import type { Location } from './types'

const base = import.meta.env.BASE_URL
let cached: Location[] | null = null

export async function loadLocations(): Promise<Location[]> {
  if (cached) return cached
  const res = await fetch(`${base}data/locations.json`)
  if (!res.ok) throw new Error(`Failed to fetch locations (${res.status})`)
  cached = (await res.json()) as Location[]
  return cached
}

export async function getLocation(id: string): Promise<Location | undefined> {
  const locs = await loadLocations()
  return locs.find((l) => l.id === id)
}
