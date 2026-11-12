import { describe, expect, it } from 'vite-plus/test'
import { capTopLevels, type TopPlayers } from './top-players'

const top = (): TopPlayers => ({
  season: { slug: 's', name: 'S' }, specId: 250, specName: 'Blood', className: 'Death Knight', region: 'us', observedAt: '2026-11-12T00:00:00.000Z',
  runsScanned: 1, source: 'test', population: 'test', players: [], builds: [], gearPlayers: 12, averageItemLevel: 337,
  slots: {
    head: { items: [{ id: 1, name: 'Helm', count: 8, level: 341, levelRange: { min: 331, max: 344 }, copy: { itemLevel: 344, bonusIds: [1, 2], count: 5 } }], enchants: [], gems: [] },
    neck: { items: [{ id: 2, name: 'Neck', count: 6, level: 328, levelRange: { min: 321, max: 328 }, copy: { itemLevel: 328, bonusIds: [3], count: 4 } }], enchants: [], gems: [] },
  },
})

describe('capping top players\' levels', () => {
  it('clamps levels, ranges, and copies above the cap and drops the bonus IDs that name the higher level', () => {
    const head = capTopLevels(top(), 334).slots.head!.items[0]!
    expect(head.level).toBe(334)
    expect(head.levelRange).toEqual({ min: 331, max: 334 })
    expect(head.copy).toEqual({ itemLevel: 334, bonusIds: [], count: 5 })
  })
  it('leaves items at or below the cap untouched, and does nothing without a cap', () => {
    expect(capTopLevels(top(), 334).slots.neck!.items[0]).toEqual(top().slots.neck!.items[0])
    expect(capTopLevels(top(), null)).toEqual(top())
  })
})
