import { computed } from 'vue'
import { useSettingsStore } from '@/stores/settings'
import type { BaseLanguage } from '@/stores/settings'
import { i18n } from '@/i18n'

/**
 * Learning-content localization. Content (vocabulary, stories, lessons,
 * roleplay) carries an English string plus an optional Russian counterpart.
 * When the learner approaches Uzbek from Russian we show the Russian variant,
 * falling back to English wherever a translation has not been added yet.
 */

/** A title/name object as stored in content JSON. */
export interface LocalizedText {
  en: string
  uz?: string
  ru?: string
}

/**
 * The active base language, read from the i18n locale (kept in sync with the
 * settings store). For use outside components, e.g. pure exercise builders.
 */
export function currentBase(): BaseLanguage {
  return i18n.global.locale.value === 'ru' ? 'ru' : 'en'
}

/** Pick the base-language string from an English value + optional Russian one. */
export function pickBase(en: string, ru: string | undefined, base: BaseLanguage): string {
  return base === 'ru' ? (ru ?? en) : en
}

/** Word gloss in the current base language — for use outside components. */
export function glossNow(w: { english: string; russian?: string }): string {
  return pickBase(w.english, w.russian, currentBase())
}

/** Pick the base-language string from a {en, uz, ru} object. */
export function pickName(obj: LocalizedText, base: BaseLanguage): string {
  return base === 'ru' ? (obj.ru ?? obj.en) : obj.en
}

/** Pick a base-language array (e.g. lesson body paragraphs, morpheme glosses). */
export function pickBaseArray(
  en: string[],
  ru: string[] | undefined,
  base: BaseLanguage,
): string[] {
  return base === 'ru' && ru ? ru : en
}

/**
 * Reactive helpers bound to the current base language. Use inside components so
 * glosses re-render when the learner switches language in Settings.
 */
export function useContentLang() {
  const settings = useSettingsStore()
  const base = computed<BaseLanguage>(() => settings.baseLanguage)

  /** Gloss for a vocabulary word. */
  const gloss = (w: { english: string; russian?: string }) => pickBase(w.english, w.russian, base.value)

  /** Localized title/name object. */
  const name = (o: LocalizedText) => pickName(o, base.value)

  /** Arbitrary English value with an optional Russian variant. */
  const pick = (en: string, ru?: string) => pickBase(en, ru, base.value)

  /** Arbitrary English array with an optional Russian variant. */
  const pickArray = (en: string[], ru?: string[]) => pickBaseArray(en, ru, base.value)

  return { base, gloss, name, pick, pickArray }
}
