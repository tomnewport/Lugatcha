<script setup lang="ts">
import { useSettingsStore } from '@/stores/settings'

const settings = useSettingsStore()
</script>

<template>
  <footer class="app-footer" role="contentinfo" aria-label="Language selector">
    <div class="app-footer__inner">
      <button
        class="app-footer__lang"
        :class="{ 'app-footer__lang--active': settings.baseLanguage === 'en' }"
        type="button"
        :aria-pressed="settings.baseLanguage === 'en'"
        @click="settings.setBaseLanguage('en')"
      >
        English
      </button>
      <span class="app-footer__sep" aria-hidden="true">/</span>
      <button
        class="app-footer__lang"
        :class="{ 'app-footer__lang--active': settings.baseLanguage === 'ru' }"
        type="button"
        :aria-pressed="settings.baseLanguage === 'ru'"
        @click="settings.setBaseLanguage('ru')"
      >
        Русский
      </button>
    </div>
  </footer>
</template>

<style scoped>
.app-footer {
  position: fixed;
  bottom: 0;
  left: 0;
  right: 0;
  z-index: 10;
  background: var(--color-surface);
  border-top: 1.5px solid var(--color-border);
  padding: 0.45rem 1rem calc(0.45rem + env(safe-area-inset-bottom));
}

.app-footer__inner {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  max-width: 560px;
  margin: 0 auto;
}

.app-footer__lang {
  background: none;
  border: none;
  font-size: 0.8rem;
  font-weight: 600;
  color: var(--color-text-muted);
  padding: 0.25rem 0.5rem;
  border-radius: var(--radius-sm);
  transition:
    color 0.12s ease,
    background 0.12s ease;
}

.app-footer__lang--active {
  color: var(--color-primary);
  background: color-mix(in srgb, var(--color-primary) 10%, transparent);
}

.app-footer__lang:not(.app-footer__lang--active):hover {
  color: var(--color-text);
  background: var(--color-bg);
}

.app-footer__sep {
  color: var(--color-border);
  font-size: 0.8rem;
  line-height: 1;
  user-select: none;
}
</style>
