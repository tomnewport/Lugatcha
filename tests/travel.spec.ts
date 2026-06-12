import { describe, it, expect, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { TravelPlace } from '@/db/types'
import { recordTravelVisit, loadVisitedPlaces, TRAVEL_RESET_AT } from '@/db/travel'

const DATA = join(__dirname, '..', 'public', 'data')
const places: TravelPlace[] = JSON.parse(readFileSync(join(DATA, 'travel.json'), 'utf8'))

describe('travel places', () => {
  it('each place is well-formed', () => {
    const ids = new Set<string>()
    for (const p of places) {
      expect(ids.has(p.id), `duplicate place ${p.id}`).toBe(false)
      ids.add(p.id)
      expect(p.name.en.length).toBeGreaterThan(0)
      expect(p.name.uz.length).toBeGreaterThan(0)
      expect(p.lat, `${p.id} lat`).toBeGreaterThan(37)
      expect(p.lat, `${p.id} lat`).toBeLessThan(46)
      expect(p.lon, `${p.id} lon`).toBeGreaterThan(55)
      expect(p.lon, `${p.id} lon`).toBeLessThan(74)
      expect(p.article.length, `${p.id} article`).toBeGreaterThan(0)
    }
  })

  it('place words are themed to their place with unique ids and valid levels', () => {
    const wordIds = new Set<string>()
    for (const p of places) {
      expect(p.words.length, `${p.id} words`).toBeGreaterThan(0)
      for (const w of p.words) {
        expect(wordIds.has(w.id), `duplicate word ${w.id}`).toBe(false)
        wordIds.add(w.id)
        expect(w.theme, `${w.id} theme`).toBe(p.id)
        expect([1, 2, 3], `${w.id} level`).toContain(w.level)
      }
    }
  })
})

describe('recordTravelVisit', () => {
  beforeEach(() => localStorage.clear())

  it('disables a place once visited', () => {
    recordTravelVisit('samarkand')
    expect(loadVisitedPlaces()).toEqual(['samarkand'])
  })

  it('does not double-count the same place', () => {
    recordTravelVisit('samarkand')
    recordTravelVisit('samarkand')
    expect(loadVisitedPlaces()).toEqual(['samarkand'])
  })

  it(`resets the disabled set after ${TRAVEL_RESET_AT} different places`, () => {
    recordTravelVisit('samarkand')
    recordTravelVisit('bukhara')
    expect(loadVisitedPlaces()).toHaveLength(2)
    recordTravelVisit('khiva') // third distinct visit triggers the reset
    expect(loadVisitedPlaces()).toEqual([])
  })
})
