import { describe, expect, it } from 'vite-plus/test'
import { colorName, paletteOf, tagString, themeTags } from './looks'

describe('look tags', () => {
  it('names a pixel by its hue, or as a neutral when it is dull', () => {
    expect(colorName(150, 60, 220)).toBe('purple')
    expect(colorName(230, 120, 30)).toBe('orange')
    expect(colorName(40, 120, 230)).toBe('blue')
    expect(colorName(240, 240, 240)).toBe('white')
    expect(colorName(10, 10, 12)).toBe('black')
  })

  it('reads the main colours of a picture, leaving out its frame and see-through pixels', () => {
    const size = 16
    const pixels = new Uint8Array(size * size * 4)
    for (let i = 0; i < size * size; i++) pixels.set(i % 3 === 0 ? [255, 255, 255, 0] : [150, 60, 220, 255], i * 4)
    expect(paletteOf(pixels, size, size)).toEqual(['purple'])
  })

  it('finds themes in names and in effect colours', () => {
    expect(themeTags('Cinderwall Great Mace')).toContain('fire')
    expect(themeTags('Plain Club', ['teal'])).toContain('frost')
    expect(tagString(['purple', 'purple', 'fire'])).toBe(',purple,fire,')
  })
})
