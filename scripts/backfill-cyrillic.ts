/**
 * Backfills the `cyrillic` field on every word in the shipped data files, using
 * the same Latin→Cyrillic rules the app uses at runtime. Run with Node's native
 * TypeScript support (no build step needed):
 *
 *   node scripts/backfill-cyrillic.ts
 *
 * Idempotent: re-running overwrites with freshly transliterated values, so it
 * doubles as the way to refresh Cyrillic after the rules change.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { latinToCyrillic } from '../src/exercises/transliterate.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = join(root, 'public', 'data')

interface WordLike {
  uzbek?: string
  cyrillic?: string
  [key: string]: unknown
}

/** Rebuilds a word object with `cyrillic` placed right after `uzbek`. */
function withCyrillic(word: WordLike): { changed: boolean; word: WordLike } {
  if (!word || typeof word.uzbek !== 'string') return { changed: false, word }
  const cyrillic = latinToCyrillic(word.uzbek)
  if (word.cyrillic === cyrillic) return { changed: false, word }
  const next: WordLike = {}
  for (const [key, value] of Object.entries(word)) {
    next[key] = value
    if (key === 'uzbek') next.cyrillic = cyrillic
  }
  if (!('cyrillic' in next)) next.cyrillic = cyrillic
  return { changed: true, word: next }
}

let filesChanged = 0
let wordsChanged = 0

function processFile(path: string, transform: (json: unknown) => unknown): void {
  const raw = readFileSync(path, 'utf8')
  const json = JSON.parse(raw)
  const before = wordsChanged
  const next = transform(json)
  if (wordsChanged === before) return
  writeFileSync(path, JSON.stringify(next, null, 2) + '\n')
  filesChanged++
}

function mapWords(words: unknown): unknown {
  if (!Array.isArray(words)) return words
  return words.map((w) => {
    const { changed, word } = withCyrillic(w as WordLike)
    if (changed) wordsChanged++
    return word
  })
}

// words/*.json — each file is a flat array of Word.
const wordsDir = join(dataDir, 'words')
for (const name of readdirSync(wordsDir)) {
  if (!name.endsWith('.json')) continue
  processFile(join(wordsDir, name), (json) => mapWords(json))
}

// groups/*.json — a VocabGroup object whose `.words` is an array of Word.
const groupsDir = join(dataDir, 'groups')
for (const name of readdirSync(groupsDir)) {
  if (!name.endsWith('.json') || name === 'index.json') continue
  processFile(join(groupsDir, name), (json) => {
    const group = json as { words?: unknown }
    if (group && typeof group === 'object') group.words = mapWords(group.words)
    return group
  })
}

// travel.json — an array of places, each with inline `.words`.
processFile(join(dataDir, 'travel.json'), (json) => {
  if (!Array.isArray(json)) return json
  return json.map((place) => {
    const p = place as { words?: unknown }
    if (p && typeof p === 'object') p.words = mapWords(p.words)
    return p
  })
})

console.log(`Backfilled ${wordsChanged} words across ${filesChanged} files.`)
