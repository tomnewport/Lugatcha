import { shallowRef } from 'vue'
import { loadLessonIndex, loadLesson } from '@/db/lessons'
import { normalizeToken } from '@/exercises/validate'
import { db } from '@/db/useDb'
import { currentBase, glossNow, pickBase } from '@/i18n/content'

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
const SUFFIXES: { pattern: string; gloss: string; glossRu?: string }[] = [
  // --- Verbal endings (present/intent/continuous + person) -----------------
  { pattern: 'moqchiman', gloss: 'I intend to', glossRu: 'я собираюсь' },
  { pattern: 'moqchimisiz', gloss: 'do you intend to?', glossRu: 'вы собираетесь?' },
  { pattern: 'moqchisiz', gloss: 'you intend to', glossRu: 'вы собираетесь' },
  { pattern: 'moqchi', gloss: 'intend to', glossRu: 'собираться' },
  { pattern: 'yapman', gloss: "I'm …ing", glossRu: 'я …ю (наст.)' },
  { pattern: 'yapsiz', gloss: "you're …ing", glossRu: 'вы …ете (наст.)' },
  { pattern: 'yapti', gloss: 'is …ing', glossRu: '…ет (наст.)' },
  { pattern: 'yapmiz', gloss: "we're …ing", glossRu: 'мы …ем (наст.)' },
  { pattern: 'ayapman', gloss: "I'm …ing", glossRu: 'я …ю (наст.)' },
  { pattern: 'ayapsiz', gloss: "you're …ing", glossRu: 'вы …ете (наст.)' },
  { pattern: 'ayapti', gloss: 'is …ing', glossRu: '…ет (наст.)' },
  { pattern: 'moqda', gloss: 'is …ing', glossRu: '…ет (наст.)' },
  { pattern: 'aman', gloss: 'I (present)', glossRu: 'я (наст. вр.)' },
  { pattern: 'yman', gloss: 'I (present)', glossRu: 'я (наст. вр.)' },
  { pattern: 'asan', gloss: 'you (present)', glossRu: 'ты (наст. вр.)' },
  { pattern: 'ysan', gloss: 'you (present)', glossRu: 'ты (наст. вр.)' },
  { pattern: 'asiz', gloss: 'you (present)', glossRu: 'вы (наст. вр.)' },
  { pattern: 'ysiz', gloss: 'you (present)', glossRu: 'вы (наст. вр.)' },
  { pattern: 'amiz', gloss: 'we (present)', glossRu: 'мы (наст. вр.)' },
  { pattern: 'ymiz', gloss: 'we (present)', glossRu: 'мы (наст. вр.)' },
  { pattern: 'adilar', gloss: 'they (present)', glossRu: 'они (наст. вр.)' },
  { pattern: 'ydilar', gloss: 'they (present)', glossRu: 'они (наст. вр.)' },
  { pattern: 'adi', gloss: '(present)', glossRu: '(наст. вр.)' },
  { pattern: 'ydi', gloss: '(present)', glossRu: '(наст. вр.)' },
  { pattern: 'maydi', gloss: 'does not', glossRu: 'не (наст.)' },
  { pattern: 'may', gloss: 'not (present)', glossRu: 'не (наст. вр.)' },
  { pattern: 'ay', gloss: 'let me', glossRu: 'давай я' },
  { pattern: 'il', gloss: '(passive)', glossRu: '(страд. залог)' },
  // --- Past tense + person -------------------------------------------------
  { pattern: 'dingiz', gloss: 'you -ed (formal)', glossRu: 'вы (прош. вр.)' },
  { pattern: 'tingiz', gloss: 'you -ed (formal)', glossRu: 'вы (прош. вр.)' },
  { pattern: 'dilar', gloss: 'they -ed', glossRu: 'они (прош. вр.)' },
  { pattern: 'dim', gloss: 'I -ed', glossRu: 'я (прош. вр.)' },
  { pattern: 'tim', gloss: 'I -ed', glossRu: 'я (прош. вр.)' },
  { pattern: 'ding', gloss: 'you -ed', glossRu: 'ты (прош. вр.)' },
  { pattern: 'ting', gloss: 'you -ed', glossRu: 'ты (прош. вр.)' },
  { pattern: 'dik', gloss: 'we -ed', glossRu: 'мы (прош. вр.)' },
  { pattern: 'tik', gloss: 'we -ed', glossRu: 'мы (прош. вр.)' },
  { pattern: 'di', gloss: '-ed', glossRu: 'прош. вр.' },
  { pattern: 'ti', gloss: '-ed', glossRu: 'прош. вр.' },
  // --- Non-finite / mood ---------------------------------------------------
  { pattern: 'guncha', gloss: 'until …ing', glossRu: 'пока не' },
  { pattern: 'gani', gloss: 'in order to', glossRu: 'чтобы' },
  { pattern: 'gach', gloss: 'after …ing', glossRu: 'после того как' },
  { pattern: 'sangiz', gloss: 'if you', glossRu: 'если вы' },
  { pattern: 'aylik', gloss: "let's", glossRu: 'давайте' },
  { pattern: 'gan', gloss: '-ed (past ptcp)', glossRu: 'прич. прош. вр.' },
  { pattern: 'kan', gloss: '-ed (past ptcp)', glossRu: 'прич. прош. вр.' },
  { pattern: 'qan', gloss: '-ed (past ptcp)', glossRu: 'прич. прош. вр.' },
  { pattern: 'ish', gloss: '(verbal noun)', glossRu: '(отглаг. сущ.)' },
  { pattern: 'moq', gloss: '(infinitive)', glossRu: '(инфинитив)' },
  { pattern: 'sa', gloss: 'if', glossRu: 'если' },
  { pattern: 'ib', gloss: 'having …ed', glossRu: 'деепричастие' },
  // --- Possessive + case combinations (longest first) ----------------------
  { pattern: 'laringizdan', gloss: 'from your (pl, formal)', glossRu: 'от ваших (мн., вежл.)' },
  { pattern: 'larimizdan', gloss: 'from our (plural)', glossRu: 'от наших (мн.)' },
  { pattern: 'laringdan', gloss: 'from your (plural)', glossRu: 'от твоих (мн.)' },
  { pattern: 'larimdan', gloss: 'from my (plural)', glossRu: 'от моих (мн.)' },
  { pattern: 'larining', gloss: 'of their', glossRu: 'их (род. падеж)' },
  { pattern: 'larimni', gloss: 'my (pl, object)', glossRu: 'мои (мн., вин.)' },
  { pattern: 'larimga', gloss: 'to my (plural)', glossRu: 'к моим (мн.)' },
  { pattern: 'laringga', gloss: 'to your (plural)', glossRu: 'к твоим (мн.)' },
  { pattern: 'larimda', gloss: 'at my (plural)', glossRu: 'у моих (мн.)' },
  { pattern: 'lariga', gloss: 'to their', glossRu: 'к их' },
  { pattern: 'larida', gloss: 'at their', glossRu: 'у их' },
  { pattern: 'larini', gloss: 'their (object)', glossRu: 'их (вин. падеж)' },
  { pattern: 'ingizdan', gloss: 'from your (formal)', glossRu: 'от вашего (вежл.)' },
  { pattern: 'ingizning', gloss: 'of your (formal)', glossRu: 'вашего (род. падеж)' },
  { pattern: 'ingizga', gloss: 'to your (formal)', glossRu: 'к вашему (вежл.)' },
  { pattern: 'ingizda', gloss: 'at your (formal)', glossRu: 'у вашего (вежл.)' },
  { pattern: 'ingizni', gloss: 'your (formal, obj)', glossRu: 'ваш (вежл., вин.)' },
  { pattern: 'imizdan', gloss: 'from our', glossRu: 'от нашего' },
  { pattern: 'imizning', gloss: 'of our', glossRu: 'нашего (род. падеж)' },
  { pattern: 'imizga', gloss: 'to our', glossRu: 'к нашему' },
  { pattern: 'imizda', gloss: 'at our', glossRu: 'у нашего' },
  { pattern: 'imizni', gloss: 'our (object)', glossRu: 'наш (вин. падеж)' },
  // --- Possessive (after vowel): -ngiz / -ng ------------------------------
  { pattern: 'ngizdan', gloss: 'from your (formal)', glossRu: 'от вашего (вежл.)' },
  { pattern: 'ngizning', gloss: 'of your (formal)', glossRu: 'вашего (род. падеж)' },
  { pattern: 'ngizga', gloss: 'to your (formal)', glossRu: 'к вашему (вежл.)' },
  { pattern: 'ngizda', gloss: 'at your (formal)', glossRu: 'у вашего (вежл.)' },
  { pattern: 'ngizni', gloss: 'your (formal, obj)', glossRu: 'ваш (вежл., вин.)' },
  { pattern: 'ngiz', gloss: 'your (formal)', glossRu: 'ваш (вежл.)' },
  { pattern: 'ng', gloss: 'your', glossRu: 'твой' },
  // --- Plural --------------------------------------------------------------
  { pattern: 'lar', gloss: 'plural', glossRu: 'мн. ч.' },
  { pattern: 'ler', gloss: 'plural', glossRu: 'мн. ч.' },
  // --- Possessives (medium) ------------------------------------------------
  { pattern: 'ingiz', gloss: 'your (formal)', glossRu: 'ваш (вежл.)' },
  { pattern: 'imiz', gloss: 'our', glossRu: 'наш' },
  { pattern: 'lari', gloss: 'their', glossRu: 'их' },
  // --- Case suffixes -------------------------------------------------------
  { pattern: 'ning', gloss: 'of', glossRu: 'род. падеж' },
  { pattern: 'dan', gloss: 'from', glossRu: 'из/от' },
  { pattern: 'den', gloss: 'from', glossRu: 'из/от' },
  { pattern: 'ga', gloss: 'to', glossRu: 'к' },
  { pattern: 'ka', gloss: 'to', glossRu: 'к' },
  { pattern: 'qa', gloss: 'to', glossRu: 'к' },
  { pattern: 'da', gloss: 'at/in', glossRu: 'в/на' },
  { pattern: 'de', gloss: 'at/in', glossRu: 'в/на' },
  { pattern: 'ni', gloss: '(object)', glossRu: '(вин. падеж)' },
  // --- Short possessives ---------------------------------------------------
  { pattern: 'im', gloss: 'my', glossRu: 'мой' },
  { pattern: 'ing', gloss: 'your', glossRu: 'твой' },
  { pattern: 'si', gloss: 'his/her', glossRu: 'его/её' },
  // --- Ordinals ------------------------------------------------------------
  { pattern: 'inchi', gloss: '-th (ordinal)', glossRu: '-й (порядк.)' },
  { pattern: 'nchi', gloss: '-th (ordinal)', glossRu: '-й (порядк.)' },
  // --- Derivational / misc -------------------------------------------------
  { pattern: 'man', gloss: 'I am', glossRu: 'я есть' },
  { pattern: 'siz', gloss: 'without', glossRu: 'без' },
  { pattern: 'roq', gloss: 'more (–er)', glossRu: 'более (–ее)' },
  { pattern: 'cha', gloss: '(manner/dim.)', glossRu: '(образ дейст./уменьш.)' },
  { pattern: 'dek', gloss: 'like', glossRu: 'как' },
  { pattern: 'day', gloss: 'like', glossRu: 'как' },
  { pattern: 'ta', gloss: '(counter)', glossRu: '(счётн. слово)' },
  { pattern: 'li', gloss: 'with', glossRu: 'с' },
  { pattern: 'mas', gloss: 'not', glossRu: 'не' },
  { pattern: 'ma', gloss: 'not', glossRu: 'не' },
  { pattern: 'chi', gloss: 'how about?', glossRu: 'а как насчёт?' },
  { pattern: 'mi', gloss: '?', glossRu: '?' },
  // --- Shortest possessives last (guarded by exact-match precedence) -------
  { pattern: 'm', gloss: 'my', glossRu: 'мой' },
  { pattern: 'i', gloss: 'his/her/the', glossRu: 'его/её/опред.' },
]

