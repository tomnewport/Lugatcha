<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { loadLocations } from '@/db/locations'
import { useLiveQuery, db } from '@/db/useDb'
import type { Location, LocationProgress } from '@/db/types'
import LocationTile from '@/components/LocationTile.vue'

const locations = ref<Location[]>([])

onMounted(async () => {
  locations.value = await loadLocations()
})

const allProgress = useLiveQuery(
  () => db.locationProgress.toArray(),
  [] as LocationProgress[],
)

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
// it has at least one completed exercise.
const lockedMap = computed(() => {
  const map = new Map<string, boolean>()
  const locs = sortedLocations.value
  for (let i = 0; i < locs.length; i++) {
    if (i === 0) {
      map.set(locs[i].id, false)
    } else {
      const prev = locs[i - 1]
      const prevDone = (progressMap.value.get(prev.id)?.completedExercises.length ?? 0) > 0
      map.set(locs[i].id, !prevDone)
    }
  }
  return map
})
</script>

<template>
  <main class="home">
    <header class="home-header">
      <div class="home-header__ornament" aria-hidden="true">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="60" cy="60" r="8" fill="currentColor" />
          <g stroke="currentColor" stroke-width="1.5" fill="none">
            <line x1="60" y1="5"   x2="60" y2="20"  />
            <line x1="60" y1="100" x2="60" y2="115" />
            <line x1="5"  y1="60"  x2="20" y2="60"  />
            <line x1="100" y1="60" x2="115" y2="60" />
            <line x1="21" y1="21" x2="31" y2="31"   />
            <line x1="89" y1="89" x2="99" y2="99"   />
            <line x1="99" y1="21" x2="89" y2="31"   />
            <line x1="21" y1="99" x2="31" y2="89"   />
          </g>
          <g fill="currentColor">
            <circle cx="60"  cy="5"   r="3" />
            <circle cx="60"  cy="115" r="3" />
            <circle cx="5"   cy="60"  r="3" />
            <circle cx="115" cy="60"  r="3" />
            <circle cx="21"  cy="21"  r="3" />
            <circle cx="99"  cy="99"  r="3" />
            <circle cx="99"  cy="21"  r="3" />
            <circle cx="21"  cy="99"  r="3" />
          </g>
        </svg>
      </div>
      <h1 class="home-header__title">Lugʻatcha</h1>
      <p class="home-header__subtitle">O'zbekcha o'rganamiz</p>
    </header>

    <div v-if="sortedLocations.length" class="city-grid" role="list">
      <LocationTile
        v-for="loc in sortedLocations"
        :key="loc.id"
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
