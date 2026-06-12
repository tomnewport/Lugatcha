/**
 * Pre-tokenize roleplay user turns (issue #77).
 *
 * Phrase assembly builds its word bank from the `tokens` array on each user
 * turn. Where it is missing the app falls back to runtime tokenization, so the
 * bank can drift between locations. This script populates `tokens` for every
 * user turn across all roleplay files using the same logic as the validator
 * (`src/exercises/validate.ts`): split on whitespace, drop tokens that are pure
 * punctuation. It is idempotent — re-running it is a no-op once data is clean.
 *
 *   node scripts/tokenize-roleplay.mjs
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROLEPLAY_DIR = join(HERE, '..', 'public', 'data', 'roleplay')

// Mirrors normalizeToken/tokenize in src/exercises/validate.ts.
const APOSTROPHES = /[‘’ʻʼ`´']/g
const PUNCTUATION = /[.,!?;:"«»()—–]/g

function normalizeToken(token) {
  return token
    .normalize('NFC')
    .toLocaleLowerCase()
    .replace(APOSTROPHES, "'")
    .replace(PUNCTUATION, '')
    .trim()
}

function tokenize(sentence) {
  return sentence.split(/\s+/).filter((t) => normalizeToken(t).length > 0)
}

let changedFiles = 0
let touchedTurns = 0

for (const file of readdirSync(ROLEPLAY_DIR).filter((f) => f.endsWith('.json'))) {
  const path = join(ROLEPLAY_DIR, file)
  const scenarios = JSON.parse(readFileSync(path, 'utf8'))

  let fileChanged = false
  for (const scenario of scenarios) {
    for (const variant of scenario.variants ?? []) {
      for (const turn of variant.turns ?? []) {
        if (turn.speaker !== 'user') continue
        const tokens = tokenize(turn.uzbek)
        if (JSON.stringify(turn.tokens) !== JSON.stringify(tokens)) {
          turn.tokens = tokens
          touchedTurns += 1
          fileChanged = true
        }
      }
    }
  }

  if (fileChanged) {
    writeFileSync(path, JSON.stringify(scenarios, null, 2) + '\n')
    changedFiles += 1
    console.log(`updated ${file}`)
  }
}

console.log(`\nDone: ${touchedTurns} user turn(s) tokenized across ${changedFiles} file(s).`)
