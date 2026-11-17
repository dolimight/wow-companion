import { describe, expect, it } from 'vite-plus/test'
import { raidStrategy } from './strategy'
import bundle from '../../../../data/dungeons/season-mn-2.json'
import type { DungeonBundle } from '../../../shared/dungeons'

const season = bundle as unknown as DungeonBundle

describe('raid strategy', () => {
  it('covers every bundled raid and each of its bosses', () => {
    expect(season.raids?.length).toBeGreaterThan(0)
    for (const raid of season.raids ?? []) {
      const strategy = raidStrategy(raid.slug)
      expect(strategy, raid.slug).not.toBeNull()
      expect(strategy!.bosses.map(boss => boss.name).sort(), raid.slug).toEqual(raid.encounters.map(encounter => encounter.name).sort())
      expect(new Set(strategy!.bosses.map(boss => boss.encounterId)).size).toBe(strategy!.bosses.length)
    }
  })
  it('writes short lines without a closing period', () => {
    for (const raid of season.raids ?? []) {
      for (const boss of raidStrategy(raid.slug)!.bosses) {
        for (const line of [boss.positioning, boss.everyone, boss.tank, boss.healer, boss.damage, boss.mythic].flatMap(list => list ?? [])) {
          expect(line.trim().length, boss.name).toBeGreaterThan(2)
          expect(line.endsWith('.'), `${boss.name}: ${line}`).toBe(false)
        }
      }
    }
  })
})
