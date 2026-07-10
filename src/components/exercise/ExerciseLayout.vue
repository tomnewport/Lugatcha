<script setup lang="ts">
import { exerciseLabel } from '@/exercises/potluck'
import type { ExerciseType } from '@/db/types'

const props = withDefaults(
  defineProps<{
    exercise: ExerciseType
    locationName: string
    /** Position within a Continue Learning chain (1-based); 0 when not chaining. */
    chainStep?: number
    /** Length of the chain; 0 when this isn't a chained visit. */
    chainTotal?: number
  }>(),
  { chainStep: 0, chainTotal: 0 },
)

const emit = defineEmits<{ exit: [] }>()

const showChain = () => props.chainTotal > 0 && props.chainStep > 0
</script>

<template>
  <div class="exercise-layout">
    <header class="exercise-header">
      <button class="exit-btn" :aria-label="$t('common.backToLocation')" type="button" @click="emit('exit')">
        <svg
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          stroke-width="2"
          aria-hidden="true"
        >
          <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>

      <div class="exercise-header__titles">
        <span class="exercise-header__location">
          {{ locationName }}
          <span v-if="showChain()" class="exercise-header__chain">
            · {{ $t('locationMenu.chainStep', { step: chainStep, total: chainTotal }) }}
          </span>
        </span>
        <h1 class="exercise-header__title">{{ exerciseLabel(exercise) }}</h1>
      </div>
    </header>

    <div class="exercise-body">
      <slot />
    </div>

    <footer v-if="$slots.footer" class="exercise-footer">
      <slot name="footer" />
    </footer>
  </div>
</template>

<style scoped>
.exercise-layout {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

.exercise-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.9rem 1rem;
  background: var(--color-surface);
  border-bottom: 1.5px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 5;
}

.exit-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  flex-shrink: 0;
}

.exit-btn svg {
  width: 16px;
  height: 16px;
}

.exercise-header__titles {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.exercise-header__location {
  font-size: 0.7rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.exercise-header__chain {
  color: var(--color-teal);
  font-weight: 700;
}

.exercise-header__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
  line-height: 1.2;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.exercise-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  /* Bottom padding must clear the fixed AppFooter (language picker).
     Footer height ≈ 1.5rem padding-top + ~1.6rem button + 0.5rem padding-bottom = ~3.6rem,
     plus env(safe-area-inset-bottom) on notched phones. */
  padding: 1.25rem 1rem calc(4.5rem + env(safe-area-inset-bottom));
  width: 100%;
  max-width: 560px;
  margin: 0 auto;
}

.exercise-footer {
  position: sticky;
  bottom: 0;
  padding: 0.9rem 1rem calc(0.9rem + env(safe-area-inset-bottom));
  background: var(--color-surface);
  border-top: 1.5px solid var(--color-border);
  display: flex;
  justify-content: center;
}

.exercise-footer > :deep(*) {
  width: 100%;
  max-width: 528px;
}
</style>
