import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { audioKey, normalizeSpokenText } from '@/audio/key'

// Shared with scripts/generate_audio.py --self-test: both implementations
// must produce these exact keys or prebuilt audio will silently never match.
const fixtures: Record<string, string> = JSON.parse(
  readFileSync(new URL('./audio-key-fixtures.json', import.meta.url), 'utf8'),
)

describe('audioKey', () => {
  it('matches the pinned fixtures', () => {
    for (const [text, expected] of Object.entries(fixtures)) {
      expect(audioKey(text), `key for ${JSON.stringify(text)}`).toBe(expected)
    }
  })

  it('folds apostrophe variants and whitespace to the same key', () => {
    expect(audioKey('toʻgʻri')).toBe(audioKey("to'g'ri"))
    expect(audioKey('  Salom   dunyo  ')).toBe(audioKey('Salom dunyo'))
  })

  it('distinguishes genuinely different text', () => {
    expect(audioKey('Salom')).not.toBe(audioKey('salom'))
    expect(audioKey('Rahmat')).not.toBe(audioKey('Rahmat!'))
  })
})

describe('normalizeSpokenText', () => {
  it('keeps punctuation (TTS needs it for prosody)', () => {
    expect(normalizeSpokenText('Qayerdan kelasiz?')).toBe('Qayerdan kelasiz?')
  })
})
