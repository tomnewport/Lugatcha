<script setup lang="ts">
import { useSettingsStore, type BaseLanguage } from '@/stores/settings'

const settings = useSettingsStore()

function choose(lang: BaseLanguage) {
  settings.chooseLanguage(lang)
}
</script>

<template>
  <div class="lp-overlay" role="dialog" aria-modal="true" aria-labelledby="lp-title">
    <div class="lp-card">
      <div class="lp-ornament" aria-hidden="true">
        <svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg">
          <circle cx="60" cy="60" r="55" fill="none" stroke="currentColor" stroke-width="2" />
          <circle cx="60" cy="60" r="40" fill="none" stroke="currentColor" stroke-width="1.5" />
          <circle cx="60" cy="60" r="8" fill="currentColor" />
          <g stroke="currentColor" stroke-width="1.5" fill="none">
            <line x1="60" y1="5" x2="60" y2="20" />
            <line x1="60" y1="100" x2="60" y2="115" />
            <line x1="5" y1="60" x2="20" y2="60" />
            <line x1="100" y1="60" x2="115" y2="60" />
          </g>
        </svg>
      </div>

      <h1 class="lp-brand">Lugʻatcha</h1>
      <p id="lp-title" class="lp-title">
        <span>Choose your language</span>
        <span class="lp-title__ru">Выберите ваш язык</span>
      </p>
      <p class="lp-sub">Which language are you learning Uzbek from?<br />С какого языка вы изучаете узбекский?</p>

      <div class="lp-options">
        <button class="lp-option" type="button" @click="choose('en')">
          <span class="lp-option__lang">English</span>
          <span class="lp-option__hint">Learn Uzbek from English</span>
        </button>
        <button class="lp-option" type="button" @click="choose('ru')">
          <span class="lp-option__lang">Русский</span>
          <span class="lp-option__hint">Изучать узбекский с русского</span>
        </button>
      </div>

      <p class="lp-foot">You can change this anytime in Settings · Можно изменить в настройках</p>
    </div>
  </div>
</template>

<style scoped>
.lp-overlay {
  position: fixed;
  inset: 0;
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
  background: rgb(20 30 48 / 0.55);
  backdrop-filter: blur(3px);
}

.lp-card {
  width: 100%;
  max-width: 420px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.6rem;
  padding: 1.75rem 1.5rem 1.4rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-lg, 18px);
  box-shadow: var(--shadow-lg);
  text-align: center;
}

.lp-ornament {
  width: 46px;
  height: 46px;
  color: var(--color-gold);
}

.lp-brand {
  font-size: 1.8rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
  letter-spacing: -0.02em;
}

.lp-title {
  display: flex;
  flex-direction: column;
  gap: 0.1rem;
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0.2rem 0 0;
}

.lp-title__ru {
  font-weight: 600;
  color: var(--color-text-muted);
}

.lp-sub {
  font-size: 0.85rem;
  color: var(--color-text-muted);
  line-height: 1.45;
  margin: 0 0 0.4rem;
}

.lp-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  width: 100%;
}

.lp-option {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.15rem;
  width: 100%;
  padding: 0.85rem 1rem;
  background: var(--color-bg);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
  transition:
    transform 0.12s ease,
    border-color 0.15s ease,
    box-shadow 0.12s ease;
}

.lp-option:hover {
  transform: translateY(-2px);
  border-color: var(--color-primary);
  box-shadow: var(--shadow-md);
}

.lp-option__lang {
  font-size: 1.15rem;
  font-weight: 800;
  color: var(--color-primary);
}

.lp-option__hint {
  font-size: 0.8rem;
  color: var(--color-text-muted);
}

.lp-foot {
  font-size: 0.74rem;
  color: var(--color-text-muted);
  margin: 0.5rem 0 0;
}
</style>
