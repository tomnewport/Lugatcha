<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { loadLocations } from '@/db/locations'
import { useLiveQuery, db } from '@/db/useDb'
import type { Location, LocationProgress } from '@/db/types'
import LocationTile from '@/components/LocationTile.vue'
import SchoolTile from '@/components/SchoolTile.vue'
import { useAudioReady } from '@/audio/offline'

const router = useRouter()
const { ready: audioReady } = useAudioReady()

const BANNER_KEY = 'lugatcha.audioBannerDismissed'
const bannerDismissed = ref(localStorage.getItem(BANNER_KEY) === 'true')
const showBanner = computed(() => !audioReady.value && !bannerDismissed.value)

function dismissBanner() {
  bannerDismissed.value = true
  try { localStorage.setItem(BANNER_KEY, 'true') } catch { /* private mode */ }
}

const locations = ref<Location[]>([])

onMounted(async () => {
  locations.value = await loadLocations()
})

const allProgress = useLiveQuery(() => db.locationProgress.toArray(), [] as LocationProgress[])

const progressMap = computed(() => {
  const map = new Map<string, LocationProgress>()
  for (const p of allProgress.value) map.set(p.locationId, p)
  return map
})

// Sorted by grid position: row-major order
const sortedLocations = computed(() =>
  [...locations.value].sort((a, b) =>
    a.gridRow !== b.gridRow ? a.gridRow - b.gridRow : a.gridCol - b.gridCol,
  ),
)

// First location always unlocked; each subsequent unlocks once the one before
// it has at least one completed exercise. The School is a meta tile: always
// unlocked and not part of the chain.
const lockedMap = computed(() => {
  const map = new Map<string, boolean>()
  const locs = sortedLocations.value.filter((l) => l.id !== 'school')
  for (let i = 0; i < locs.length; i++) {
    if (i === 0) {
      map.set(locs[i].id, false)
    } else {
      const prev = locs[i - 1]
      const prevDone = (progressMap.value.get(prev.id)?.completedExercises.length ?? 0) > 0
      map.set(locs[i].id, !prevDone)
    }
  }
  map.set('school', false)
  return map
})
</script>

<template>
  <main class="home">
    <RouterLink class="settings-link" to="/settings" :aria-label="audioReady ? 'Settings' : 'Settings — audio not yet downloaded'">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="1.8"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="3" />
        <path
          d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h.09a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h.09a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v.09a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"
        />
      </svg>
      <span v-if="!audioReady" class="settings-link__dot" aria-hidden="true" />
    </RouterLink>

    <header class="home-header">
      <div class="home-header__ornament" aria-hidden="true">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="60" cy="60" r="8" fill="currentColor" />
          <g stroke="currentColor" stroke-width="1.5" fill="none">
            <line x1="60" y1="5" x2="60" y2="20" />
            <line x1="60" y1="100" x2="60" y2="115" />
            <line x1="5" y1="60" x2="20" y2="60" />
            <line x1="100" y1="60" x2="115" y2="60" />
            <line x1="21" y1="21" x2="31" y2="31" />
            <line x1="89" y1="89" x2="99" y2="99" />
            <line x1="99" y1="21" x2="89" y2="31" />
            <line x1="21" y1="99" x2="31" y2="89" />
          </g>
          <g fill="currentColor">
            <circle cx="60" cy="5" r="3" />
            <circle cx="60" cy="115" r="3" />
            <circle cx="5" cy="60" r="3" />
            <circle cx="115" cy="60" r="3" />
            <circle cx="21" cy="21" r="3" />
            <circle cx="99" cy="99" r="3" />
            <circle cx="99" cy="21" r="3" />
            <circle cx="21" cy="99" r="3" />
          </g>
        </svg>
      </div>
      <h1 class="home-header__title">Lugʻatcha</h1>
      <p class="home-header__subtitle">O'zbekcha o'rganamiz</p>
    </header>

    <div v-if="showBanner" class="audio-banner">
      <div class="audio-banner__body">
        <p class="audio-banner__text">Download audio for the best experience — words and phrases spoken by a native-quality Uzbek voice.</p>
        <button class="btn btn--primary audio-banner__btn" type="button" @click="router.push('/settings')">Download audio</button>
      </div>
      <button class="audio-banner__close" type="button" aria-label="Dismiss" @click="dismissBanner">✕</button>
    </div>

    <div v-if="sortedLocations.length" class="city-grid" role="list">
      <template v-for="loc in sortedLocations" :key="loc.id">
        <SchoolTile
          v-if="loc.id === 'school'"
          role="listitem"
          :style="{ gridRow: loc.gridRow, gridColumn: loc.gridCol }"
        />
        <LocationTile
          v-else
          role="listitem"
          :location="loc"
          :progress="progressMap.get(loc.id)"
          :locked="lockedMap.get(loc.id) ?? true"
          :style="{
            gridRow: loc.gridRow,
            gridColumn: loc.gridCol,
            ...(loc.colSpan ? { gridColumn: `${loc.gridCol} / span ${loc.colSpan}` } : {}),
            ...(loc.rowSpan ? { gridRow: `${loc.gridRow} / span ${loc.rowSpan}` } : {}),
          }"
        />
      </template>
    </div>

    <p v-else class="home-loading" aria-live="polite">Loading city…</p>
  </main>
</template>

<style scoped>
.home {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1.25rem;
  padding: 1.25rem 1rem 2rem;
  background: var(--color-bg);
  position: relative;
}

.settings-link {
  position: absolute;
  top: 1rem;
  right: 1rem;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 38px;
  height: 38px;
  border: 1.5px solid var(--color-border);
  border-radius: 50%;
  background: var(--color-surface);
  color: var(--color-text-muted);
  box-shadow: var(--shadow-sm);
}

.settings-link svg {
  width: 19px;
  height: 19px;
}

.settings-link:hover {
  box-shadow: var(--shadow-md);
  color: var(--color-primary);
}

.settings-link__dot {
  position: absolute;
  top: 2px;
  right: 2px;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--color-terracotta);
  border: 2px solid var(--color-bg);
}

.audio-banner {
  display: flex;
  align-items: flex-start;
  gap: 0.75rem;
  width: 100%;
  max-width: 520px;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-left: 4px solid var(--color-primary);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.audio-banner__body {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
}

.audio-banner__text {
  margin: 0;
  font-size: 0.85rem;
  color: var(--color-text-muted);
  line-height: 1.4;
}

.audio-banner__btn {
  align-self: flex-start;
  font-size: 0.85rem;
  padding: 0.4rem 0.9rem;
}

.audio-banner__close {
  flex-shrink: 0;
  background: none;
  border: none;
  color: var(--color-text-muted);
  font-size: 0.85rem;
  padding: 0.1rem 0.25rem;
  cursor: pointer;
  line-height: 1;
}

/* Header */
.home-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  text-align: center;
}

.home-header__ornament {
  width: 52px;
  height: 52px;
  color: var(--color-gold);
  margin-bottom: 0.25rem;
}

.home-header__title {
  font-size: clamp(1.6rem, 6vw, 2.2rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
  letter-spacing: -0.02em;
}

.home-header__subtitle {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  margin: 0;
}

/* 4-column city grid */
.city-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 8px;
  width: 100%;
  max-width: 520px;
}

.home-loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
}
</style>
