import type { Character } from './domain'
import { seasonDungeons } from './key-range'
import { vaultTracks, weekStart } from './weekly'

export type Alert = { key: string; title: string; body: string; characterId: string }

/** Season bests that rose between two observations of the same character */
export function newSeasonBests(before: Character, after: Character): Alert[] {
  const previous = new Map(seasonDungeons(before).dungeons.map(dungeon => [dungeon.dungeon, dungeon.timed?.level ?? 0]))
  return seasonDungeons(after).dungeons.flatMap(dungeon => {
    const level = dungeon.timed?.level
    const old = previous.get(dungeon.dungeon) ?? 0
    // A character seen for the first time has no history to beat
    if (!level || level <= old || !seasonDungeons(before).dungeons.length) return []
    return [{ key: `best:${after.id}:${dungeon.dungeon}:${level}`, characterId: after.id, title: `New season best for ${after.name}`, body: `Timed +${level} ${dungeon.dungeon}${old ? `, up from +${old}` : ''}` }]
  })
}

/**
 * After a weekly reset, characters that unlocked Great Vault choices last week have rewards waiting
 * Uses the progress observed before the reset, so it needs no new data from the game
 */
export function vaultReadyAlerts(characters: Character[], now = Date.now()): Alert[] {
  return characters.flatMap(character => {
    if (character.archived || character.demo) return []
    const start = weekStart(character.region, now)
    if (start == null) return []
    const lastWeek = vaultTracks(character.weekly, character.region, start - 1)
    const unlocked = lastWeek.reduce((sum, track) => sum + track.slots.filter(slot => slot.unlocked).length, 0)
    if (!unlocked) return []
    return [{ key: `vault:${character.id}:${new Date(start).toISOString()}`, characterId: character.id, title: `${character.name}'s Great Vault is ready`, body: `${unlocked} reward${unlocked === 1 ? '' : 's'} to choose from after the weekly reset` }]
  })
}
