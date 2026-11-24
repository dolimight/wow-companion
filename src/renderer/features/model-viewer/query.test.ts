import { describe, expect, it } from 'vite-plus/test'
import { parseQuery } from './query'

describe('model search words', () => {
  it('turns colours, themes, and effect words into filters, even misspelled, and keeps the rest for names', () => {
    const parsed = parseQuery('purpel fire efeect staff')
    expect(parsed.colors).toEqual(['purple'])
    expect(parsed.themes).toEqual(['fire'])
    expect(parsed.effect).toBe('with')
    expect(parsed.text).toBe('staff')
  })

  it('reads "no effect" and plain as wanting no effect, and synonyms as their colour', () => {
    expect(parseQuery('no effect sword').effect).toBe('without')
    expect(parseQuery('plain').effect).toBe('without')
    expect(parseQuery('yellow grey').colors).toEqual(['gold', 'gray'])
  })

  it('leaves names alone', () => {
    expect(parseQuery('Voidglass Kris')).toMatchObject({ text: 'voidglass kris', colors: [], themes: [], effect: 'any' })
  })
})
