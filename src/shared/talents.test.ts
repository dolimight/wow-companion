import { describe, expect, it } from 'vite-plus/test'
import { decodeLoadout } from './talents'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
/** Writes bits least significant first, six per character, the way the game exports talents */
function encode(fields: Array<[value: number, bits: number]>) {
  const bits: number[] = []
  for (const [value, size] of fields) for (let bit = 0; bit < size; bit++) bits.push(Math.floor(value / 2 ** bit) % 2)
  while (bits.length % 6) bits.push(0)
  let text = ''
  for (let index = 0; index < bits.length; index += 6) text += alphabet[bits.slice(index, index + 6).reduce((sum, bit, offset) => sum + bit * 2 ** offset, 0)]
  return text
}
const header = (version: number, specId: number): Array<[number, number]> => [[version, 8], [specId, 16], ...Array.from({ length: 16 }, (): [number, number] => [0, 8])]

describe('talent export strings', () => {
  it('reads selected, partly ranked, choice, and granted nodes in tree order (version 2)', () => {
    const text = encode([...header(2, 250),
      [0, 1], // 10: not selected
      [1, 1], [1, 1], [0, 1], [0, 1], // 11: bought at full rank
      [1, 1], [1, 1], [1, 1], [1, 6], [0, 1], // 12: bought, 1 rank of 2
      [1, 1], [1, 1], [0, 1], [1, 1], [1, 2], // 13: choice, second entry
      [1, 1], [0, 1], // 14: granted for free
    ])
    const ranks: Record<number, number> = { 10: 1, 11: 1, 12: 2, 13: 1, 14: 1 }
    expect(decodeLoadout(text, [10, 11, 12, 13, 14], id => ranks[id]!)).toEqual({
      version: 2, specId: 250, picks: [
        { nodeId: 11, ranks: 1, entryIndex: null, purchased: true },
        { nodeId: 12, ranks: 1, entryIndex: null, purchased: true },
        { nodeId: 13, ranks: 1, entryIndex: 1, purchased: true },
        { nodeId: 14, ranks: 1, entryIndex: null, purchased: false },
      ],
    })
  })
  it('reads version 1 strings, which have no granted flag', () => {
    const text = encode([...header(1, 62), [1, 1], [0, 1], [0, 1]])
    expect(decodeLoadout(text, [5], () => 3).picks).toEqual([{ nodeId: 5, ranks: 3, entryIndex: null, purchased: true }])
  })
  it('explains strings it cannot read', () => {
    expect(() => decodeLoadout('not a string!', [1], () => 1)).toThrow('This isn’t a talent string from the game')
    expect(() => decodeLoadout(encode(header(9, 62)), [1], () => 1)).toThrow('version 9')
    expect(() => decodeLoadout('C', [1], () => 1)).toThrow('cut short')
  })
})
