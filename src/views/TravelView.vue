<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadTravelPlaces, loadVisitedPlaces, TRAVEL_RESET_AT } from '@/db/travel'
import type { TravelPlace } from '@/db/types'

const router = useRouter()

const places = ref<TravelPlace[]>([])
const visited = ref<string[]>([])
const selectedId = ref<string | null>(null)

onMounted(async () => {
  places.value = await loadTravelPlaces()
  visited.value = loadVisitedPlaces()
})

const isDisabled = (id: string) => visited.value.includes(id)
const selected = computed(() => places.value.find((p) => p.id === selectedId.value) ?? null)
const remainingToReset = computed(() => Math.max(0, TRAVEL_RESET_AT - visited.value.length))

function tapPin(place: TravelPlace) {
  if (isDisabled(place.id)) return
  selectedId.value = selectedId.value === place.id ? null : place.id
}

function visit(place: TravelPlace) {
  router.push(`/travel/${place.id}`)
}
</script>

<template>
  <main class="travel">
    <button class="back-btn" aria-label="Back to city map" type="button" @click="router.push('/')">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      City
    </button>

    <header class="travel-header">
      <h1 class="travel-header__title">🧳 Travel Agency</h1>
      <p class="travel-header__subtitle" lang="uz">Sayohat agentligi</p>
      <p class="travel-header__blurb">
        Tap a place on the map to read about it and practise its words.
        <template v-if="remainingToReset > 0 && visited.length > 0">
          Visit {{ remainingToReset }} more to refresh the map.
        </template>
      </p>
    </header>

    <div class="map-wrap">
      <svg class="map" viewBox="0 0 1000 620" role="group" aria-label="Map of Uzbekistan">
        <defs>
          <radialGradient id="land" cx="40%" cy="35%" r="80%">
            <stop offset="0%" stop-color="#f3e2bd" />
            <stop offset="100%" stop-color="#e4c98f" />
          </radialGradient>
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
        </defs>

        <!-- Chunky cartoon outline of Uzbekistan -->
        <path
          class="land"
          d="M 120 170 Q 140 80 260 90 Q 380 100 470 150 Q 560 120 640 150 Q 700 110 780 160
             Q 880 150 980 250 Q 1000 320 920 380 Q 840 410 760 380 Q 700 430 600 470
             Q 480 510 380 480 Q 300 500 250 430 Q 180 440 160 360 Q 110 320 150 260
             Q 100 210 120 170 Z"
          fill="url(#land)"
          stroke="#b9954f"
          stroke-width="6"
          stroke-linejoin="round"
        />

        <!-- Pins -->
        <g
          v-for="place in places"
          :key="place.id"
          class="pin"
          :class="{ 'pin--disabled': isDisabled(place.id), 'pin--selected': selectedId === place.id }"
          :transform="`translate(${place.mapX} ${place.mapY})`"
          role="button"
          tabindex="0"
          :aria-label="isDisabled(place.id) ? `${place.name.en} (visited)` : place.name.en"
          @click="tapPin(place)"
          @keydown.enter.prevent="tapPin(place)"
        >
          <ellipse class="pin__shadow" cx="0" cy="3" rx="15" ry="5" />
          <g class="pin__body">
            <path
              d="M0,0 C-13,-22 -22,-30 -22,-46 a22,22 0 1,1 44,0 C22,-30 13,-22 0,0 Z"
              :fill="isDisabled(place.id) ? 'url(#pinOff)' : selectedId === place.id ? 'url(#pinSel)' : 'url(#pin)'"
              stroke="rgba(0,0,0,0.18)"
              stroke-width="1.5"
            />
            <circle cx="0" cy="-46" r="8.5" fill="#fff" opacity="0.92" />
            <path
              v-if="isDisabled(place.id)"
              d="M-4 -46 l3 3 l6 -6"
              fill="none"
              stroke="#1a5e52"
              stroke-width="2.4"
              stroke-linecap="round"
              stroke-linejoin="round"
            />
          </g>

          <!-- Name revealed on tap -->
          <g v-if="selectedId === place.id" class="pin__label">
            <rect x="-66" y="-92" width="132" height="26" rx="13" fill="#1a1a1a" />
            <text x="0" y="-74" text-anchor="middle" class="pin__label-text">{{ place.name.en }}</text>
          </g>
        </g>
      </svg>
    </div>

    <!-- Action card for the selected place -->
    <Transition name="card-rise">
      <div v-if="selected" class="place-card">
        <div class="place-card__head">
          <div>
            <h2 class="place-card__name">{{ selected.name.en }}</h2>
            <p class="place-card__name-uz" lang="uz">{{ selected.name.uz }}</p>
          </div>
          <button class="place-card__close" type="button" aria-label="Close" @click="selectedId = null">✕</button>
        </div>
        <p class="place-card__teaser">{{ selected.article[0] }}</p>
        <button class="btn btn--primary" type="button" @click="visit(selected)">Read &amp; practise</button>
      </div>
    </Transition>
  </main>
</template>

<style scoped>
.travel {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1rem 2rem;
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
  max-width: 720px;
  margin: 0 auto;
}

.map {
  width: 100%;
  height: auto;
  display: block;
  filter: drop-shadow(0 6px 16px rgb(0 0 0 / 0.12));
}

.land {
  transition: fill 0.3s ease;
}

.pin {
  cursor: pointer;
  -webkit-tap-highlight-color: transparent;
}

.pin__shadow {
  fill: rgb(0 0 0 / 0.22);
}

.pin__body {
  transition: transform 0.15s ease;
  transform-origin: center bottom;
}

.pin:hover:not(.pin--disabled) .pin__body {
  transform: translateY(-4px) scale(1.06);
}

.pin--selected .pin__body {
  transform: translateY(-4px) scale(1.12);
}

.pin--disabled {
  cursor: default;
}

.pin--disabled .pin__shadow {
  fill: rgb(0 0 0 / 0.1);
}

.pin__label-text {
  fill: #fff;
  font-size: 15px;
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
