/**
 * Deterministic key for a spoken Uzbek string, used to name prebuilt audio
 * files. scripts/generate_audio.py implements the identical algorithm —
 * tests/audio-key-fixtures.json pins both implementations.
 */

/** Folds rendering differences that don't change pronunciation. */
export function normalizeSpokenText(text: string): string {
  return text
    .normalize('NFC')
    .replace(/[‘’ʻʼ`´]/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

/** FNV-1a 64-bit over the UTF-8 bytes of the normalized text, as 16 hex chars. */
export function audioKey(text: string): string {
  const normalized = normalizeSpokenText(text)
  let hash = 0xcbf29ce484222325n
  const prime = 0x100000001b3n
  const mask = 0xffffffffffffffffn
  for (const byte of new TextEncoder().encode(normalized)) {
    hash ^= BigInt(byte)
    hash = (hash * prime) & mask
  }
  return hash.toString(16).padStart(16, '0')
}
