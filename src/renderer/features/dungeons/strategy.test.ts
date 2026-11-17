import { describe, expect, it } from 'vite-plus/test'
import { dungeonStrategy } from './strategy'
import bundle from '../../../../data/dungeons/season-mn-2.json'
import type { DungeonBundle, StrategyNotes } from '../../../shared/dungeons'

const season = bundle as unknown as DungeonBundle
const lines = (notes: StrategyNotes) => [notes.positioning, notes.everyone, notes.tank, notes.healer, notes.damage].flatMap(list => list ?? [])

describe('dungeon strategy', () => {
  it('covers every bundled dungeon', () => {
    for (const dungeon of season.dungeons) expect(dungeonStrategy(dungeon.slug), dungeon.slug).not.toBeNull()
  })
  it('names bosses and enemies the bundled data knows', () => {
    for (const dungeon of season.dungeons) {
      const strategy = dungeonStrategy(dungeon.slug)!
      const names = new Set(dungeon.enemies?.enemies.map(enemy => enemy.name))
      for (const boss of strategy.bosses) expect(dungeon.routes?.encounterIds, `${dungeon.slug} ${boss.name}`).toContain(boss.encounterId)
      for (const enemy of strategy.enemies) expect(names.has(enemy.name), `${dungeon.slug} ${enemy.name}`).toBe(true)
    }
  })
  it('writes short lines without a closing period', () => {
    for (const dungeon of season.dungeons) {
      const strategy = dungeonStrategy(dungeon.slug)!
      for (const entry of [...strategy.bosses, ...strategy.enemies]) {
        for (const line of [...lines(entry), ...('threat' in entry ? [entry.threat] : [])]) {
          expect(line.trim().length, entry.name).toBeGreaterThan(2)
          expect(line.endsWith('.'), `${entry.name}: ${line}`).toBe(false)
        }
      }
      expect(strategy.source.url).toMatch(/^https:\/\//)
    }
  })
})
