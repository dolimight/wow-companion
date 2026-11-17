import { existsSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import type { DungeonBundle } from '../../../shared/dungeons'
import { bundledDungeon, bundledRaid } from './bundled'
import bundle from '../../../../data/dungeons/season-mn-2.json'
import icons from '../../../../data/dungeons/encounters/icons.json'

const season = bundle as unknown as DungeonBundle

describe('bundled encounters', () => {
  it('has every season dungeon with the bosses Raider.IO lists, and their loot', () => {
    for (const dungeon of season.dungeons) {
      const journal = bundledDungeon(dungeon.slug)
      expect(journal, dungeon.slug).not.toBeNull()
      expect(journal!.bosses.map(boss => boss.encounterId), dungeon.slug).toEqual(expect.arrayContaining(dungeon.routes?.encounterIds ?? []))
      expect(journal!.bosses.some(boss => boss.loot?.length), dungeon.slug).toBe(true)
    }
  })

  it('has every season raid at the difficulties it offers', () => {
    for (const raid of season.raids ?? []) {
      const difficulties = bundledRaid(raid.slug)
      expect(Object.keys(difficulties ?? {}).length, raid.slug).toBeGreaterThan(0)
      for (const journal of Object.values(difficulties ?? {})) expect(journal!.bosses.length, raid.slug).toBe(raid.encounters.length)
    }
  })

  it('has the pulls of every route the page offers', () => {
    for (const dungeon of season.dungeons) {
      for (const family of (dungeon.routes?.families ?? []).filter(entry => entry.routeKey).slice(0, 5)) expect(dungeon.pulls?.[family.routeKey!]?.length, `${dungeon.slug} ${family.routeKey}`).toBeGreaterThan(0)
    }
  })

  it('ships every icon it lists', () => {
    const missing = icons.filter(id => !existsSync(resolve(__dirname, '../../../../public/assets/icons', `${id}.png`)))
    expect(missing).toEqual([])
  })
})
