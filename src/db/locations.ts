import { load } from 'js-yaml'
import locationsRaw from '../data/locations.yaml?raw'
import type { Location } from './types'

export const locations: Location[] = load(locationsRaw) as Location[]

export function getLocation(id: string): Location | undefined {
  return locations.find((l) => l.id === id)
}
