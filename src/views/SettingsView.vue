<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useSettingsStore, type BaseLanguage } from '@/stores/settings'
import { useProgressStore } from '@/stores/progress'
import { getAudioManifest, type AudioManifest } from '@/audio/audio'
import { useAudioDownload } from '@/audio/offline'
import { clearAllLocalData } from '@/db/clearAll'

const router = useRouter()
const settings = useSettingsStore()
const progress = useProgressStore()

const confirmingReset = ref(false)
const resetDone = ref(false)

const confirmingClear = ref(false)
const clearing = ref(false)

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

function setBaseLanguage(lang: BaseLanguage) {
  settings.setBaseLanguage(lang)
}

async function resetProgress() {
  await progress.resetAllProgress()
  confirmingReset.value = false
  resetDone.value = true
  setTimeout(() => (resetDone.value = false), 3000)
}

async function clearAllData() {
  clearing.value = true
  await clearAllLocalData()
  // Reload from the app root so it re-seeds from scratch, like a fresh install.
  window.location.assign(import.meta.env.BASE_URL)
}
</script>

<template>
  <main class="settings">
    <button class="back-btn" :aria-label="$t('common.backToCity')" type="button" @click="router.push('/')">
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

    <h1 class="settings__title">{{ $t('settings.title') }}</h1>

    <section class="settings-card">
      <h2 class="settings-card__title">{{ $t('settings.learningLanguage.title') }}</h2>
      <p class="settings-card__desc">{{ $t('settings.learningLanguage.desc') }}</p>
      <div class="lang-toggle" role="radiogroup" :aria-label="$t('settings.learningLanguage.groupLabel')">
        <button
          class="lang-toggle__btn"
          :class="{ 'lang-toggle__btn--active': settings.baseLanguage === 'en' }"
          type="button"
          role="radio"
          :aria-checked="settings.baseLanguage === 'en'"
          @click="setBaseLanguage('en')"
        >
          {{ $t('settings.learningLanguage.english') }}
        </button>
        <button
          class="lang-toggle__btn"
          :class="{ 'lang-toggle__btn--active': settings.baseLanguage === 'ru' }"
          type="button"
          role="radio"
          :aria-checked="settings.baseLanguage === 'ru'"
          @click="setBaseLanguage('ru')"
        >
          {{ $t('settings.learningLanguage.russian') }}
        </button>
      </div>
    </section>

    <section class="settings-card">
      <h2 class="settings-card__title">{{ $t('settings.audio.title') }}</h2>
      <template v-if="!audioChecked">
        <p class="settings-card__desc">{{ $t('settings.audio.checking') }}</p>
      </template>
      <template v-else-if="audioManifest">
        <p class="settings-card__desc">
          {{ $t('settings.audio.summary', { count: audioTotal }) }}
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
          {{ $t('settings.audio.progress', { done: audioDone, total: audioTotal, percent: audioPercent }) }}
        </p>

        <div class="dl-actions">
          <button
            v-if="audioStatus === 'idle' || audioStatus === 'done'"
            class="btn btn--primary"
            type="button"
            :disabled="audioStatus === 'done'"
            @click="startAudio()"
          >
            {{ audioStatus === 'done' ? $t('settings.audio.allDownloaded') : $t('settings.audio.downloadAll') }}
          </button>
          <button
            v-else-if="audioStatus === 'running'"
            class="btn btn--ghost"
            type="button"
            @click="pauseAudio()"
          >
            {{ $t('settings.audio.pause') }}
          </button>
          <button v-else class="btn btn--primary" type="button" @click="resumeAudio()">
            {{ audioStatus === 'error' ? $t('settings.audio.retry') : $t('settings.audio.resume') }}
          </button>
        </div>

        <p v-if="audioStatus === 'error'" class="settings-card__note settings-card__note--error">
          {{ $t('settings.audio.error', { message: audioErrorMsg }) }}
        </p>
        <p v-else-if="audioStatus === 'done'" class="settings-card__note">
          {{ $t('settings.audio.done', { count: audioTotal }) }}
        </p>
      </template>
      <template v-else>
        <p class="settings-card__desc">
          {{ $t('settings.audio.none') }}
        </p>
      </template>
    </section>

    <section class="settings-card">
      <h2 class="settings-card__title">{{ $t('settings.progress.title') }}</h2>
      <p class="settings-card__desc">
        {{ $t('settings.progress.desc') }}
      </p>
      <button
        v-if="!confirmingReset"
        class="btn btn--ghost"
        type="button"
        @click="confirmingReset = true"
      >
        {{ $t('settings.progress.reset') }}
      </button>
      <div v-else class="reset-confirm">
        <p class="reset-confirm__msg">{{ $t('settings.progress.confirm') }}</p>
        <div class="reset-confirm__actions">
          <button class="btn btn--danger" type="button" @click="resetProgress">{{ $t('settings.progress.confirmYes') }}</button>
          <button class="btn btn--ghost" type="button" @click="confirmingReset = false">
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>
      <p v-if="resetDone" class="settings-card__note" aria-live="polite">{{ $t('settings.progress.done') }}</p>
    </section>

    <section class="settings-card">
      <h2 class="settings-card__title">{{ $t('settings.data.title') }}</h2>
      <p class="settings-card__desc">
        {{ $t('settings.data.desc') }}
      </p>
      <button
        v-if="!confirmingClear"
        class="btn btn--danger"
        type="button"
        @click="confirmingClear = true"
      >
        {{ $t('settings.data.clear') }}
      </button>
      <div v-else class="reset-confirm">
        <p class="reset-confirm__msg">{{ $t('settings.data.confirm') }}</p>
        <div class="reset-confirm__actions">
          <button class="btn btn--danger" type="button" :disabled="clearing" @click="clearAllData">
            {{ clearing ? $t('settings.data.clearing') : $t('settings.data.confirmYes') }}
          </button>
          <button class="btn btn--ghost" type="button" :disabled="clearing" @click="confirmingClear = false">
            {{ $t('common.cancel') }}
          </button>
        </div>
      </div>
    </section>
  </main>
</template>

<style scoped>
.settings {
  min-height: 100dvh;
  display: flex;
  flex-direction: column;
  gap: 1rem;
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
</style>
