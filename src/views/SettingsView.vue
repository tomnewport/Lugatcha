<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore, type LabelLanguage } from '@/stores/settings'
import { useProgressStore } from '@/stores/progress'
import { getAudioManifest, type AudioManifest } from '@/audio/audio'

const router = useRouter()
const settings = useSettingsStore()
const progress = useProgressStore()

const confirmingReset = ref(false)
const resetDone = ref(false)

const audioManifest = ref<AudioManifest | null>(null)
const audioChecked = ref(false)
const downloading = ref(false)
const downloadedCount = ref(0)
const downloadError = ref(false)

onMounted(async () => {
  audioManifest.value = await getAudioManifest()
  audioChecked.value = true
})

function setLanguage(lang: LabelLanguage) {
  settings.setLabelLanguage(lang)
}

async function resetProgress() {
  await progress.resetAllProgress()
  confirmingReset.value = false
  resetDone.value = true
  setTimeout(() => (resetDone.value = false), 3000)
}

/** Warms the Workbox CacheFirst audio cache so everything plays offline. */
async function downloadAllAudio() {
  if (!audioManifest.value || downloading.value) return
  downloading.value = true
  downloadError.value = false
  downloadedCount.value = 0
  const base = import.meta.env.BASE_URL
  try {
    for (const file of Object.values(audioManifest.value)) {
      const res = await fetch(`${base}audio/${file}`)
      if (res.ok) downloadedCount.value++
    }
  } catch {
    downloadError.value = true
  } finally {
    downloading.value = false
  }
}
</script>

<template>
  <main class="settings">
    <button class="back-btn" aria-label="Back to city map" type="button" @click="router.push('/')">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <path d="M10 3L5 8l5 5" stroke-linecap="round" stroke-linejoin="round" />
      </svg>
      City
    </button>

    <h1 class="settings__title">Settings</h1>

    <section class="settings-card">
      <h2 class="settings-card__title">Tile labels</h2>
      <p class="settings-card__desc">Which language leads on the city map?</p>
      <div class="lang-toggle" role="radiogroup" aria-label="Label language">
        <button
          class="lang-toggle__btn"
          :class="{ 'lang-toggle__btn--active': settings.labelLanguage === 'en' }"
          type="button"
          role="radio"
          :aria-checked="settings.labelLanguage === 'en'"
          @click="setLanguage('en')"
        >
          English first
        </button>
        <button
          class="lang-toggle__btn"
          :class="{ 'lang-toggle__btn--active': settings.labelLanguage === 'uz' }"
          type="button"
          role="radio"
          :aria-checked="settings.labelLanguage === 'uz'"
          @click="setLanguage('uz')"
        >
          O'zbekcha birinchi
        </button>
      </div>
    </section>

    <section class="settings-card">
      <h2 class="settings-card__title">Audio</h2>
      <template v-if="!audioChecked">
        <p class="settings-card__desc">Checking for downloadable audio…</p>
      </template>
      <template v-else-if="audioManifest">
        <p class="settings-card__desc">
          {{ Object.keys(audioManifest).length }} recordings available. Download them all so every
          word and phrase plays offline.
        </p>
        <button
          class="btn btn--primary"
          type="button"
          :disabled="downloading"
          @click="downloadAllAudio"
        >
          {{ downloading ? `Downloading… (${downloadedCount})` : 'Download all audio' }}
        </button>
        <p v-if="downloadError" class="settings-card__note settings-card__note--error">
          Some files failed to download — try again when you're online.
        </p>
        <p v-else-if="!downloading && downloadedCount > 0" class="settings-card__note">
          {{ downloadedCount }} recordings cached for offline use. ✓
        </p>
      </template>
      <template v-else>
        <p class="settings-card__desc">
          No prebuilt recordings are bundled yet, so Lugʻatcha uses your device's speech synthesis
          to read Uzbek aloud. Quality varies by device; recordings will arrive with a future update
          and download automatically.
        </p>
      </template>
    </section>

    <section class="settings-card">
      <h2 class="settings-card__title">Audio review</h2>
      <p class="settings-card__desc">
        A/B-test the candidate recordings and rate them, then export the results as a GitHub issue.
      </p>
      <button class="btn btn--ghost" type="button" @click="router.push('/review')">
        Open audio review
      </button>
    </section>

    <section class="settings-card">
      <h2 class="settings-card__title">Progress</h2>
      <p class="settings-card__desc">
        Wipes every seen word, flashcard result, and completed exercise on this device.
      </p>
      <button
        v-if="!confirmingReset"
        class="btn btn--ghost"
        type="button"
        @click="confirmingReset = true"
      >
        Reset all progress…
      </button>
      <div v-else class="reset-confirm">
        <p class="reset-confirm__msg">Are you sure? This can't be undone.</p>
        <div class="reset-confirm__actions">
          <button class="btn btn--danger" type="button" @click="resetProgress">Yes, reset</button>
          <button class="btn btn--ghost" type="button" @click="confirmingReset = false">
            Cancel
          </button>
        </div>
      </div>
      <p v-if="resetDone" class="settings-card__note" aria-live="polite">Progress reset. ✓</p>
    </section>

    <p class="settings__footer">
      Lugʻatcha — a little dictionary. Made with respect for the people, culture, and history of
      Uzbekistan.
    </p>
  </main>
</template>

<style scoped>
.settings {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 1rem 1.25rem 2rem;
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

.settings__title {
  font-size: 1.6rem;
  font-weight: 800;
  color: var(--color-primary);
  margin: 0;
}

.settings-card {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  padding: 1.1rem;
  background: var(--color-surface);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-md);
  box-shadow: var(--shadow-sm);
}

.settings-card__title {
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--color-text);
  margin: 0;
}

.settings-card__desc {
  font-size: 0.88rem;
  color: var(--color-text-muted);
  margin: 0;
}

.settings-card__note {
  font-size: 0.82rem;
  font-weight: 600;
  color: var(--color-teal);
  margin: 0;
}

.settings-card__note--error {
  color: var(--color-terracotta);
}

.lang-toggle {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0.5rem;
}

.lang-toggle__btn {
  padding: 0.6rem 0.5rem;
  font-size: 0.88rem;
  font-weight: 600;
  background: var(--color-bg);
  color: var(--color-text);
  border: 1.5px solid var(--color-border);
  border-radius: var(--radius-sm);
}

.lang-toggle__btn--active {
  background: var(--color-primary);
  border-color: var(--color-primary);
  color: #fff;
}

.reset-confirm {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.reset-confirm__msg {
  font-size: 0.88rem;
  font-weight: 600;
  color: var(--color-terracotta);
  margin: 0;
}

.reset-confirm__actions {
  display: flex;
  gap: 0.5rem;
}

.settings__footer {
  margin-top: auto;
  padding-top: 1rem;
  font-size: 0.78rem;
  color: var(--color-text-muted);
  text-align: center;
}
</style>
