import { shallowRef } from 'vue'
import { loadLessonIndex, loadLesson } from '@/db/lessons'
import { normalizeToken } from '@/exercises/validate'
import { db } from '@/db/useDb'

export interface Breakdown {
  breakdown: string[]
  gloss: string[]
  /** Full-word meaning for the assembled form, e.g. "my houses". */
  meaning?: string
}

export const breakdownIndex = shallowRef<Map<string, Breakdown>>(new Map())
export const vocabIndex = shallowRef<Map<string, string>>(new Map())

/**
 * Uzbek suffix inventory used by the recursive analyser. Ordered roughly
 * longest-first within groups; the analyser strips one suffix then recurses,
 * so combined verbal endings (e.g. `aman` = present + 1sg) are listed as units
 * because their internal vowels don't survive a separate strip.
 */
const SUFFIXES: { pattern: string; gloss: string }[] = [
  // --- Verbal endings (present/intent/continuous + person) -----------------
  { pattern: 'moqchiman', gloss: 'I intend to' },
  { pattern: 'moqchimisiz', gloss: 'do you intend to?' },
  { pattern: 'moqchisiz', gloss: 'you intend to' },
  { pattern: 'moqchi', gloss: 'intend to' },
  { pattern: 'yapman', gloss: "I'm …ing" },
  { pattern: 'yapsiz', gloss: "you're …ing" },
  { pattern: 'yapti', gloss: 'is …ing' },
  { pattern: 'yapmiz', gloss: "we're …ing" },
  { pattern: 'ayapman', gloss: "I'm …ing" },
  { pattern: 'ayapsiz', gloss: "you're …ing" },
  { pattern: 'ayapti', gloss: 'is …ing' },
  { pattern: 'moqda', gloss: 'is …ing' },
  { pattern: 'aman', gloss: 'I (present)' },
  { pattern: 'yman', gloss: 'I (present)' },
  { pattern: 'asan', gloss: 'you (present)' },
  { pattern: 'ysan', gloss: 'you (present)' },
  { pattern: 'asiz', gloss: 'you (present)' },
  { pattern: 'ysiz', gloss: 'you (present)' },
  { pattern: 'amiz', gloss: 'we (present)' },
  { pattern: 'ymiz', gloss: 'we (present)' },
  { pattern: 'adilar', gloss: 'they (present)' },
  { pattern: 'ydilar', gloss: 'they (present)' },
  { pattern: 'adi', gloss: '(present)' },
  { pattern: 'ydi', gloss: '(present)' },
  { pattern: 'maydi', gloss: 'does not' },
  { pattern: 'may', gloss: 'not (present)' },
  { pattern: 'ay', gloss: 'let me' },
  { pattern: 'il', gloss: '(passive)' },
  // --- Past tense + person -------------------------------------------------
  { pattern: 'dingiz', gloss: 'you -ed (formal)' },
  { pattern: 'tingiz', gloss: 'you -ed (formal)' },
  { pattern: 'dilar', gloss: 'they -ed' },
  { pattern: 'dim', gloss: 'I -ed' },
  { pattern: 'tim', gloss: 'I -ed' },
  { pattern: 'ding', gloss: 'you -ed' },
  { pattern: 'ting', gloss: 'you -ed' },
  { pattern: 'dik', gloss: 'we -ed' },
  { pattern: 'tik', gloss: 'we -ed' },
  { pattern: 'di', gloss: '-ed' },
  { pattern: 'ti', gloss: '-ed' },
  // --- Non-finite / mood ---------------------------------------------------
  { pattern: 'guncha', gloss: 'until …ing' },
  { pattern: 'gani', gloss: 'in order to' },
  { pattern: 'gach', gloss: 'after …ing' },
  { pattern: 'sangiz', gloss: 'if you' },
  { pattern: 'aylik', gloss: "let's" },
  { pattern: 'gan', gloss: '-ed (past ptcp)' },
  { pattern: 'kan', gloss: '-ed (past ptcp)' },
  { pattern: 'qan', gloss: '-ed (past ptcp)' },
  { pattern: 'ish', gloss: '(verbal noun)' },
  { pattern: 'moq', gloss: '(infinitive)' },
  { pattern: 'sa', gloss: 'if' },
  { pattern: 'ib', gloss: 'having …ed' },
  // --- Possessive + case combinations (longest first) ----------------------
  { pattern: 'laringizdan', gloss: 'from your (pl, formal)' },
  { pattern: 'larimizdan', gloss: 'from our (plural)' },
  { pattern: 'laringdan', gloss: 'from your (plural)' },
  { pattern: 'larimdan', gloss: 'from my (plural)' },
  { pattern: 'larining', gloss: 'of their' },
  { pattern: 'larimni', gloss: 'my (pl, object)' },
  { pattern: 'larimga', gloss: 'to my (plural)' },
  { pattern: 'laringga', gloss: 'to your (plural)' },
  { pattern: 'larimda', gloss: 'at my (plural)' },
  { pattern: 'lariga', gloss: 'to their' },
  { pattern: 'larida', gloss: 'at their' },
  { pattern: 'larini', gloss: 'their (object)' },
  { pattern: 'ingizdan', gloss: 'from your (formal)' },
  { pattern: 'ingizning', gloss: 'of your (formal)' },
  { pattern: 'ingizga', gloss: 'to your (formal)' },
  { pattern: 'ingizda', gloss: 'at your (formal)' },
  { pattern: 'ingizni', gloss: 'your (formal, obj)' },
  { pattern: 'imizdan', gloss: 'from our' },
  { pattern: 'imizning', gloss: 'of our' },
  { pattern: 'imizga', gloss: 'to our' },
  { pattern: 'imizda', gloss: 'at our' },
  { pattern: 'imizni', gloss: 'our (object)' },
  // --- Possessive (after vowel): -ngiz / -ng ------------------------------
  { pattern: 'ngizdan', gloss: 'from your (formal)' },
  { pattern: 'ngizning', gloss: 'of your (formal)' },
  { pattern: 'ngizga', gloss: 'to your (formal)' },
  { pattern: 'ngizda', gloss: 'at your (formal)' },
  { pattern: 'ngizni', gloss: 'your (formal, obj)' },
  { pattern: 'ngiz', gloss: 'your (formal)' },
  { pattern: 'ng', gloss: 'your' },
  // --- Plural --------------------------------------------------------------
  { pattern: 'lar', gloss: 'plural' },
  { pattern: 'ler', gloss: 'plural' },
  // --- Possessives (medium) ------------------------------------------------
  { pattern: 'ingiz', gloss: 'your (formal)' },
  { pattern: 'imiz', gloss: 'our' },
  { pattern: 'lari', gloss: 'their' },
  // --- Case suffixes -------------------------------------------------------
  { pattern: 'ning', gloss: 'of' },
  { pattern: 'dan', gloss: 'from' },
  { pattern: 'den', gloss: 'from' },
  { pattern: 'ga', gloss: 'to' },
  { pattern: 'ka', gloss: 'to' },
  { pattern: 'qa', gloss: 'to' },
  { pattern: 'da', gloss: 'at/in' },
  { pattern: 'de', gloss: 'at/in' },
  { pattern: 'ni', gloss: '(object)' },
  // --- Short possessives ---------------------------------------------------
  { pattern: 'im', gloss: 'my' },
  { pattern: 'ing', gloss: 'your' },
  { pattern: 'si', gloss: 'his/her' },
  // --- Ordinals ------------------------------------------------------------
  { pattern: 'inchi', gloss: '-th (ordinal)' },
  { pattern: 'nchi', gloss: '-th (ordinal)' },
  // --- Derivational / misc -------------------------------------------------
  { pattern: 'man', gloss: 'I am' },
  { pattern: 'siz', gloss: 'without' },
  { pattern: 'roq', gloss: 'more (–er)' },
  { pattern: 'cha', gloss: '(manner/dim.)' },
  { pattern: 'dek', gloss: 'like' },
  { pattern: 'day', gloss: 'like' },
  { pattern: 'ta', gloss: '(counter)' },
  { pattern: 'li', gloss: 'with' },
  { pattern: 'mas', gloss: 'not' },
  { pattern: 'ma', gloss: 'not' },
  { pattern: 'chi', gloss: 'how about?' },
  { pattern: 'mi', gloss: '?' },
  // --- Shortest possessives last (guarded by exact-match precedence) -------
  { pattern: 'm', gloss: 'my' },
  { pattern: 'i', gloss: 'his/her/the' },
]

