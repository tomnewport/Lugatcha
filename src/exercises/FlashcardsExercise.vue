<script setup lang="ts">
// Step 7 will replace this with the full matching exercise.
// For now this is a shell that proves the flow works end-to-end.

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
</script>

<template>
  <div class="placeholder-exercise">
    <div class="placeholder-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">
        <rect x="6" y="10" width="36" height="28" rx="3" />
        <rect x="6" y="10" width="36" height="28" rx="3" transform="rotate(-3 24 24)" />
        <line x1="16" y1="24" x2="32" y2="24" />
        <line x1="24" y1="16" x2="24" y2="32" />
      </svg>
    </div>
    <h2 class="placeholder-title">Flashcards</h2>
    <p class="placeholder-desc">
      Match Uzbek words with their English meanings. Records correct/incorrect attempts
      and marks a word as "known" after 3 of 4 correct.
    </p>
    <p class="placeholder-note">Full implementation in Step 7.</p>
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
