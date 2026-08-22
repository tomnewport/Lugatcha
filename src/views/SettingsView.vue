<script setup lang="ts">
import { useRouter } from 'vue-router'
import SettingsPanel from '@/components/SettingsPanel.vue'

const router = useRouter()
</script>

<template>
  <main class="settings">
    <SettingsPanel>
      <template #nav>
        <button
          class="back-btn"
          :aria-label="$t('common.backToCity')"
          type="button"
          @click="router.push('/')"
        >
          <svg
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            stroke-width="2"
            aria-hidden="true"
          >
            <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          {{ $t('common.city') }}
        </button>
      </template>
    </SettingsPanel>
  </main>
</template>

<style scoped>
.settings {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  padding: 1rem 1.25rem 4rem;
  background: var(--color-bg);
  max-width: 520px;
  margin: 0 auto;
  width: 100%;
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
</style>
