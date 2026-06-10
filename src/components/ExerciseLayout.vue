<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { EXERCISE_SEQUENCE, STEP_LABELS } from '@/stores/progress'

const props = defineProps<{
  locationName: string
  locationNameUz: string
  /** 0–4 = index of the active exercise; 5 = all complete */
  stepIndex: number
}>()

const router = useRouter()

const steps = computed(() =>
  EXERCISE_SEQUENCE.map((type, i) => ({
    type,
    label: STEP_LABELS[type],
    state:
      i < props.stepIndex ? 'done' : i === props.stepIndex ? 'active' : ('pending' as const),
  })),
)

function goBack() {
  router.push('/')
}
</script>

<template>
  <div class="exercise-layout">
    <!-- Top bar -->
    <header class="layout-header">
      <button class="back-btn" aria-label="Back to city map" @click="goBack">
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
          <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      </button>
      <div class="layout-location">
        <span class="layout-location__en">{{ locationName }}</span>
        <span class="layout-location__uz" lang="uz">{{ locationNameUz }}</span>
      </div>
    </header>

    <!-- Step progress -->
    <nav class="step-track" aria-label="Exercise steps">
      <div
        v-for="step in steps"
        :key="step.type"
        class="step-item"
        :class="`step-item--${step.state}`"
      >
        <div class="step-circle" :aria-label="`${step.label}: ${step.state}`">
          <!-- Checkmark for done -->
          <svg
            v-if="step.state === 'done'"
            viewBox="0 0 12 12"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M1.5 6l3 3 6-6" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <!-- Active indicator dot -->
          <div v-else-if="step.state === 'active'" class="step-active-dot" />
        </div>
        <span class="step-label">{{ step.label }}</span>
      </div>

      <!-- Connector lines between dots -->
      <div class="step-connectors" aria-hidden="true">
        <div
          v-for="(step, i) in steps.slice(0, -1)"
          :key="i"
          class="step-connector"
          :class="{ 'step-connector--filled': step.state === 'done' }"
        />
      </div>
    </nav>

    <!-- Exercise content -->
    <main class="layout-body">
      <slot />
    </main>
  </div>
</template>

<style scoped>
.exercise-layout {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  background: var(--color-bg);
}

/* Header */
.layout-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}

.back-btn {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 36px;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-bg);
  color: var(--color-text);
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.back-btn:hover {
  background: var(--color-border);
}

.layout-location {
  display: flex;
  flex-direction: column;
  gap: 1px;
  min-width: 0;
}

.layout-location__en {
  font-size: 1rem;
  font-weight: 700;
  color: var(--color-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.layout-location__uz {
  font-size: 0.72rem;
  color: var(--color-text-muted);
}

/* Step track */
.step-track {
  position: relative;
  display: flex;
  justify-content: space-around;
  align-items: flex-start;
  padding: 0.85rem 1rem 0.65rem;
  background: var(--color-surface);
  border-bottom: 1px solid var(--color-border);
}

.step-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 5px;
  flex: 1;
  position: relative;
  z-index: 1;
}

.step-circle {
  width: 28px;
  height: 28px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 2px solid var(--color-border);
  background: var(--color-bg);
  transition: background 0.2s, border-color 0.2s, box-shadow 0.2s;
}

.step-circle svg {
  width: 12px;
  height: 12px;
}

.step-item--done .step-circle {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: white;
}

.step-item--active .step-circle {
  background: var(--color-surface);
  border-color: var(--color-primary);
  border-width: 2.5px;
  box-shadow: 0 0 0 3px color-mix(in srgb, var(--color-primary) 18%, transparent);
}

.step-active-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--color-primary);
}

.step-label {
  font-size: 0.58rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--color-text-muted);
}

.step-item--done .step-label,
.step-item--active .step-label {
  color: var(--color-primary);
}

/* Connector lines drawn behind the dots */
.step-connectors {
  position: absolute;
  top: calc(0.85rem + 14px); /* vertically centred on the circles */
  left: calc(50% / 5);
  right: calc(50% / 5);
  display: flex;
  gap: 0;
  pointer-events: none;
  z-index: 0;
}

.step-connector {
  flex: 1;
  height: 2px;
  background: var(--color-border);
}

.step-connector--filled {
  background: var(--color-primary);
}

/* Body */
.layout-body {
  flex: 1;
  display: flex;
  flex-direction: column;
  padding: 1.5rem 1rem 2rem;
  overflow-y: auto;
}
</style>
