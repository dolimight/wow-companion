import { expect, it } from 'vite-plus/test'
import { itemTracks } from './item-tracks'
import { trackLevelOptions, type AscensionItem } from '../shared/gamedata'

const chest: AscensionItem = { inventoryType: 5, encounters: ['Some Earlier Boss'], setPiece: false }
const trinket: AscensionItem = { inventoryType: 12, encounters: ['Some Earlier Boss'], setPiece: false }
const elevated: AscensionItem = { inventoryType: 5, encounters: ['The Coiled Altar'], setPiece: false }
const tier: AscensionItem = { inventoryType: 5, encounters: [], setPiece: true }

it('stops armor at the crest ladder unless it drops elevated', () => {
  const tracks = itemTracks(270167, null, null, chest)
  expect(tracks?.max).toEqual({ itemLevel: 334, track: 'Myth', rank: 6, ranks: 6, assumed: false, ladderLevel: 334 })
  expect(tracks?.tracks.find(track => track.name === 'Myth')).toMatchObject({ levels: [318, 321, 324, 328, 331, 334], beyond: [] })
  expect(itemTracks(270167)?.max.itemLevel).toBe(334)
})

it('offers the Venomstone level on weapons, trinkets, and necklaces', () => {
  const tracks = itemTracks(270167, null, null, trinket)
  expect(tracks?.max).toEqual({ itemLevel: 341, track: 'Myth', rank: 8, ranks: 6, assumed: false, ladderLevel: 334, via: 'venomstone' })
  expect(tracks?.tracks.find(track => track.name === 'Hero')?.beyond).toEqual([{ level: 328, via: 'venomstone' }])
  expect(trackLevelOptions(tracks!).map(option => option.label).slice(0, 2)).toEqual(['Myth · Venomstone · 341 · Max', 'Myth 6/6 · 334'])
})

it('reaches Elevated Myth from the last two Mythic bosses and tier pieces', () => {
  for (const item of [elevated, tier]) expect(itemTracks(270167, null, null, item)?.max).toMatchObject({ itemLevel: 344, rank: 9, via: 'elevated' })
  const labels = trackLevelOptions(itemTracks(270167, null, null, { ...elevated, inventoryType: 12 })!).map(option => option.label)
  expect(labels.slice(0, 3)).toEqual(['Myth · Elevated · 344 · Max', 'Myth · Venomstone · 341', 'Myth 6/6 · 334'])
})

it('never offers the rank past 6/6 that has no known route', () => {
  const levels = itemTracks(270167, null, null, { ...elevated, inventoryType: 12 })!.tracks.flatMap(track => track.beyond?.map(rank => rank.level) ?? [])
  expect(levels).not.toContain(337)
})

it('marks a Mythic+ item\'s top level as assumed because the server picks its track', () => {
  expect(itemTracks(250224, null, null, trinket)?.max).toMatchObject({ itemLevel: 341, ladderLevel: 334, track: 'Myth', assumed: true })
})

it('has nothing for items outside the current season', () => {
  expect(itemTracks(17)).toBeNull()
})

it('trusts the track groups in an item\'s own bonus tree over the loot list', () => {
  expect(itemTracks(999_999, [614, 615, 616, 617, 618], null, tier)?.max).toEqual({ itemLevel: 344, track: 'Myth', rank: 9, ranks: 6, assumed: false, ladderLevel: 334, via: 'elevated' })
  expect(itemTracks(999_999, [608, 609])).toBeNull()
})

it('names an earlier season\'s tracks from the game files\' track keys', () => {
  const tracks = itemTracks(999_999, [611, 612], [
    { group: 611, set: 11, key: 974, levels: [259, 263, 266, 269, 272, 276], latest: false },
    { group: 612, set: 11, key: 978, levels: [272, 276, 279, 282, 285, 289], latest: false },
  ])
  expect(tracks).toMatchObject({ season: 'An earlier season', max: { itemLevel: 289, track: 'Myth', rank: 6, ranks: 6, assumed: false, ladderLevel: 289 } })
  expect(tracks?.tracks.map(track => track.name)).toEqual(['Hero', 'Myth'])
})
