<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore, type LabelLanguage } from '@/stores/settings'
import { useProgressStore } from '@/stores/progress'
import { getAudioManifest, type AudioManifest } from '@/audio/audio'
import { useAudioDownload } from '@/audio/offline'

const router = useRouter()
const settings = useSettingsStore()
const progress = useProgressStore()

const confirmingReset = ref(false)
const resetDone = ref(false)

const audioManifest = ref<AudioManifest | null>(null)
const audioChecked = ref(false)

const {
  total: audioTotal,
  done: audioDone,
  status: audioStatus,
  error: audioErrorMsg,
  prepare: prepareAudio,
  start: startAudio,
  pause: pauseAudio,
  resume: resumeAudio,
} = useAudioDownload()
const audioPercent = computed(() =>
  audioTotal.value ? Math.round((audioDone.value / audioTotal.value) * 100) : 0,
)

onMounted(async () => {
  audioManifest.value = await getAudioManifest()
  audioChecked.value = true
  await prepareAudio()
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
          {{ audioTotal }} recordings. Download them all so every word and phrase plays offline —
          you can pause and resume anytime.
        </p>

        <div
          v-if="audioStatus !== 'idle'"
          class="dl-bar"
          role="progressbar"
          :aria-valuenow="audioPercent"
          aria-valuemin="0"
          aria-valuemax="100"
        >
          <div class="dl-bar__fill" :style="{ width: `${audioPercent}%` }" />
        </div>
        <p v-if="audioStatus !== 'idle'" class="settings-card__desc">
          {{ audioDone }} / {{ audioTotal }} ({{ audioPercent }}%)
        </p>

        <div class="dl-actions">
          <button
            v-if="audioStatus === 'idle' || audioStatus === 'done'"
            class="btn btn--primary"
            type="button"
            :disabled="audioStatus === 'done'"
            @click="startAudio()"
          >
            {{ audioStatus === 'done' ? 'All downloaded ✓' : 'Download all audio' }}
          </button>
          <button
            v-else-if="audioStatus === 'running'"
            class="btn btn--ghost"
            type="button"
            @click="pauseAudio()"
          >
            Pause
          </button>
          <button v-else class="btn btn--primary" type="button" @click="resumeAudio()">
            {{ audioStatus === 'error' ? 'Retry' : 'Resume' }}
          </button>
        </div>

        <p v-if="audioStatus === 'error'" class="settings-card__note settings-card__note--error">
          Stopped at an error ({{ audioErrorMsg }}). Resume to retry — progress is kept.
        </p>
        <p v-else-if="audioStatus === 'done'" class="settings-card__note">
          All {{ audioTotal }} recordings cached for offline use. ✓
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

.dl-bar {
  height: 10px;
  border-radius: 999px;
  background: var(--color-bg);
  border: 1px solid var(--color-border);
  overflow: hidden;
}

.dl-bar__fill {
  height: 100%;
  background: var(--color-primary);
  transition: width 0.2s ease;
}

.dl-actions {
  display: flex;
  gap: 0.5rem;
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
