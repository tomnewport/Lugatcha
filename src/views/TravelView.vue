<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadTravelPlaces, loadVisitedPlaces, TRAVEL_RESET_AT } from '@/db/travel'
import type { TravelPlace, UzbekMap } from '@/db/types'
import { useContentLang } from '@/i18n/content'

const base = import.meta.env.BASE_URL
const router = useRouter()
const { name, pick } = useContentLang()

const places = ref<TravelPlace[]>([])
const geo = ref<UzbekMap | null>(null)
const visited = ref<string[]>([])
const selectedId = ref<string | null>(null)

onMounted(async () => {
  visited.value = loadVisitedPlaces()
  const [p, g] = await Promise.all([
    loadTravelPlaces(),
    fetch(`${base}data/uzbekistan.geo.json`).then((r) => (r.ok ? r.json() : null)),
  ])
  places.value = p
  geo.value = g
})

// --- Projection: equirectangular, longitude squeezed by cos(midLat) so the
// country isn't stretched, fit to a 1000-wide viewBox. -------------------
const W = 1000
const PAD = 40

const proj = computed(() => {
  const g = geo.value
  if (!g) return null
  let minLon = 999, maxLon = -999, minLat = 999, maxLat = -999
  const scan = (c: unknown): void => {
    if (typeof (c as number[])[0] === 'number') {
      const [lon, lat] = c as number[]
      minLon = Math.min(minLon, lon); maxLon = Math.max(maxLon, lon)
      minLat = Math.min(minLat, lat); maxLat = Math.max(maxLat, lat)
    } else (c as unknown[]).forEach(scan)
  }
  scan(g.border.coordinates)
  const k = Math.cos((((minLat + maxLat) / 2) * Math.PI) / 180)
  const scale = (W - 2 * PAD) / ((maxLon - minLon) * k)
  const H = (maxLat - minLat) * scale + 2 * PAD
  const project = (lon: number, lat: number): [number, number] => [
    PAD + (lon - minLon) * k * scale,
    PAD + (maxLat - lat) * scale,
  ]
  return { project, H }
})

const viewBox = computed(() => `0 0 ${W} ${proj.value ? proj.value.H : 620}`)

function ringsToPath(rings: number[][][], project: (lon: number, lat: number) => [number, number]): string {
  return rings
    .map((ring) => {
      const pts = ring.map((c) => {
        const [x, y] = project(c[0], c[1])
        return `${x.toFixed(1)} ${y.toFixed(1)}`
      })
      return 'M' + pts.join(' L') + 'Z'
    })
    .join(' ')
}

const borderPath = computed(() => {
  const p = proj.value, g = geo.value
  if (!p || !g) return ''
  const polys = (g.border.type === 'MultiPolygon'
    ? (g.border.coordinates as number[][][][])
    : [g.border.coordinates as number[][][]])
  return polys.map((poly) => ringsToPath(poly, p.project)).join(' ')
})

const railPaths = computed(() => {
  const p = proj.value, g = geo.value
  if (!p || !g) return [] as string[]
  return g.railways.map(
    (line) =>
      'M' +
      line.map((c) => { const [x, y] = p.project(c[0], c[1]); return `${x.toFixed(1)} ${y.toFixed(1)}` }).join(' L'),
  )
})

const pins = computed(() => {
  const p = proj.value
  if (!p) return [] as { place: TravelPlace; x: number; y: number }[]
  return places.value.map((place) => {
    const [x, y] = p.project(place.lon, place.lat)
    return { place, x, y }
  })
})

const towns = computed(() => {
  const p = proj.value, g = geo.value
  if (!p || !g) return [] as { name: string; x: number; y: number; label: boolean }[]
  const pinXY = pins.value.map((pn) => [pn.x, pn.y])
  const near = (x: number, y: number) => pinXY.some(([px, py]) => Math.hypot(px - x, py - y) < 16)
  return g.towns
    .map((t) => {
      const [x, y] = p.project(t.lon, t.lat)
      return { name: t.name, x, y, label: t.rank <= 6 }
    })
    .filter((t) => !near(t.x, t.y))
})

