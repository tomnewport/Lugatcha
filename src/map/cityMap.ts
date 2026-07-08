/**
 * Geometry of the hand-drawn city map (home-city-map.webp).
 *
 * The illustration — not the location data's gridRow/gridCol — fixes where each
 * building sits, so these constants are tuned to the art and must be re-tuned if
 * it changes. HomeView uses them to place the tappable markers; LocationCrop
 * uses them to frame a close-up of a single building from the same image.
 */

/** Natural pixel dimensions of home-city-map.webp; sets the crop aspect ratio. */
export const MAP_ASPECT = 1122 / 1402

/** Marker centres as a percentage of the stage (width → cols, height → rows). */
export const MAP_COLUMNS = [26.8, 43.8, 60.8, 77.8]
export const MAP_ROWS = [28, 41.5, 55, 68.5, 82]
/** The marker's footprint, as a percentage of the stage. */
export const MAP_BLOCK = { w: 13.2, h: 9.2 }

/**
 * Where each location sits on the art. A location absent from this map has no
 * place on the illustration; callers report that rather than stacking markers.
 */
export const MAP_MARKERS: Record<string, { col: number; row: number }> = {
  'welcome-center': { col: 0, row: 0 },
  'police-station': { col: 1, row: 0 },
  'public-square': { col: 2, row: 0 },
  hospital: { col: 3, row: 0 },
  hotel: { col: 0, row: 1 },
  museum: { col: 1, row: 1 },
  'train-station': { col: 2, row: 1 },
  'metro-station': { col: 3, row: 1 },
  'bus-stop': { col: 0, row: 2 },
  'gift-shop': { col: 1, row: 2 },
  'grocery-store': { col: 2, row: 2 },
  library: { col: 3, row: 2 },
  restaurant: { col: 0, row: 3 },
  cafe: { col: 1, row: 3 },
  choyxona: { col: 2, row: 3 },
  bank: { col: 3, row: 3 },
  'mountain-park': { col: 0, row: 4 },
  airport: { col: 1, row: 4 },
  school: { col: 2, row: 4 },
  travel: { col: 3, row: 4 },
}

/** The marker's centre as { x, y } percentages of the stage, or null if unplaced. */
export function markerCentre(locationId: string): { x: number; y: number } | null {
  const marker = MAP_MARKERS[locationId]
  if (!marker) return null
  return { x: MAP_COLUMNS[marker.col], y: MAP_ROWS[marker.row] }
}

/** Absolute-position style for a tappable marker on the full stage. */
export function markerStyle(locationId: string) {
  const centre = markerCentre(locationId)
  if (!centre) return {}
  return {
    left: `${centre.x}%`,
    top: `${centre.y}%`,
    width: `${MAP_BLOCK.w}%`,
    height: `${MAP_BLOCK.h}%`,
  }
}

/**
 * Style for an `<img>` of the whole map, absolutely positioned inside a square
 * container so that the given location's marker sits dead centre, magnified by
 * `zoom`. Returns null when the location has no place on the art.
 *
 * The image is laid out at `zoom × container` width (height follows from the
 * art's aspect ratio); it is then offset so the marker's centre — a point at
 * (x%, y%) of the image — lands at the container's centre.
 */
export function cropImageStyle(
  locationId: string,
  zoom = 2.6,
): { width: string; left: string; top: string } | null {
  const centre = markerCentre(locationId)
  if (!centre) return null
  const left = (0.5 - (zoom * centre.x) / 100) * 100
  const top = (0.5 - ((zoom * centre.y) / 100) * (1 / MAP_ASPECT)) * 100
  return { width: `${zoom * 100}%`, left: `${left}%`, top: `${top}%` }
}
