import { createI18n } from 'vue-i18n'
import en from './locales/en'
import ru from './locales/ru'

/** Interface languages the learner can approach Uzbek from. */
export type UiLanguage = 'en' | 'ru'

export const SUPPORTED_LOCALES: UiLanguage[] = ['en', 'ru']

export const i18n = createI18n({
  legacy: false,
  globalInjection: true,
  locale: 'en',
  fallbackLocale: 'en',
  messages: { en, ru },
  pluralRules: {
    // Russian: 0 = one (1, 21, 31…), 1 = few (2-4, 22-24…), 2 = many (0, 5-20…).
    ru(choice: number): number {
      const n = Math.abs(choice)
      const mod10 = n % 10
      const mod100 = n % 100
      if (mod10 === 1 && mod100 !== 11) return 0
      if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 1
      return 2
    },
  },
})

export function setI18nLocale(lang: UiLanguage) {
  i18n.global.locale.value = lang
  document.documentElement.setAttribute('lang', lang)
}

/** Type of the English message catalogue — Russian must mirror its shape. */
export type MessageSchema = typeof en
