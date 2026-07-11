<script setup lang="ts">
import { computed } from 'vue'
import type { Location, ExerciseType } from '@/db/types'
import {
  buildPotluck,
  exerciseLabel,
  exerciseDescription,
  EXERCISE_EMOJI,
  type LocationStats,
} from '@/exercises/potluck'
import { useContentLang } from '@/i18n/content'
import LocationCrop from '@/components/LocationCrop.vue'

/**
 * The chooser shown when a location is opened from the city map: everything the
 * place offers right now, how far along it is, and a suggested next activity —
 * so the learner can pick what to do rather than being dropped straight into
 * whatever the app would have auto-launched.
 */
const props = defineProps<{
  location: Location
  stats: LocationStats
  /** The activity the app recommends next; rendered as the primary card. */
  suggested: ExerciseType | null
}>()

const emit = defineEmits<{
  select: [ExerciseType]
  back: []
}>()

const { name } = useContentLang()

const activities = computed(() => buildPotluck(props.stats))

/** The suggested activity, but only when it's actually available to launch. */
const suggestedActivity = computed(() =>
  props.suggested
    ? activities.value.find((a) => a.type === props.suggested && a.state === 'available') ?? null
    : null,
)

/** Everything except the suggested one — the "or do something else" list. */
const otherActivities = computed(() =>
  activities.value.filter((a) => a.type !== suggestedActivity.value?.type),
)

const anyAvailable = computed(() => activities.value.some((a) => a.state === 'available'))

function emoji(type: ExerciseType): string {
  return EXERCISE_EMOJI[type]
}
</script>

<template>
  <main class="menu">
    <button class="back-btn" :aria-label="$t('common.backToCity')" type="button" @click="emit('back')">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      {{ $t('common.city') }}
    </button>

    <header class="menu__header">
      <LocationCrop
        class="menu__crop"
        :location-id="location.id"
        :zoom="2.9"
        :fallback-label="name(location.name).charAt(0)"
      />
      <div class="menu__titles">
        <h1 class="menu__name" lang="uz">{{ location.name.uz }}</h1>
        <p class="menu__name-base">{{ name(location.name) }}</p>
        <p v-if="stats.totalWords > 0" class="menu__progress">
          {{ $t('locationMenu.wordsLearned', { known: stats.knownWords, total: stats.totalWords }) }}
        </p>
      </div>
    </header>

    <!-- Suggested next activity -->
    <template v-if="suggestedActivity">
      <p class="menu__eyebrow">{{ $t('locationMenu.suggested') }}</p>
      <button
        class="activity activity--primary"
        type="button"
        @click="emit('select', suggestedActivity.type)"
      >
        <span class="activity__emoji" aria-hidden="true">{{ emoji(suggestedActivity.type) }}</span>
        <span class="activity__body">
          <span class="activity__label">{{ exerciseLabel(suggestedActivity.type) }}</span>
          <span class="activity__desc">{{ exerciseDescription(suggestedActivity.type) }}</span>
        </span>
        <span v-if="suggestedActivity.done" class="activity__done" aria-hidden="true">✓</span>
        <span class="activity__chevron" aria-hidden="true">›</span>
      </button>
    </template>

    <!-- Everything else on offer here -->
    <p class="menu__eyebrow">{{ suggestedActivity ? $t('locationMenu.orChoose') : $t('locationMenu.choose') }}</p>
    <ul class="activity-list">
      <li v-for="a in otherActivities" :key="a.type">
        <button
          class="activity"
          :class="{ 'activity--locked': a.state === 'locked' }"
          type="button"
          :disabled="a.state === 'locked'"
          @click="a.state === 'available' && emit('select', a.type)"
        >
          <span class="activity__emoji" aria-hidden="true">{{ a.state === 'locked' ? '🔒' : emoji(a.type) }}</span>
          <span class="activity__body">
            <span class="activity__label">{{ exerciseLabel(a.type) }}</span>
            <span class="activity__desc">{{ a.state === 'locked' ? a.hint : exerciseDescription(a.type) }}</span>
          </span>
          <span v-if="a.done" class="activity__done" aria-hidden="true">✓</span>
          <span v-else-if="a.state === 'available'" class="activity__chevron" aria-hidden="true">›</span>
        </button>
      </li>
    </ul>

    <p v-if="!anyAvailable" class="menu__nothing">{{ $t('location.nothingNew') }}</p>
  </main>
</template>

<style scoped>
.menu {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 0.85rem;
  padding: 1rem 1.25rem calc(2rem + env(safe-area-inset-bottom));
  background: var(--color-bg);
  width: 100%;
  max-width: 520px;
  margin: 0 auto;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  align-self: flex-start;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.back-btn:hover {
  box-shadow: var(--shadow-md);
}

.menu__header {
  display: flex;
  align-items: center;
  gap: 0.9rem;
}

.menu__crop {
  width: 84px;
  flex-shrink: 0;
}

.menu__titles {
  min-width: 0;
}

.menu__name {
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
  line-height: 1.1;
}

.menu__name-base {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: 0.1rem 0 0;
}

.menu__progress {
  margin: 0.3rem 0 0;
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--color-teal);
}

.menu__eyebrow {
  margin: 0.35rem 0 0;
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
}

.activity-list {
  list-style: none;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  margin: 0;
  padding: 0;
}

.activity {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  width: 100%;
  text-align: left;
  padding: 0.75rem 0.85rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  cursor: pointer;
  transition:
    transform 0.12s ease,
    box-shadow 0.12s ease;
}

.activity:not(.activity--locked):hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-md);
}

.activity--primary {
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
  background: #f2f7fc;
}

.activity--locked {
  cursor: default;
  opacity: 0.6;
  box-shadow: none;
}

.activity__emoji {
  font-size: 1.5rem;
  flex-shrink: 0;
  line-height: 1;
}

.activity__body {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  flex: 1;
  min-width: 0;
}

.activity__label {
  font-size: 0.98rem;
  font-weight: 700;
  color: var(--color-text);
}

.activity__desc {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.activity__done {
  flex-shrink: 0;
  font-size: 1rem;
  font-weight: 800;
  color: var(--color-gold);
}

.activity__chevron {
  flex-shrink: 0;
  font-size: 1.4rem;
  color: var(--color-text-muted);
}

.menu__nothing {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  text-align: center;
  margin: 0.5rem 0 0;
}
</style>
