import { defineStore } from 'pinia'
import { setI18nLocale, type UiLanguage } from '@/i18n'

/** Which non-Uzbek language leads a tile's two labels (the Uzbek side is always shown too). */
export type LabelLanguage = 'en' | 'uz'

/**
 * The language the learner already knows and is approaching Uzbek *from*.
 * Drives the whole interface language (vue-i18n) and which gloss is shown for
 * vocabulary, stories, lessons and roleplay. Russian falls back to English
 * wherever a Russian translation has not been provided yet.
 */
export type BaseLanguage = UiLanguage // 'en' | 'ru'

const STORAGE_KEY = 'lugatcha.settings'

interface PersistedSettings {
  baseLanguage: BaseLanguage
  labelLanguage: LabelLanguage
}

function load(): PersistedSettings {
  const defaults: PersistedSettings = { baseLanguage: 'en', labelLanguage: 'en' }
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return { ...defaults, ...(JSON.parse(raw) as Partial<PersistedSettings>) }
  } catch {
    // fall through to defaults
  }
  return defaults
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
    setBaseLanguage(lang: BaseLanguage) {
      this.baseLanguage = lang
      setI18nLocale(lang)
      save({ baseLanguage: lang, labelLanguage: this.labelLanguage })
      // Morpheme glosses are language-specific and cached — rebuild them.
      void import('@/exercises/deagglutination').then((m) => m.rebuildBreakdownIndex())
    },
    setLabelLanguage(lang: LabelLanguage) {
      this.labelLanguage = lang
      save({ baseLanguage: this.baseLanguage, labelLanguage: lang })
    },
  },
})
