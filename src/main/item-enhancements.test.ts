import { describe, expect, it } from 'vite-plus/test'
import { embellishmentCounts, embellishmentOf, enchantable } from '../shared/item-enhancements'
import { embellishmentRules } from './item-tracks'

describe('embellishments', () => {
  it('reads the client\'s limit of two embellished items', () => {
    expect(embellishmentRules?.find(category => category.name === 'Embellished')).toMatchObject({ limit: 2, bonusLists: [8960] })
  })
  it('spots an embellished copy from its bonus IDs and leaves unknown copies unknown', () => {
    expect(embellishmentOf(embellishmentRules, [12856, 8960])?.name).toBe('Embellished')
    expect(embellishmentOf(embellishmentRules, [12856])).toBeNull()
    expect(embellishmentOf(embellishmentRules, null)).toBeUndefined()
  })
  it('counts embellishments across a plan and flags any past the limit', () => {
    const counts = embellishmentCounts(embellishmentRules, [{ bonusIds: [8960] }, { bonusIds: [8960] }, { bonusIds: [8960, 1] }, { bonusIds: null }])
    expect(counts.find(category => category.name === 'Embellished')).toEqual({ name: 'Embellished', limit: 2, count: 3, over: 1 })
  })
  it('counts an embellishment planned onto a crafted item against its own limit', () => {
    const planned = { limit: 'Outdoor Embellished' }
    expect(embellishmentOf(embellishmentRules, [8960], planned)?.name).toBe('Outdoor Embellished')
    const counts = embellishmentCounts(embellishmentRules, [{ bonusIds: [8960] }, { embellishment: { limit: 'Embellished' } }, { embellishment: planned }])
    expect(counts.map(category => [category.name, category.count])).toEqual([['Embellished', 2], ['Outdoor Embellished', 1]])
  })
})

describe('enchantable slots', () => {
  const slots = ['head', 'shoulder', 'chest', 'legs', 'feet', 'finger1', 'finger2', 'mainHand', 'offHand'] as const
  it('allows only slots with a current enchant, and off-hands only when they are weapons', () => {
    expect(enchantable([...slots], 'wrist')).toBe(false)
    expect(enchantable([...slots], 'head')).toBe(true)
    expect(enchantable([...slots], 'offHand', 13)).toBe(true)
    expect(enchantable([...slots], 'offHand', 23)).toBe(false)
    expect(enchantable(null, 'head')).toBeNull()
  })
})
