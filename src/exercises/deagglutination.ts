import { shallowRef } from 'vue'
import { loadLessonIndex, loadLesson } from '@/db/lessons'
import { normalizeToken } from '@/exercises/validate'
import { db } from '@/db/useDb'

export interface Breakdown {
  breakdown: string[]
  gloss: string[]
}

export const breakdownIndex = shallowRef<Map<string, Breakdown>>(new Map())
export const vocabIndex = shallowRef<Map<string, string>>(new Map())

// Ordered longest-first so greedy matching works correctly
const SUFFIXES: { pattern: string; gloss: string }[] = [
  // Possessive + case combinations (longer forms first)
  { pattern: 'larimdan', gloss: 'from my (plural)' },
  { pattern: 'laringdan', gloss: 'from your (plural)' },
  { pattern: 'laringizdan', gloss: 'from your (pl, formal)' },
  { pattern: 'larimizdan', gloss: 'from our (plural)' },
  { pattern: 'lariga', gloss: 'to their' },
  { pattern: 'larimga', gloss: 'to my (plural)' },
  { pattern: 'laringga', gloss: 'to your (plural)' },
  { pattern: 'larida', gloss: 'at their' },
  { pattern: 'larimda', gloss: 'at my (plural)' },
  { pattern: 'larini', gloss: 'their (object)' },
  { pattern: 'larimni', gloss: 'my (pl, object)' },
  { pattern: 'larining', gloss: 'of their' },
  // Possessives (longest first)
  { pattern: 'ingizdan', gloss: 'from your (formal)' },
  { pattern: 'ingizga', gloss: 'to your (formal)' },
  { pattern: 'ingizda', gloss: 'at your (formal)' },
  { pattern: 'ingizni', gloss: 'your (formal, obj)' },
  { pattern: 'ingizning', gloss: 'of your (formal)' },
  { pattern: 'imizdan', gloss: 'from our' },
  { pattern: 'imizga', gloss: 'to our' },
  { pattern: 'imizda', gloss: 'at our' },
  { pattern: 'imizni', gloss: 'our (object)' },
  { pattern: 'imizning', gloss: 'of our' },
  // Verbal suffixes
  { pattern: 'moqda', gloss: '-ing' },
  { pattern: 'yotir', gloss: '-ing (now)' },
  { pattern: 'ydi', gloss: 'was' },
  { pattern: 'adi', gloss: '(present)' },
  { pattern: 'edi', gloss: 'was' },
  { pattern: 'gan', gloss: '-ed (past ptcp)' },
  { pattern: 'ish', gloss: '(verbal noun)' },
  { pattern: 'moq', gloss: '(infinitive)' },
  { pattern: 'mas', gloss: 'not' },
  { pattern: 'chi', gloss: 'how about?' },
  { pattern: 'dir', gloss: '(definite)' },
  // Plural
  { pattern: 'lar', gloss: 'plural' },
  { pattern: 'ler', gloss: 'plural' },
  // Possessives (short)
  { pattern: 'ingiz', gloss: 'your (formal)' },
  { pattern: 'imiz', gloss: 'our' },
  { pattern: 'lari', gloss: 'their' },
  // Case suffixes
  { pattern: 'ning', gloss: 'of' },
  { pattern: 'dan', gloss: 'from' },
  { pattern: 'den', gloss: 'from' },
  { pattern: 'dan', gloss: 'from' },
  { pattern: 'ga', gloss: 'to' },
  { pattern: 'ka', gloss: 'to' },
  { pattern: 'qa', gloss: 'to' },
  { pattern: 'da', gloss: 'at/in' },
  { pattern: 'de', gloss: 'at/in' },
  { pattern: 'ni', gloss: '(object)' },
  // Short possessives
  { pattern: 'im', gloss: 'my' },
  { pattern: 'ing', gloss: 'your' },
  { pattern: 'si', gloss: 'his/her' },
  // Past tense
  { pattern: 'di', gloss: '-ed' },
  { pattern: 'ti', gloss: '-ed' },
  // Negation / question
  { pattern: 'ma', gloss: 'not' },
  { pattern: 'mi', gloss: '?' },
]

// Deduplicate: keep first occurrence of each pattern (the list has a couple of dups)
const SUFFIX_TABLE = SUFFIXES.filter(
  (s, i, arr) => arr.findIndex((x) => x.pattern === s.pattern) === i,
)

function analyzeWord(word: string, vocab: Map<string, string>, depth = 0): Breakdown | null {
  if (depth > 8 || word.length < 2) return null
  const norm = normalizeToken(word)
  const meaning = vocab.get(norm)
  if (meaning) return { breakdown: [word], gloss: [meaning] }
  for (const { pattern, gloss } of SUFFIX_TABLE) {
    if (norm.length <= pattern.length + 1) continue
    if (!norm.endsWith(pattern)) continue
    const stemNorm = norm.slice(0, norm.length - pattern.length)
    if (stemNorm.length < 2) continue
    // Preserve original case for display by slicing the original word
    const stem = word.slice(0, word.length - pattern.length)
    const inner = analyzeWord(stem, vocab, depth + 1)
    if (inner) {
      return {
        breakdown: [...inner.breakdown, pattern],
        gloss: [...inner.gloss, gloss],
      }
    }
  }
  return null
}

export function getBreakdown(word: string): Breakdown | null {
  const norm = normalizeToken(word)
  // Lesson examples take priority (they have hand-curated breakdowns)
  const lesson = breakdownIndex.value.get(norm)
  if (lesson) return lesson
  // Fall back to algorithmic analysis if vocab is loaded
  if (vocabIndex.value.size > 0) return analyzeWord(word, vocabIndex.value)
  return null
}

let _loading: Promise<void> | null = null

export function ensureBreakdownIndex(): Promise<void> {
  if (_loading) return _loading
  _loading = (async () => {
    const [metas, allWords] = await Promise.all([
      loadLessonIndex(),
      db.words.toArray(),
    ])

    // Build vocab lookup: normalized Uzbek → English
    const vocab = new Map<string, string>()
    for (const w of allWords) {
      vocab.set(normalizeToken(w.uzbek), w.english)
      // Index inflections too when present
      for (const inf of w.inflections ?? []) {
        if (!vocab.has(normalizeToken(inf))) {
          vocab.set(normalizeToken(inf), w.english)
        }
      }
    }
    vocabIndex.value = vocab

    // Build lesson breakdown index
    const lessons = await Promise.all(metas.map((m) => loadLesson(m.id)))
    const map = new Map<string, Breakdown>()
    for (const lesson of lessons) {
      if (!lesson) continue
      for (const section of lesson.sections) {
        for (const ex of section.examples ?? []) {
          if (ex.breakdown?.length && ex.gloss?.length) {
            map.set(normalizeToken(ex.uzbek), {
              breakdown: ex.breakdown,
              gloss: ex.gloss,
            })
          }
        }
      }
    }
    breakdownIndex.value = map
  })()
  return _loading
}
