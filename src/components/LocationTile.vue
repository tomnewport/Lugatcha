<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import type { Location, LocationProgress } from '@/db/types'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{
  location: Location
  progress: LocationProgress | undefined
  locked: boolean
  exerciseEmoji?: string
  seenWords?: number
  totalWords?: number
  knownWords?: number
}>()

const router = useRouter()
const settings = useSettingsStore()

const primaryName = computed(() =>
  settings.labelLanguage === 'uz' ? props.location.name.uz : props.location.name.en,
)
const secondaryName = computed(() =>
  settings.labelLanguage === 'uz' ? props.location.name.en : props.location.name.uz,
)

const RADIUS = 18
const CIRCUMFERENCE = 2 * Math.PI * RADIUS

const completedCount = computed(() => props.progress?.completedExercises.length ?? 0)
const isComplete = computed(() => completedCount.value >= 6)

const seenFraction = computed(() => {
  if (!props.totalWords) return 0
  return Math.min(1, (props.seenWords ?? 0) / props.totalWords)
})
const knownFraction = computed(() => {
  if (!props.totalWords) return 0
  return Math.min(1, (props.knownWords ?? 0) / props.totalWords)
})
const seenDashOffset = computed(() => CIRCUMFERENCE * (1 - seenFraction.value))
const knownDashOffset = computed(() => CIRCUMFERENCE * (1 - knownFraction.value))

function navigate() {
  if (!props.locked) {
    router.push(`/location/${props.location.id}`)
  }
}
</script>

<template>
  <button
    class="tile"
    :class="{
      'tile--locked': locked,
      'tile--started': completedCount > 0 && !isComplete,
      'tile--complete': isComplete,
    }"
    :disabled="locked"
    :aria-label="`${location.name.en}${locked ? ', locked' : ''}`"
    @click="navigate"
  >
    <div class="tile__ring-wrap" aria-hidden="true">
      <svg class="tile__svg" viewBox="0 0 44 44">
        <circle cx="22" cy="22" :r="RADIUS" class="ring-track" fill="none" stroke-width="3" />
        <circle
          v-if="seenFraction > 0"
          cx="22"
          cy="22"
          :r="RADIUS"
          class="ring-seen"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="seenDashOffset"
          transform="rotate(-90 22 22)"
        />
        <circle
          v-if="knownFraction > 0"
          cx="22"
          cy="22"
          :r="RADIUS"
          class="ring-known"
          fill="none"
          stroke-width="3"
          stroke-linecap="round"
          :stroke-dasharray="CIRCUMFERENCE"
          :stroke-dashoffset="knownDashOffset"
          transform="rotate(-90 22 22)"
        />
      </svg>

      <!-- Lock icon -->
      <svg
        v-if="locked"
        class="tile__icon tile__icon--lock"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="1.5"
        aria-hidden="true"
      >
        <rect x="2" y="7" width="12" height="8" rx="2" />
        <path d="M5 7V5a3 3 0 0 1 6 0v2" stroke-linecap="round" />
      </svg>

      <!-- Complete icon -->
      <svg
        v-else-if="isComplete"
        class="tile__icon tile__icon--check"
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M2.5 8l4 4 7-7" stroke-linecap="round" stroke-linejoin="round" />
      </svg>

      <!-- Exercise emoji chip or initial letter -->
      <span v-else class="tile__icon tile__icon--letter" aria-hidden="true">
        {{ exerciseEmoji ?? location.name.en.charAt(0) }}
      </span>
    </div>

    <span class="tile__name" :lang="settings.labelLanguage === 'uz' ? 'uz' : undefined">{{
      primaryName
    }}</span>
    <span class="tile__name-uz" :lang="settings.labelLanguage === 'uz' ? undefined : 'uz'">{{
      secondaryName
    }}</span>
  </button>
</template>

<style scoped>
.tile {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 10px 4px 8px;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
  box-shadow: var(--shadow-sm);
  width: 100%;
  min-width: 0;
  text-align: center;
  -webkit-tap-highlight-color: transparent;
}

.tile:not(:disabled):hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-md);
}

.tile:not(:disabled):active {
  transform: translateY(0);
}

.tile--locked {
  opacity: 0.5;
  cursor: default;
  background: var(--color-bg);
}

.tile--complete {
  border-color: var(--color-gold);
  background: #fffcf0;
}

/* Ring wrapper */
.tile__ring-wrap {
  position: relative;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
}

.tile__svg {
  width: 44px;
  height: 44px;
}

.ring-track {
  stroke: var(--color-border);
}

.ring-seen {
  stroke: var(--color-gold);
  opacity: 0.5;
  transition: stroke-dashoffset 0.35s ease;
}

.ring-known {
  stroke: var(--color-primary);
  transition: stroke-dashoffset 0.35s ease;
}

/* Centre icons */
.tile__icon {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: auto;
}

.tile__icon--lock {
  width: 14px;
  height: 14px;
  color: var(--color-text-muted);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  position: absolute;
}

.tile__icon--check {
  width: 16px;
  height: 16px;
  color: var(--color-gold);
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  position: absolute;
}

.tile__icon--letter {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
  line-height: 1;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  position: absolute;
}

/* Labels */
.tile__name {
  font-size: 0.65rem;
  font-weight: 600;
  color: var(--color-text);
  line-height: 1.2;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tile__name-uz {
  font-size: 0.58rem;
  color: var(--color-text-muted);
  line-height: 1.2;
  width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

</style>
