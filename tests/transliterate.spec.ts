import { describe, it, expect } from 'vitest'
import { latinToCyrillic } from '@/exercises/transliterate'

describe('latinToCyrillic', () => {
  it('maps the plain letters', () => {
    expect(latinToCyrillic('Salom')).toBe('Салом')
    expect(latinToCyrillic('Rahmat')).toBe('Раҳмат')
    expect(latinToCyrillic('chipta')).toBe('чипта')
    expect(latinToCyrillic('parvoz')).toBe('парвоз')
  })

  it('handles the turned-comma letters oʻ and gʻ, any apostrophe', () => {
    expect(latinToCyrillic("jo'nash")).toBe('жўнаш')
    expect(latinToCyrillic('joʻnash')).toBe('жўнаш')
    expect(latinToCyrillic("to'g'ri")).toBe('тўғри')
    expect(latinToCyrillic("Yo'q")).toBe('Йўқ')
  })

  it('keeps oʻ from being swallowed by the yo digraph', () => {
    expect(latinToCyrillic("yo'l")).toBe('йўл')
    expect(latinToCyrillic('daryo')).toBe('дарё') // genuine yo → ё
  })

  it('iotates ya/yo/yu/ye', () => {
    expect(latinToCyrillic('yangi')).toBe('янги')
    expect(latinToCyrillic('valyuta')).toBe('валюта')
  })

  it('uses positional e (э at a word start or after a vowel, е otherwise)', () => {
    expect(latinToCyrillic('eshik')).toBe('эшик')
    expect(latinToCyrillic('men')).toBe('мен')
    expect(latinToCyrillic('kel')).toBe('кел')
  })

  it('keeps the x/h split and q/gʻ distinct', () => {
    expect(latinToCyrillic('bojxona')).toBe('божхона')
    expect(latinToCyrillic('tarix')).toBe('тарих')
    expect(latinToCyrillic('qancha')).toBe('қанча')
  })

  it('maps the tutuq belgisi to ъ and passes spaces through', () => {
    expect(latinToCyrillic("san'at")).toBe('санъат')
    expect(latinToCyrillic('xayrli kun')).toBe('хайрли кун')
  })
})
