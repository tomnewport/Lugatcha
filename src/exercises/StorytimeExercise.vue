<script setup lang="ts">
// Step 10 will replace this with the full sentence-by-sentence story exercise.

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
</script>

<template>
  <div class="placeholder-exercise">
    <div class="placeholder-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="8" y="4" width="32" height="40" rx="3" />
        <line x1="16" y1="14" x2="32" y2="14" />
        <line x1="16" y1="21" x2="32" y2="21" />
        <line x1="16" y1="28" x2="26" y2="28" />
      </svg>
    </div>
    <h2 class="placeholder-title">Storytime</h2>
    <p class="placeholder-desc">
      Read a short story sentence by sentence and assemble English translations
      from a word bank. Unknown words have tooltips.
    </p>
    <p class="placeholder-note">Full implementation in Step 10.</p>
    <button class="continue-btn" @click="emit('complete')">Complete Exercise</button>
  </div>
</template>

<style scoped>
.placeholder-exercise {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1rem;
  flex: 1;
  text-align: center;
  padding-top: 1rem;
}

.placeholder-icon {
  width: 64px;
  height: 64px;
  color: var(--color-primary);
  opacity: 0.35;
}

.placeholder-title {
  font-size: 1.3rem;
  font-weight: 700;
  color: var(--color-primary);
  margin: 0;
}

.placeholder-desc {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  max-width: 320px;
  margin: 0;
}

.placeholder-note {
  font-size: 0.78rem;
  color: var(--color-gold);
  font-weight: 600;
  margin: 0;
}

.continue-btn {
  margin-top: auto;
  padding: 0.85rem 2rem;
  background: var(--color-primary);
  color: white;
  font-size: 1rem;
  font-weight: 600;
  border: none;
  border-radius: var(--radius-md);
  width: 100%;
  max-width: 320px;
}

.continue-btn:hover {
  opacity: 0.88;
}
</style>
