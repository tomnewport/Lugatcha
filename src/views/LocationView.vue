<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { getLocation } from '@/db/locations'
import type { Location } from '@/db/types'

const route = useRoute()
const router = useRouter()
const location = ref<Location | null>(null)

onMounted(async () => {
  const id = route.params.id as string
  const found = await getLocation(id)
  if (!found) {
    router.replace('/')
    return
  }
  location.value = found
})

function goHome() {
  router.push('/')
}
</script>

<template>
  <main class="location-view">
    <button class="back-btn" aria-label="Back to city map" @click="goHome">
      <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      City
    </button>

    <div v-if="location" class="location-body">
      <h1 class="location-name">{{ location.name.en }}</h1>
      <p class="location-name-uz" lang="uz">{{ location.name.uz }}</p>
      <p class="coming-soon">Exercises coming soon — Step 5 will wire up the full flow.</p>
    </div>

    <p v-else class="loading" aria-live="polite">Loading…</p>
  </main>
</template>

<style scoped>
.location-view {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem 2rem;
  background: var(--color-bg);
  gap: 1.5rem;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.4rem 0.75rem 0.4rem 0.5rem;
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
  background: var(--color-surface);
  color: var(--color-text);
  font-size: 0.9rem;
  box-shadow: var(--shadow-sm);
  align-self: flex-start;
}

.back-btn svg {
  width: 16px;
  height: 16px;
}

.back-btn:hover {
  box-shadow: var(--shadow-md);
}

.location-body {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding-top: 2rem;
  text-align: center;
}

.location-name {
  font-size: clamp(1.8rem, 7vw, 2.8rem);
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.location-name-uz {
  font-size: 1.1rem;
  color: var(--color-text-muted);
  margin: 0;
}

.coming-soon {
  margin-top: 1rem;
  font-size: 0.9rem;
  color: var(--color-text-muted);
  font-style: italic;
}

.loading {
  font-size: 0.9rem;
  color: var(--color-text-muted);
  margin: auto;
}
</style>
