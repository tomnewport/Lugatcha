import { defineStore } from 'pinia'

export type LabelLanguage = 'en' | 'uz'
export type AudioVoice = 'yandex' | 'sayro'

const STORAGE_KEY = 'lugatcha.settings'

interface PersistedSettings {
  labelLanguage: LabelLanguage
  audioVoice: AudioVoice
}

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { audioVoice: 'yandex', ...JSON.parse(raw) } as PersistedSettings
  } catch {
    // fall through to defaults
  }
  return { labelLanguage: 'en', audioVoice: 'yandex' }
}

function save(s: PersistedSettings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(s))
  } catch {
    // private mode etc.
  }
}

export const useSettingsStore = defineStore('settings', {
  state: (): PersistedSettings => load(),
  actions: {
    setLabelLanguage(lang: LabelLanguage) {
      this.labelLanguage = lang
      save({ labelLanguage: lang, audioVoice: this.audioVoice })
    },
    setAudioVoice(voice: AudioVoice) {
      this.audioVoice = voice
      save({ labelLanguage: this.labelLanguage, audioVoice: voice })
    },
  },
})
