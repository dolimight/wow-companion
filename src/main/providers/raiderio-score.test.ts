import { describe, expect, it } from 'vite-plus/test'
import { parseRaiderIoProfile } from './raiderio'

describe('Raider.IO run scores', () => {
  it('keeps each dungeon\'s best run score for the key planner', () => {
    const profile = parseRaiderIoProfile({ name: 'Astra', realm: 'Realm One', region: 'us', class: 'Mage', race: 'Human', profile_url: 'https://raider.io/characters/us/realm-one/astra', last_crawled_at: '2026-11-19T12:00:00.000Z',
      mythic_plus_best_runs: [{ dungeon: 'Fixture Halls', mythic_level: 12, num_keystone_upgrades: 1, score: 331.4 }],
      mythic_plus_alternate_runs: [{ dungeon: 'Fixture Halls', mythic_level: 13, num_keystone_upgrades: 0, score: 320 }] })
    expect(profile.extras.seasonRuns?.dungeons[0]).toMatchObject({ dungeon: 'Fixture Halls', score: 331.4, timed: { level: 12 } })
  })
})
