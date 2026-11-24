import { describe, expect, it } from 'vite-plus/test'
import { bareGeosets, wornAttachments, wornGeosets } from './model'

describe('worn items', () => {
  const available = new Set([...bareGeosets, 802, 803, 1302, 1303, 402, 403, 1502, 1802])

  it('switches on the body pieces an item picks, replacing the bare piece of each group', () => {
    // A robe with long sleeves (803) and a skirt (1302) in place of bare legs
    const robe = wornGeosets(20, [2, 0, 1], available)
    expect(robe).toContain(803)
    expect(robe).toContain(1302)
    expect(robe).not.toContain(1301)
    // Gloves at their first variation keep bare hands
    expect(wornGeosets(10, [0, 0], available)).toContain(401)
    expect(wornGeosets(10, [1, 0], available)).toContain(402)
    // A cloak picks its cape
    expect(wornGeosets(16, [1], available)).toContain(1502)
    // A piece the body lacks is skipped
    expect(wornGeosets(6, [5], available)).toContain(1801)
  })

  it('hangs models on the right points', () => {
    expect(wornAttachments(1)).toEqual([11])
    expect(wornAttachments(3)).toEqual([6, 5])
    expect(wornAttachments(17)).toEqual([1])
    expect(wornAttachments(14)).toEqual([0])
    expect(wornAttachments(5)).toEqual([])
  })
})

describe('batch shaders', () => {
  it('reads effect shaders from the table and older ones from their bits', async () => {
    const { batchShader, combiners } = await import('./model')
    const effect = batchShader(0x8003, 3)
    expect(combiners[effect.combiner]).toBe('Opaque_Mod2xNA_Alpha_Add')
    expect(effect.coords).toEqual(['uv', 'env', 'uv'])
    expect(combiners[batchShader(0x4011, 2).combiner]).toBe('Mod_Mod')
    expect(batchShader(0x4011, 2).coords).toEqual(['uv', 'uv2'])
    expect(combiners[batchShader(0, 1).combiner]).toBe('Opaque')
    expect(batchShader(0x80, 1).coords).toEqual(['env'])
  })
})
