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

  it('leaves the snake mini-game off by default', () => {
    expect(useSettingsStore().snakeGame).toBe(false)
  })

  it('remembers the opt-in, and the opt back out', () => {
    useSettingsStore().setSnakeGame(true)
    expect(reload().snakeGame).toBe(true)

    useSettingsStore().setSnakeGame(false)
    expect(reload().snakeGame).toBe(false)
  })

  it('keeps the other settings when the game is toggled', () => {
    const settings = useSettingsStore()
    settings.languageChosen = true
    settings.persist()
    settings.setSnakeGame(true)

    const reloaded = reload()
    expect(reloaded.languageChosen).toBe(true)
    expect(reloaded.baseLanguage).toBe('en')
    expect(reloaded.snakeGame).toBe(true)
  })

  it('defaults the game to off for settings saved before it existed', () => {
    localStorage.setItem(
      'lugatcha.settings',
      JSON.stringify({ baseLanguage: 'ru', languageChosen: true }),
    )
    const settings = reload()
    expect(settings.baseLanguage).toBe('ru')
    expect(settings.snakeGame).toBe(false)
  })
})
