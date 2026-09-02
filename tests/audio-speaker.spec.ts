import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createSpeaker } from '@/audio/audio'

/**
 * A speaker only ever silences its own words — see `createSpeaker` in
 * src/audio/audio.ts. This is what keeps a component's teardown from cutting
 * off the screen that replaced it: every autoplay in the app was being
 * silenced by the speaker buttons of the question it had just replaced.
 *
 * Under Node there is nothing to make a sound with: no manifest to fetch, no
 * audio element, no speech synthesis, so `speak` resolves having played
 * nothing. What is under test is the bookkeeping — who spoke last — which is
 * all that decides whether a `stop` is heard.
 */

/** `stopSpeaking` cancels the platform voice, which is how a stop is observed. */
const cancel = vi.fn()

beforeEach(() => {
  cancel.mockClear()
  // No manifest, so every utterance falls through to the platform voice.
  vi.stubGlobal(
    'fetch',
    vi.fn(() => Promise.reject(new Error('offline'))),
  )
  vi.stubGlobal('SpeechSynthesisUtterance', class {
    text: string
    onend: (() => void) | null = null
    constructor(text: string) {
      this.text = text
    }
  })
  vi.stubGlobal('speechSynthesis', {
    cancel,
    getVoices: () => [],
    speak: (utterance: { onend: (() => void) | null }) => utterance.onend?.(),
  })
})

describe('createSpeaker', () => {
  it('has nothing to stop before it has spoken', () => {
    expect(createSpeaker().holdsFloor).toBe(false)
  })

  it('holds the floor once it speaks', async () => {
    const speaker = createSpeaker()
    await speaker.speak('salom')
    expect(speaker.holdsFloor).toBe(true)
  })

  it('gives the floor up to whoever speaks next', async () => {
    const outgoing = createSpeaker()
    const incoming = createSpeaker()
    await outgoing.speak('xayr')
    await incoming.speak('salom')
    expect(outgoing.holdsFloor).toBe(false)
    expect(incoming.holdsFloor).toBe(true)
  })

  it('takes the floor back by speaking again', async () => {
    const first = createSpeaker()
    const second = createSpeaker()
    await first.speak('xayr')
    await second.speak('salom')
    await first.speak('rahmat')
    expect(first.holdsFloor).toBe(true)
    expect(second.holdsFloor).toBe(false)
  })

  it('holds the floor for single words and for stitched runs alike', async () => {
    const speaker = createSpeaker()
    await speaker.speakWord('bir')
    expect(speaker.holdsFloor).toBe(true)
    const other = createSpeaker()
    await other.speakWords(['ikki', 'ming'])
    expect(speaker.holdsFloor).toBe(false)
    expect(other.holdsFloor).toBe(true)
  })

  it('claims nothing for a run with no words in it', async () => {
    const speaker = createSpeaker()
    const other = createSpeaker()
    await other.speak('salom')
    await speaker.speakWords([])
    expect(speaker.holdsFloor).toBe(false)
    expect(other.holdsFloor).toBe(true)
  })

  it('stops nothing once somebody else has spoken', async () => {
    const outgoing = createSpeaker()
    const incoming = createSpeaker()
    await outgoing.speak('xayr')
    await incoming.speak('salom')
    cancel.mockClear()

    // The outgoing screen's teardown, arriving after its replacement has
    // already started speaking: it must leave the new word alone.
    outgoing.stop()
    expect(cancel).not.toHaveBeenCalled()
    expect(incoming.holdsFloor).toBe(true)

    incoming.stop()
    expect(cancel).toHaveBeenCalled()
  })
})
