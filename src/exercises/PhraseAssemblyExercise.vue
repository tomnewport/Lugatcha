<script setup lang="ts">
// Step 8 will replace this with drag-and-drop phrase assembly.

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
</script>

<template>
  <div class="placeholder-exercise">
    <div class="placeholder-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="4" y="18" width="14" height="12" rx="3" />
        <rect x="22" y="18" width="14" height="12" rx="3" />
        <rect x="4" y="34" width="32" height="10" rx="3" fill="currentColor" fill-opacity="0.12" />
        <line x1="40" y1="24" x2="44" y2="24" />
      </svg>
    </div>
    <h2 class="placeholder-title">Phrase Assembly</h2>
    <p class="placeholder-desc">
      Drag and drop word tokens into the correct order to build an Uzbek phrase.
      Two attempts before "Show answer" is offered.
    </p>
    <p class="placeholder-note">Full implementation in Step 8.</p>
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
