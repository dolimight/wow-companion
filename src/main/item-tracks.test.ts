import { expect, it } from 'vite-plus/test'
import { itemTracks } from './item-tracks'

it('reads a raid item\'s tracks and top level from the season reference', () => {
  const tracks = itemTracks(270167)
  expect(tracks?.max).toEqual({ itemLevel: 334, track: 'Myth', rank: 6, ranks: 6, assumed: false })
  expect(tracks?.tracks.map(track => track.name)).toContain('Hero')
})

it('marks a Mythic+ item\'s top level as assumed because the server picks its track', () => {
  expect(itemTracks(250224)?.max).toMatchObject({ itemLevel: 334, track: 'Myth', assumed: true })
})

it('has nothing for items outside the current season', () => {
  expect(itemTracks(17)).toBeNull()
})

it('trusts the track groups in an item\'s own bonus tree over the loot list', () => {
  expect(itemTracks(999_999, [614, 615, 616, 617, 618])?.max).toEqual({ itemLevel: 334, track: 'Myth', rank: 6, ranks: 6, assumed: false })
  expect(itemTracks(999_999, [608, 609])).toBeNull()
})

it('names an earlier season\'s tracks from the game files\' track keys', () => {
  const tracks = itemTracks(999_999, [611, 612], [
    { group: 611, set: 11, key: 974, levels: [259, 263, 266, 269, 272, 276], latest: false },
    { group: 612, set: 11, key: 978, levels: [272, 276, 279, 282, 285, 289], latest: false },
  ])
  expect(tracks).toMatchObject({ season: 'An earlier season', max: { itemLevel: 289, track: 'Myth', rank: 6, ranks: 6, assumed: false } })
  expect(tracks?.tracks.map(track => track.name)).toEqual(['Hero', 'Myth'])
})
