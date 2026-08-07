import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '@/stores/settings'

/** A fresh store instance, as if the app had just been loaded. */
function reload() {
  setActivePinia(createPinia())
  return useSettingsStore()
}

describe('settings store', () => {
  beforeEach(() => setActivePinia(createPinia()))

  it('leaves the mini-games off by default', () => {
    expect(useSettingsStore().miniGames).toBe(false)
  })

  it('remembers the opt-in, and the opt back out', () => {
    useSettingsStore().setMiniGames(true)
    expect(reload().miniGames).toBe(true)

    useSettingsStore().setMiniGames(false)
    expect(reload().miniGames).toBe(false)
  })

  it('keeps the other settings when the games are toggled', () => {
    const settings = useSettingsStore()
    settings.languageChosen = true
    settings.persist()
    settings.setMiniGames(true)

    const reloaded = reload()
    expect(reloaded.languageChosen).toBe(true)
    expect(reloaded.baseLanguage).toBe('en')
    expect(reloaded.miniGames).toBe(true)
  })

  it('defaults the games to off for settings saved before they existed', () => {
    localStorage.setItem(
      'lugatcha.settings',
      JSON.stringify({ baseLanguage: 'ru', languageChosen: true }),
    )
    const settings = reload()
    expect(settings.baseLanguage).toBe('ru')
    expect(settings.miniGames).toBe(false)
  })

  describe('the rename from snakeGame', () => {
    it('carries an existing snake opt-in over to the whole roster', () => {
      localStorage.setItem(
        'lugatcha.settings',
        JSON.stringify({ baseLanguage: 'en', languageChosen: true, snakeGame: true }),
      )
      expect(reload().miniGames).toBe(true)
    })

    it('carries an explicit opt-out over too', () => {
      localStorage.setItem(
        'lugatcha.settings',
        JSON.stringify({ baseLanguage: 'en', languageChosen: true, snakeGame: false }),
      )
      expect(reload().miniGames).toBe(false)
    })

    it('drops the old key once the settings are saved again', () => {
      localStorage.setItem(
        'lugatcha.settings',
        JSON.stringify({ baseLanguage: 'en', languageChosen: true, snakeGame: true }),
      )
      reload().persist()
      const stored = JSON.parse(localStorage.getItem('lugatcha.settings')!)
      expect(stored.miniGames).toBe(true)
      expect('snakeGame' in stored).toBe(false)
    })

    it('prefers the new key when both are present', () => {
      localStorage.setItem(
        'lugatcha.settings',
        JSON.stringify({ baseLanguage: 'en', miniGames: false, snakeGame: true }),
      )
      expect(reload().miniGames).toBe(false)
    })
  })
})