const isDisabled = (id: string) => visited.value.includes(id)
const selected = computed(() => places.value.find((p) => p.id === selectedId.value) ?? null)
const remainingToReset = computed(() => Math.max(0, TRAVEL_RESET_AT - visited.value.length))

function tapPin(place: TravelPlace) {
  if (isDisabled(place.id)) return
  selectedId.value = selectedId.value === place.id ? null : place.id
}
</script>

<template>
  <main class="travel">
    <button class="back-btn" :aria-label="$t('common.backToCity')" type="button" @click="router.push('/')">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ $t('common.city') }}
    </button>

    <header class="travel-header">
      <h1 class="travel-header__title">🧳 {{ $t('travel.title') }}</h1>
      <p class="travel-header__subtitle" lang="uz">{{ $t('travel.subtitle') }}</p>
      <p class="travel-header__blurb">
        {{ $t('travel.blurb') }}
        <template v-if="remainingToReset > 0 && visited.length > 0">
          {{ $t('travel.refresh', { count: remainingToReset }) }}
        </template>
      </p>
    </header>

    <div class="map-wrap">
      <svg class="map" :viewBox="viewBox" role="group" :aria-label="$t('travel.mapLabel')">
        <defs>
          <radialGradient id="pin" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#e9905f" />
            <stop offset="100%" stop-color="#c2522a" />
          </radialGradient>
          <radialGradient id="pinSel" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#f0c75a" />
            <stop offset="100%" stop-color="#c9a84c" />
          </radialGradient>
          <radialGradient id="pinOff" cx="38%" cy="30%" r="75%">
            <stop offset="0%" stop-color="#cfcabb" />
            <stop offset="100%" stop-color="#a39d8d" />
          </radialGradient>
          <clipPath id="land-clip"><path :d="borderPath" /></clipPath>
        </defs>

        <!-- Country landmass -->
        <path
          class="land"
          :d="borderPath"
          fill="#e8d4a4"
          stroke="#b9954f"
          stroke-width="3.5"
          stroke-linejoin="round"
          fill-rule="evenodd"
        />

        <!-- Railways, clipped to the border -->
        <g clip-path="url(#land-clip)" class="rails">
          <path v-for="(d, i) in railPaths" :key="i" :d="d" fill="none" />
        </g>

        <!-- Towns -->
        <g class="towns">
          <g v-for="t in towns" :key="t.name">
            <circle :cx="t.x" :cy="t.y" r="3" />
            <text v-if="t.label" :x="t.x + 5" :y="t.y + 3.5" class="town-label">{{ t.name }}</text>
          </g>
        </g>

        <!-- Travel pins -->
        <g
          v-for="pin in pins"
          :key="pin.place.id"
          class="pin"
          :class="{ 'pin--disabled': isDisabled(pin.place.id), 'pin--selected': selectedId === pin.place.id }"
          :transform="`translate(${pin.x} ${pin.y})`"
          role="button"
          tabindex="0"
          :aria-label="isDisabled(pin.place.id) ? $t('travel.visited', { name: name(pin.place.name) }) : name(pin.place.name)"
          @click="tapPin(pin.place)"
          @keydown.enter.prevent="tapPin(pin.place)"
        >
          <g class="pin__lift">
            <ellipse class="pin__shadow" cx="0" cy="3" rx="11" ry="3.5" />
            <path
              class="pin__body"
              d="M0,0 C-10,-17 -17,-23 -17,-35 a17,17 0 1,1 34,0 C17,-23 10,-17 0,0 Z"
              :fill="isDisabled(pin.place.id) ? 'url(#pinOff)' : selectedId === pin.place.id ? 'url(#pinSel)' : 'url(#pin)'"
              stroke="rgba(0,0,0,0.2)"
              stroke-width="1.2"
            />
            <circle cx="0" cy="-35" r="6.5" fill="#fff" opacity="0.92" />
            <path
              v-if="isDisabled(pin.place.id)"
              d="M-3 -35 l2.4 2.4 l4.6 -4.8"
              fill="none"
              stroke="#1a5e52"
              stroke-width="2"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>

          <g v-if="selectedId === pin.place.id" class="pin__label">
            <rect :x="-name(pin.place.name).length * 4.4 - 8" y="-74" :width="name(pin.place.name).length * 8.8 + 16" height="22" rx="11" fill="#1a1a1a" />
            <text x="0" y="-59" text-anchor="middle" class="pin__label-text">{{ name(pin.place.name) }}</text>
          </g>
        </g>
      </svg>
    </div>

    <!-- Action card for the selected place -->
    <Transition name="card-rise">
      <div v-if="selected" class="place-card">
        <div class="place-card__head">
          <div>
            <h2 class="place-card__name">{{ name(selected.name) }}</h2>
            <p class="place-card__name-uz" lang="uz">{{ selected.name.uz }}</p>
          </div>
          <button class="place-card__close" type="button" :aria-label="$t('common.close')" @click="selectedId = null">✕</button>
        </div>
        <p class="place-card__teaser">{{ pick(selected.article[0], selected.articleRu?.[0]) }}</p>
        <button class="btn btn--primary" type="button" @click="router.push(`/travel/${selected.id}`)">
          {{ $t('travel.readPractise') }}
        </button>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.travel {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1rem 4rem;
  gap: 1rem;
  background: var(--color-bg);
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.travel-header {
  text-align: center;
}

.travel-header__title {
  font-size: clamp(1.5rem, 5vw, 2rem);
  font-weight: 800;
  color: var(--color-terracotta);
  margin: 0;
}

.travel-header__subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.1rem 0 0;
}

