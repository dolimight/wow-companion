import { describe, expect, it } from 'vite-plus/test'
import { bareGeosets, outfitGeosets, weaponAnimations, wornAttachments, wornGeosets } from './model'

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

  it('keeps the robe skirt over pants while retaining the other visible pieces', () => {
    const geosets = outfitGeosets([
      { inventoryType: 7, geosetGroup: [0, 0, 2] },
      { inventoryType: 20, geosetGroup: [2, 0, 1] },
      { inventoryType: 10, geosetGroup: [1, 0] },
    ], available)
    expect(geosets).toEqual(expect.arrayContaining([1302, 803, 402]))
    expect(geosets).not.toContain(1303)
  })

  it('separates one-handed, two-handed, ranged, and off-hand motion', () => {
    expect(weaponAnimations(13, 7, 'mainHand')).toContain(17)
    expect(weaponAnimations(17, 8, 'mainHand')).toContain(18)
    expect(weaponAnimations(15, 2, 'mainHand')).toContain(46)
    expect(weaponAnimations(13, 7, 'offHand')).toContain(87)
    expect(wornAttachments(13, 'offHand')).toEqual([2])
    expect(weaponAnimations(5, 4)).toEqual([])
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
