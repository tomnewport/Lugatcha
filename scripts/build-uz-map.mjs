// Builds public/data/uzbekistan.geo.json from Natural Earth source layers:
// an accurate country border, the railway lines inside it, and town points.
// Source GeoJSON is downloaded (and cached in /tmp) on first run; the result
// is committed so the app stays fully offline. Re-run to refresh the data.
import { readFileSync, writeFileSync, existsSync } from 'node:fs'

const SRC = '/tmp'
const NE = 'https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson'
const SOURCES = {
  ne_admin0: `${NE}/ne_50m_admin_0_countries.geojson`,
  ne_places: `${NE}/ne_10m_populated_places.geojson`,
  ne_rail: `${NE}/ne_10m_railroads.geojson`,
}

async function load(name) {
  const path = `${SRC}/${name}.json`
  if (!existsSync(path)) {
    process.stdout.write(`fetching ${name}… `)
    const res = await fetch(SOURCES[name])
    if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`)
    writeFileSync(path, await res.text())
    console.log('done')
  }
  return JSON.parse(readFileSync(path, 'utf8'))
}

const admin0 = await load('ne_admin0')
const places = await load('ne_places')
const rail = await load('ne_rail')

const r = (n) => Math.round(n * 1000) / 1000

// --- Border -------------------------------------------------------------
const country = admin0.features.find(
  (f) => f.properties.ADMIN === 'Uzbekistan' || f.properties.NAME === 'Uzbekistan',
)
if (!country) throw new Error('Uzbekistan not found in admin0')
const border = country.geometry // Polygon | MultiPolygon
const round = (coords) =>
  Array.isArray(coords[0])
    ? coords.map(round)
    : [r(coords[0]), r(coords[1])]
border.coordinates = round(border.coordinates)

// Bounding box of the border (with a little padding) for filtering.
let minLon = 999, minLat = 999, maxLon = -999, maxLat = -999
const walk = (c) => {
  if (typeof c[0] === 'number') {
    minLon = Math.min(minLon, c[0]); maxLon = Math.max(maxLon, c[0])
    minLat = Math.min(minLat, c[1]); maxLat = Math.max(maxLat, c[1])
  } else c.forEach(walk)
}
walk(border.coordinates)
const pad = 0.2
const inBox = ([lon, lat]) =>
  lon >= minLon - pad && lon <= maxLon + pad && lat >= minLat - pad && lat <= maxLat + pad

// --- Railways: keep runs of vertices that fall inside the bbox ----------
const railways = []
for (const f of rail.features) {
  const lines = f.geometry.type === 'MultiLineString' ? f.geometry.coordinates : [f.geometry.coordinates]
  for (const line of lines) {
    let run = []
    for (const pt of line) {
      if (inBox(pt)) run.push([r(pt[0]), r(pt[1])])
      else if (run.length) { if (run.length > 1) railways.push(run); run = [] }
    }
    if (run.length > 1) railways.push(run)
  }
}

// --- Towns: populated places inside Uzbekistan, the most prominent first -
const towns = places.features
  .filter((f) => f.properties.ADM0NAME === 'Uzbekistan')
  .map((f) => ({
    name: f.properties.NAME,
    lon: r(f.geometry.coordinates[0]),
    lat: r(f.geometry.coordinates[1]),
    rank: f.properties.SCALERANK ?? 10,
  }))
  .sort((a, b) => a.rank - b.rank)
  .slice(0, 28)

const out = { border, railways, towns }
writeFileSync('public/data/uzbekistan.geo.json', JSON.stringify(out))
console.log(
  `border pts ~${JSON.stringify(border.coordinates).match(/,/g).length}, ` +
    `railway lines ${railways.length}, towns ${towns.length}, ` +
    `bbox lon ${r(minLon)}..${r(maxLon)} lat ${r(minLat)}..${r(maxLat)}`,
)
