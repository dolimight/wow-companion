import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { artBand, buildRaidHistory } from './raid-history'
import type { DungeonJournal } from '../src/shared/dungeons'
import type { RaidSeason } from '../src/shared/raids'

const journal = (name: string, bosses: string[], difficultyIds = [14, 15, 16, 17]): DungeonJournal => ({
  instanceId: 1, name, description: '', button: 500, background: null, difficultyIds,
  bosses: bosses.map((boss, at) => ({ encounterId: at + 1, name: boss, description: '', portrait: 600, tips: [], overview: '', abilities: [] })),
})

const season: RaidSeason = {
  slug: 'season-mn-1', name: 'MN Season 1', startsAt: '2026-03-24T15:00:00Z', endsAt: '2026-08-18T15:00:00Z',
  raids: [
    { slug: 'tier-mn-1', name: 'MN Tier 1 (VS / DR)', shortName: 'VS/DR', startsAt: '2026-03-17T15:00:00Z', encounters: [{ slug: 'a', name: 'Averzian' }, { slug: 'c', name: 'Chimaerus' }] },
    { slug: 'sporefall', name: 'Sporefall', shortName: 'SF', startsAt: '2026-06-16T15:00:00Z', encounters: [{ slug: 'r', name: 'Rotmire' }] },
    { slug: 'gone', name: 'Gone', shortName: 'G', startsAt: '2026-06-16T15:00:00Z', encounters: [{ slug: 'x', name: 'Nobody' }] },
  ],
}
const later: RaidSeason = {
  slug: 'season-mn-2', name: 'Midnight Season 2', startsAt: '2026-08-18T15:00:00Z', endsAt: '2026-11-01T15:00:00Z',
  raids: [{ slug: 'awakened-sporefall', name: 'Awakened Sporefall', shortName: 'ASF', startsAt: '2026-08-25T15:00:00Z', encounters: [{ slug: 'ar', name: 'Awakened Rotmire' }] }],
}

describe('raid history', () => {
  it('splits a combined tier into its journal instances and keeps each raid\'s difficulties, loot, and art', async () => {
    const instances: Record<string, Array<{ name: string; art: number | null }>> = {
      Averzian: [{ name: 'The Voidspire', art: 70 }, { name: "The Dreamrift", art: null }],
      Rotmire: [{ name: 'Sporefall', art: 80 }],
    }
    const asked: string[] = []
    const built = await buildRaidHistory([later, season], {
      build: '12.1.5',
      instances: async names => instances[names[0]!] ?? [],
      // Counts journal reads, so a raid run again is read once
      journal: async (name, _ids, difficulty) => { asked.push(name); return name === 'Sporefall' ? (difficulty === 'mythic' || difficulty === 'heroic' ? journal(name, ['Rotmire'], [15, 16]) : null)  : journal(name, name === 'The Voidspire' ? ['Averzian', 'Vorasius'] : ['Chimaerus']) },
      loot: async ids => Object.fromEntries(ids.map(id => [id, [{ id: 5, name: 'Robe', quality: 4, slot: 'Chest', inventoryType: 20, armor: 'cloth', icon: 800, requiredLevel: 0 }]])),
    }, new Date('2026-11-23T00:00:00Z'))
    const [rerun, kept] = built.history.seasons
    // The Awakened run is named by Raider.IO and shares the original's journal and art
    assert.deepEqual(rerun?.raids.map(raid => [raid.slug, raid.name, raid.journal]), [['awakened-sporefall', 'Awakened Sporefall', 'sporefall']])
    assert.equal(asked.filter(name => name === 'Sporefall').length, 2)
    assert.equal(built.journals.raids['awakened-sporefall'], undefined)
    assert.deepEqual(kept?.raids.map(raid => [raid.slug, raid.name, raid.shortName, raid.encounters.length]), [
      ['the-voidspire', 'The Voidspire', 'TV', 2],
      ['sporefall', 'Sporefall', 'SF', 1],
      ['the-dreamrift', 'The Dreamrift', 'TD', 1],
    ])
    assert.deepEqual(Object.keys(built.journals.raids['the-voidspire'] ?? {}), ['lfr', 'normal', 'heroic', 'mythic'])
    assert.deepEqual(Object.keys(built.journals.raids.sporefall ?? {}), ['heroic', 'mythic'])
    assert.equal(built.journals.raids.sporefall?.heroic?.bosses[0]?.loot?.[0]?.name, 'Robe')
    assert.deepEqual(built.art, { 'the-voidspire': 70, sporefall: 80, 'awakened-sporefall': 80 })
    assert.equal(built.history.gameBuild, '12.1.5')
  })

  it('finds the art between the flat border rows, even with a badge in the border', () => {
    const width = 4
    const gray = [150, 150, 150], art = [20, 40, 90], badge = [200, 30, 30]
    const rows = [[160, 160, 160], gray, gray, art, art, art, gray, gray]
    const pixels = rows.flatMap((colour, row) => Array.from({ length: width }, (_, x) => row === 1 && x === 0 ? badge : colour).flat())
    assert.deepEqual(artBand(Uint8Array.from(pixels), width), { top: 3, height: 3 })
    // A darker edge line around a tall border, and art that fills the picture
    const tall = [[100, 100, 100], ...Array.from({ length: 10 }, () => gray), art, art, ...Array.from({ length: 10 }, () => gray), [100, 100, 100]]
    assert.deepEqual(artBand(Uint8Array.from(tall.flatMap(colour => Array.from({ length: width }, () => colour).flat())), width), { top: 11, height: 2 })
    assert.deepEqual(artBand(Uint8Array.from(Array.from({ length: 12 }, () => Array.from({ length: width }, () => art).flat()).flat()), width), { top: 0, height: 12 })
  })
})
