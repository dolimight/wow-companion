import { existsSync, readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vite-plus/test'
import { seasonExpansion, type RaidHistory, type RaidHistoryJournals } from '../../../shared/raids'

const read = <T,>(path: string) => JSON.parse(readFileSync(resolve(path), 'utf8')) as T
const history = read<RaidHistory>('data/raids/history.json')
const journals = read<RaidHistoryJournals>('data/raids/encounters/history.json')
const icons = new Set(read<number[]>('data/dungeons/encounters/icons.json'))

describe('bundled raid history', () => {
  it('holds the ended seasons of the last three expansions, each raid with its bosses at every difficulty and its art', () => {
    expect(new Set(history.seasons.map(season => seasonExpansion(season.slug))).size).toBe(3)
    expect(history.seasons.map(season => season.name)).toContain('The War Within Season 1')
    for (const season of history.seasons) {
      expect(season.raids.length).toBeGreaterThan(0)
      for (const raid of season.raids) {
        const entry = journals.raids[raid.journal ?? raid.slug]
        expect(entry, raid.slug).toBeDefined()
        for (const journal of Object.values(entry ?? {})) expect(journal?.bosses.length, raid.slug).toBe(raid.encounters.length)
        if (raid.art) expect(existsSync(resolve('public/assets', raid.art)), raid.art).toBe(true)
        // Boss portraits ship with the app, so the page never needs the player's game files
        for (const boss of entry?.heroic?.bosses ?? []) if (boss.portrait) expect(icons.has(boss.portrait), `${boss.name} portrait`).toBe(true)
      }
    }
  })
})
