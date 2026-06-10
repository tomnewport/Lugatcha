/**
 * Audio playback for Uzbek words and phrases.
 *
 * Prefers prebuilt MP3s (listed in /audio/manifest.json, produced by the TTS
 * pipeline and cached CacheFirst by Workbox). When no recording exists — which
 * is currently always, until the pipeline ships audio — falls back to the
 * Web Speech API, requesting an Uzbek voice where the device has one.
 */

const base = import.meta.env.BASE_URL

export type AudioManifest = Record<string, string>

let manifestPromise: Promise<AudioManifest | null> | undefined

export function getAudioManifest(): Promise<AudioManifest | null> {
  manifestPromise ??= fetch(`${base}audio/manifest.json`)
    .then((res) => (res.ok ? (res.json() as Promise<AudioManifest>) : null))
    .catch(() => null)
  return manifestPromise
}

let currentAudio: HTMLAudioElement | null = null

export function stopSpeaking(): void {
  if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel()
  if (currentAudio) {
    currentAudio.pause()
    currentAudio = null
  }
}

function playFile(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    const audio = new Audio(url)
    currentAudio = audio
    audio.onended = () => resolve(true)
    audio.onerror = () => resolve(false)
    audio.play().catch(() => resolve(false))
  })
}

function speakWithSynthesis(text: string): Promise<void> {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve()
  return new Promise((resolve) => {
    // Some engines never fire onend/onerror (e.g. no voice for the language),
    // so a watchdog keeps callers like the roleplay auto-advance from hanging.
    const watchdog = setTimeout(done, Math.min(2000 + text.length * 120, 10000))
    function done() {
      clearTimeout(watchdog)
      resolve()
    }
    const utterance = new SpeechSynthesisUtterance(text)
    const uzbekVoice = speechSynthesis
      .getVoices()
      .find((v) => v.lang.toLowerCase().startsWith('uz'))
    if (uzbekVoice) utterance.voice = uzbekVoice
    utterance.lang = 'uz-UZ'
    utterance.rate = 0.85
    utterance.onend = done
    utterance.onerror = done
    speechSynthesis.speak(utterance)
  })
}

/**
 * Speaks Uzbek text aloud. Resolves when playback finishes (or immediately if
 * no audio backend is available), so callers can sequence on it.
 */
export async function speakUzbek(text: string, audioId?: string): Promise<void> {
  stopSpeaking()
  if (audioId) {
    const manifest = await getAudioManifest()
    const file = manifest?.[audioId]
    if (file && (await playFile(`${base}audio/${file}`))) return
  }
  await speakWithSynthesis(text)
}
