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

export const useSettingsStore = defineStore('settings', {
  state: (): PersistedSettings => load(),
  actions: {
    setLabelLanguage(lang: LabelLanguage) {
      this.labelLanguage = lang
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ labelLanguage: lang }))
      } catch {
        // private mode etc. — preference just won't persist
      }
    },
  },
})