// Keep first occurrence of each pattern (defends against accidental dups)
const SUFFIX_TABLE = SUFFIXES.filter(
  (s, i, arr) => arr.findIndex((x) => x.pattern === s.pattern) === i,
)

function analyzeWord(word: string, vocab: Map<string, string>, depth = 0): Breakdown | null {
  if (depth > 8 || word.length < 2) return null
  const ru = currentBase() === 'ru'
  const norm = normalizeToken(word)
  const meaning = vocab.get(norm)
  // Exact vocab/root match short-circuits — protects words that merely look
  // agglutinated (e.g. "boshqa" = other, not bosh + qa).
  if (meaning) return { breakdown: [word], gloss: [meaning] }
  for (const { pattern, gloss, glossRu } of SUFFIX_TABLE) {
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
        gloss: [...inner.gloss, ru ? (glossRu ?? gloss) : gloss],
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
  rootsRu?: Record<string, string>
}

/** Root glosses in the current base language (Russian falls back to English). */
async function loadRoots(): Promise<Record<string, string>> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}data/morphology/roots.json`)
    if (!res.ok) return {}
    const file = (await res.json()) as RootsFile
    const en = file.roots ?? {}
    if (currentBase() !== 'ru' || !file.rootsRu) return en
    // Russian glosses, with English fallback per key.
    const merged: Record<string, string> = { ...en }
    for (const [k, v] of Object.entries(file.rootsRu)) merged[k] = v
    return merged
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
    for (const [uz, gloss] of Object.entries(roots)) {
      vocab.set(normalizeToken(uz), gloss)
    }
    for (const w of allWords) {
      vocab.set(normalizeToken(w.uzbek), glossNow(w))
      for (const inf of w.inflections ?? []) {
        if (!vocab.has(normalizeToken(inf))) vocab.set(normalizeToken(inf), glossNow(w))
      }
    }
    vocabIndex.value = vocab

    // Build lesson breakdown index (hand-curated, highest priority)
    const base = currentBase()
    const lessons = await Promise.all(metas.map((m) => loadLesson(m.id)))
    const map = new Map<string, Breakdown>()
    for (const lesson of lessons) {
      if (!lesson) continue
      for (const section of lesson.sections) {
        for (const ex of section.examples ?? []) {
          if (ex.breakdown?.length && ex.gloss?.length) {
            map.set(normalizeToken(ex.uzbek), {
              breakdown: ex.breakdown,
              gloss: base === 'ru' && ex.glossRu?.length ? ex.glossRu : ex.gloss,
              meaning: pickBase(ex.english, ex.russian, base),
            })
          }
        }
      }
    }
    breakdownIndex.value = map
  })()
  return _loading
}

/** Rebuild the breakdown/vocab indexes — call when the base language changes. */
export function rebuildBreakdownIndex(): Promise<void> {
  _loading = null
  return ensureBreakdownIndex()
}
