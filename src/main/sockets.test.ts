import { describe, expect, it } from 'vite-plus/test'
import { itemSockets, socketLabel } from '../shared/sockets'
import { socketRules } from './item-tracks'

const neck = { inventoryType: 2, sockets: 1 }, ring = { inventoryType: 11, sockets: 0 }, helm = { inventoryType: 1, sockets: 0 }, chest = { inventoryType: 5, sockets: 0 }

describe('item sockets', () => {
  it('reads a copy\'s sockets from its bonus IDs', () => {
    expect(itemSockets(socketRules, neck, [12856, 13668])).toEqual({ sockets: 2, addable: 0, exact: true })
    expect(itemSockets(socketRules, helm, [12856, 13695])).toEqual({ sockets: 1, addable: 0, exact: true })
    expect(itemSockets(socketRules, helm, [12856])).toEqual({ sockets: 0, addable: 1, exact: true })
  })
  it('assumes a picked item drops like this season\'s, with the jewelry socket and nothing added', () => {
    expect(itemSockets(socketRules, neck)).toEqual({ sockets: 2, addable: 0, exact: false })
    expect(itemSockets(socketRules, ring)).toEqual({ sockets: 1, addable: 0, exact: false })
    expect(itemSockets(socketRules, helm)).toEqual({ sockets: 0, addable: 1, exact: false })
    expect(itemSockets(socketRules, chest)).toEqual({ sockets: 0, addable: 0, exact: false })
  })
  it('falls back to the base sockets without reviewed rules', () => {
    expect(itemSockets(null, neck, [13668])).toEqual({ sockets: 1, addable: 0, exact: false })
  })
  it('names sockets and what can still be added', () => {
    expect(socketLabel({ sockets: 2, addable: 0, exact: true })).toBe('2 sockets')
    expect(socketLabel({ sockets: 0, addable: 1, exact: false })).toBe('No sockets · 1 can be added')
    expect(socketLabel({ sockets: 1, addable: 1, exact: false })).toBe('1 socket · 1 more can be added')
    expect(socketLabel({ sockets: 0, addable: 0, exact: false })).toBe('No sockets')
  })
})
