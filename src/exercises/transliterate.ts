/**
 * Uzbek Latin → Cyrillic transliteration.
 *
 * Uzbek's two official scripts map onto each other almost mechanically (see
 * docs/language/02-writing-systems.md). This produces the Cyrillic spelling of
 * a Latin word so the learner can be quizzed on recognising it by sight in
 * either script. The data files carry a pre-built `cyrillic` for every word;
 * this function is the source of truth that backfills them (scripts/backfill-
 * cyrillic.ts) and the runtime fallback for any word that lacks one.
 *
 * The tricky bits it handles:
 *  - the turned-comma letters `oʻ`→ў and `gʻ`→ғ (any apostrophe variant), which
 *    must win over the `yo` digraph so `yoʻl` → йўл, not ёл;
 *  - iotated `yo/yu/ya/ye` → ё/ю/я/е;
 *  - the `x`/`h` split (х vs ҳ) and `q`→қ, `gʻ`→ғ that Cyrillic keeps distinct;
 *  - positional `e`: э at the start of a word or after a vowel, е otherwise;
 *  - the tutuq belgisi `ʼ` (a lone apostrophe) → ъ.
 */

/** Every apostrophe-like glyph that can stand in for the turned comma / belgisi. */
const APOSTROPHES = "'’‘ʻʼ`´"

function isApostrophe(ch: string): boolean {
  return ch.length === 1 && APOSTROPHES.includes(ch)
}

function isLatinVowel(ch: string): boolean {
  return 'aeiou'.includes(ch)
}

/** Restores the original casing of a matched run onto its Cyrillic output. */
function applyCase(cyr: string, upper: boolean): string {
  return upper && cyr ? cyr[0].toUpperCase() + cyr.slice(1) : cyr
}

/** Transliterates an Uzbek Latin string to Cyrillic. Non-letters pass through. */
export function latinToCyrillic(input: string): string {
  const lower = input.toLowerCase()
  let out = ''
  let i = 0

  while (i < input.length) {
    const c = lower[i]
    const c2 = lower[i + 1] ?? ''
    const c3 = lower[i + 2] ?? ''
    const upper = input[i] !== lower[i]
    let cyr: string
    let adv = 2

    if (c === 'o' && isApostrophe(c2)) cyr = 'ў'
    else if (c === 'g' && isApostrophe(c2)) cyr = 'ғ'
    // y-iotation, but only when the following vowel is not itself an oʻ.
    else if (c === 'y' && c2 === 'o' && !isApostrophe(c3)) cyr = 'ё'
    else if (c === 'y' && c2 === 'u') cyr = 'ю'
    else if (c === 'y' && c2 === 'a') cyr = 'я'
    else if (c === 'y' && c2 === 'e') cyr = 'е'
    else if (c === 's' && c2 === 'h') cyr = 'ш'
    else if (c === 'c' && c2 === 'h') cyr = 'ч'
    else if (c === 'n' && c2 === 'g') cyr = 'нг'
    else if (c === 't' && c2 === 's') cyr = 'ц'
    else {
      adv = 1
      cyr = singleLetter(c, lower, i, input)
    }

    out += applyCase(cyr, upper)
    i += adv
  }

  return out
}

const SINGLE: Record<string, string> = {
  a: 'а', b: 'б', c: 'к', d: 'д', f: 'ф', g: 'г', h: 'ҳ', i: 'и', j: 'ж',
  k: 'к', l: 'л', m: 'м', n: 'н', o: 'о', p: 'п', q: 'қ', r: 'р', s: 'с',
  t: 'т', u: 'у', v: 'в', w: 'в', x: 'х', y: 'й', z: 'з',
}

function singleLetter(c: string, lower: string, i: number, original: string): string {
  if (c === 'e') {
    const atWordStart = i === 0 || !/\p{L}/u.test(original[i - 1])
    const afterVowel = i > 0 && isLatinVowel(lower[i - 1])
    return atWordStart || afterVowel ? 'э' : 'е'
  }
  if (isApostrophe(c)) return 'ъ'
  return SINGLE[c] ?? original[i]
}