// Keep first occurrence of each pattern (defends against accidental dups)
const SUFFIX_TABLE = SUFFIXES.filter(
  (s, i, arr) => arr.findIndex((x) => x.pattern === s.pattern) === i,
)

function analyzeWord(word: string, vocab: Map<string, string>, depth = 0): Breakdown | null {
  if (depth > 8 || word.length < 2) return null
  const norm = normalizeToken(word)
  const meaning = vocab.get(norm)
  // Exact vocab/root match short-circuits — protects words that merely look
  // agglutinated (e.g. "boshqa" = other, not bosh + qa).
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
  // Fall back to algorithmic analysis if the vocab/root index is loaded
  if (vocabIndex.value.size > 0) return analyzeWord(word, vocabIndex.value)
  return null
}

interface RootsFile {
  roots: Record<string, string>
}

async function loadRoots(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/morphology/roots.json`)
    if (!res.ok) return {}
    return ((await res.json()) as RootsFile).roots ?? {}
  } catch {
    return {}
  }
}

let _loading: Promise<void> | null = null

export function ensureBreakdownIndex(): Promise<void> {
  if (_loading) return _loading
  _loading = (async () => {
    const [metas, allWords, roots] = await Promise.all([
      loadLessonIndex(),
      db.words.toArray(),
      loadRoots(),
    ])

    // Build vocab lookup. Curated roots seed the map; learning vocabulary
    // (themed words + inflections) overlays on top so a word's own gloss wins.
    const vocab = new Map<string, string>()
    for (const [uz, en] of Object.entries(roots)) {
      vocab.set(normalizeToken(uz), en)
    }
    for (const w of allWords) {
      vocab.set(normalizeToken(w.uzbek), w.english)
      for (const inf of w.inflections ?? []) {
        if (!vocab.has(normalizeToken(inf))) vocab.set(normalizeToken(inf), w.english)
      }
    }
    vocabIndex.value = vocab

    // Build lesson breakdown index (hand-curated, highest priority)
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
              meaning: ex.english,
            })
          }
        }
      }
    }
    breakdownIndex.value = map
  })()
  return _loading
}
