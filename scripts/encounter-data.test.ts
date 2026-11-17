import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { buildEncounters, bundleIcons } from './encounter-data'
import type { DungeonBundle, DungeonJournal, JournalDifficulty } from '../src/shared/dungeons'

const journal = (name: string, difficultyIds: number[], icon = 1): DungeonJournal => ({
  instanceId: 1, name, description: '', button: 500, background: null, difficultyIds,
  bosses: [{ encounterId: 10, name: 'Boss', description: '', portrait: 600, tips: [], overview: '', abilities: [{ id: 1, name: 'Hit', text: '', icon, flags: [], children: [{ id: 2, name: 'Splash', text: '', icon: 700, flags: [], children: [] }] }] }],
})
const season = {
  season: { slug: 's2', name: 'Season 2', endsAt: null }, generatedAt: 'x',
  dungeons: [
    { slug: 'a', name: 'A', shortName: 'A', challengeModeId: 1, timerMs: 1, routes: null, enemies: { dungeon: 'a', forcesRequired: 1, observedAt: 'x', source: 't', enemies: [{ npcId: 1, name: 'T', dangerous: false, kind: 'melee', elite: false, boss: false, health: null, forces: 1, spells: [{ id: 90, interrupt: true }] }] } },
    { slug: 'gone', name: 'Gone', shortName: 'G', challengeModeId: 2, timerMs: 1, routes: null, enemies: null },
  ],
  raids: [{ slug: 'lair', name: 'Lair', shortName: 'L', startsAt: null, encounters: [] }],
} satisfies DungeonBundle

describe('encounter bundle', () => {
  it('keeps each dungeon, each difficulty a raid has, its loot, and the enemy spells', async () => {
    const asked: Array<[string, JournalDifficulty]> = []
    const bundle = await buildEncounters(season, {
      build: '12.1.5',
      journal: async (name, _ids, difficulty) => { asked.push([name, difficulty]); return name === 'Gone' ? null : journal(name, name === 'Lair' ? [14, 15] : [8]) },
      loot: async ids => Object.fromEntries(ids.map(id => [id, [{ id: 5, name: 'Robe', quality: 4, slot: 'Chest', inventoryType: 20, armor: 'cloth', icon: 800, requiredLevel: 0 }]])),
      spells: async ids => Object.fromEntries(ids.map(id => [id, { id, name: 'Bolt', text: '', icon: 900 }])),
    }, new Date('2026-11-17T00:00:00Z'))
    assert.deepEqual(Object.keys(bundle.dungeons), ['a'])
    // A lair the journal tags only for Normal and Heroic offers just those
    assert.deepEqual(Object.keys(bundle.raids.lair ?? {}), ['normal', 'heroic'])
    assert.deepEqual(asked.filter(([name]) => name === 'Lair').map(([, difficulty]) => difficulty), ['heroic', 'normal'])
    assert.equal(bundle.dungeons.a?.bosses[0]?.loot?.[0]?.name, 'Robe')
    assert.deepEqual(Object.keys(bundle.spells), ['90'])
    assert.equal(bundle.gameBuild, '12.1.5')
    assert.deepEqual(bundleIcons(bundle), [1, 500, 600, 700, 800, 900])
  })
})
