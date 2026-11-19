import { describe, expect, it } from 'vite-plus/test'
import { keyGains, scoreModel } from './key-score'

const run = (dungeon: string, level: number, score: number | null) => ({ dungeon, timed: { level, durationMs: null, upgrades: 1, completedAt: null }, score })

describe('key planner', () => {
  it('fits score per key level from the player\'s own runs, and needs two levels to draw a line', () => {
    const model = scoreModel([run('A', 10, 300), run('B', 12, 330), run('C', 14, 360)])
    expect(model?.perLevel).toBeCloseTo(15)
    expect(model?.base).toBeCloseTo(150)
    expect(scoreModel([run('A', 10, 300), run('B', 10, 305)])).toBeNull()
    expect(scoreModel([run('A', 10, null), run('B', 12, null)])).toBeNull()
  })

  it('ranks each dungeon\'s next level by the rating it adds, lowest dungeon first on a tie', () => {
    const dungeons = [run('Low', 8, 270), run('Mid', 12, 330), run('High', 14, 360)]
    const gains = keyGains(dungeons, scoreModel(dungeons)!)
    expect(gains.map(entry => [entry.dungeon, entry.level, Math.round(entry.gain)])).toEqual([['Low', 9, 15], ['Mid', 13, 15], ['High', 15, 15]])
    expect(keyGains([{ dungeon: 'New', timed: null, score: null }], { base: 150, perLevel: 15, samples: 3 })[0]).toMatchObject({ level: 2, gain: 180 })
  })
})
