<script setup lang="ts">
// Step 9 will replace this with the full turn-based roleplay conversation.

const props = defineProps<{ locationId: string }>()
const emit = defineEmits<{ complete: [] }>()
</script>

<template>
  <div class="placeholder-exercise">
    <div class="placeholder-icon" aria-hidden="true">
      <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M6 8h24a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3H18l-6 5v-5H6a3 3 0 0 1-3-3V11a3 3 0 0 1 3-3z" />
        <path d="M30 22h6a3 3 0 0 1 3 3v8a3 3 0 0 1-3 3h-3v4l-4-4h-6a3 3 0 0 1-3-3v-2" />
      </svg>
    </div>
    <h2 class="placeholder-title">Roleplay</h2>
    <p class="placeholder-desc">
      A turn-based conversation scenario. Assemble your Uzbek phrases to interact
      with an NPC across multiple variants of the scenario.
    </p>
    <p class="placeholder-note">Full implementation in Step 9.</p>
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
