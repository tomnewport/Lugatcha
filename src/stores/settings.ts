import { defineStore } from 'pinia'

export type LabelLanguage = 'en' | 'uz'

const STORAGE_KEY = 'lugatcha.settings'

interface PersistedSettings {
  labelLanguage: LabelLanguage
}

function load(): PersistedSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw) as PersistedSettings
  } catch {
    // fall through to defaults
  }
  return { labelLanguage: 'en' }
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
      save({ labelLanguage: lang })
    },
  },
})