.travel-header__blurb {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.5rem auto 0;
  max-width: 420px;
  line-height: 1.4;
}

.map-wrap {
  width: 100%;
  max-width: 760px;
  margin: 0 auto;
}

.map {
  width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 6px 16px rgb(0 0 0 / 0.12));
}

.rails path {
  stroke: #8a7a52;
  stroke-width: 1.4;
  stroke-dasharray: 5 4;
  opacity: 0.7;
}

.towns circle {
  fill: #6b6559;
  stroke: #fff;
  stroke-width: 1;
}

.town-label {
  fill: #5a5346;
  font-size: 11px;
  font-weight: 600;
  font-family: var(--font-sans, sans-serif);
  paint-order: stroke;
  stroke: rgba(245, 240, 232, 0.85);
  stroke-width: 2.5px;
}

.pin {
  cursor: pointer;
  outline: none;
  -webkit-tap-highlight-color: transparent;
}

.pin__shadow {
  fill: rgb(0 0 0 / 0.22);
}

/* Lift on hover/focus/select — translate only, so it never drifts sideways */
.pin__lift {
  transition: transform 0.15s ease;
}

.pin:hover:not(.pin--disabled) .pin__lift,
.pin:focus-visible:not(.pin--disabled) .pin__lift,
.pin--selected .pin__lift {
  transform: translateY(-5px);
}

.pin:focus-visible .pin__body {
  stroke: var(--color-primary);
  stroke-width: 2.5;
}

.pin--disabled {
  cursor: default;
}

.pin--disabled .pin__shadow {
  fill: rgb(0 0 0 / 0.1);
}

.pin__label-text {
  fill: #fff;
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-sans, sans-serif);
}

.place-card {
  position: sticky;
  bottom: 0;
  width: 100%;
  max-width: 520px;
  margin: auto auto 0;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-lg);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
}

.place-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.5rem;
}

.place-card__name {
  font-size: 1.2rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.place-card__name-uz {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0.1rem 0 0;
}

.place-card__close {
  width: 30px;
  height: 30px;
  flex-shrink: 0;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
}

.place-card__teaser {
  font-size: 0.9rem;
  color: var(--color-text);
  line-height: 1.5;
  margin: 0;
}

.card-rise-enter-active {
  transition:
    transform 0.25s ease,
    opacity 0.25s ease;
}

.card-rise-enter-from {
  transform: translateY(16px);
  opacity: 0;
}
</style>
