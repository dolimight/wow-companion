import catalogJson from '../../data/season-rules/catalog.json'
import candidatesJson from '../../data/season-rules/candidates.json'
import type { ItemTracks, ItemTrackRange } from '../shared/gamedata'

type Candidate = { itemId: number; upgradeTrackId: string | null; source: { activity: string } }
type Track = { id: string; name: string; ranks: Array<{ rank: number; itemLevel: number }> }
type Ruleset = { id: string; name: string; upgradeTracks: Track[] }

const rulesets = (catalogJson as unknown as { rulesets: Ruleset[] }).rulesets
let loot: Map<number, { ruleset: Ruleset; variants: Candidate[] }> | null = null
function seasonLoot() {
  const map = new Map<number, { ruleset: Ruleset; variants: Candidate[] }>()
  for (const [id, list] of Object.entries(candidatesJson as unknown as Record<string, Candidate[]>)) {
    const ruleset = rulesets.find(entry => entry.id === id)
    if (!ruleset) continue
    for (const variant of list) {
      const entry = map.get(variant.itemId) ?? { ruleset, variants: [] }
      entry.variants.push(variant)
      map.set(variant.itemId, entry)
    }
  }
  return map
}

const range = (track: Track): ItemTrackRange => ({ name: track.name, ranks: track.ranks.length, minLevel: track.ranks[0]!.itemLevel, maxLevel: track.ranks.at(-1)!.itemLevel, levels: track.ranks.map(rank => rank.itemLevel) })
const season = (ruleset: Ruleset) => ruleset.name.split(' · ')[0]!
function result(ruleset: Ruleset, tracks: Track[], assumed: boolean): ItemTracks {
  const best = tracks.at(-1)!
  return { season: season(ruleset), tracks: tracks.map(range), max: { itemLevel: best.ranks.at(-1)!.itemLevel, track: best.name, rank: best.ranks.length, ranks: best.ranks.length, assumed } }
}

/**
 * Upgrade tracks a current-season item can drop on, and the highest level it can reach.
 * An item's bonus tree names the track groups it can roll, which settles most gear. Mythic+ drops
 * that only carry an older season's groups get their track from the server at the end of a run,
 * so for those only the season's top track can be named, and it is marked as assumed
 */
export function itemTracks(itemId: number, groups: number[] | null = null): ItemTracks | null {
  if (groups?.length) {
    const wanted = new Set(groups.map(group => `client-group-${group}`))
    for (const ruleset of rulesets) {
      const tracks = ruleset.upgradeTracks.filter(track => wanted.has(track.id))
      if (tracks.length) return result(ruleset, tracks, false)
    }
  }
  loot ??= seasonLoot()
  const entry = loot.get(itemId)
  if (!entry) return null
  const named = new Set(entry.variants.flatMap(variant => variant.upgradeTrackId ? [variant.upgradeTrackId] : []))
  const tracks = entry.ruleset.upgradeTracks.filter(track => named.has(track.id))
  if (tracks.length) return result(entry.ruleset, tracks, false)
  if (!entry.ruleset.upgradeTracks.length) return null
  // Mythic+ loot lands on Champion, Hero, or Myth depending on the keystone and the Great Vault
  return result(entry.ruleset, entry.variants[0]?.source.activity === 'mythicPlus' ? entry.ruleset.upgradeTracks.slice(-3) : entry.ruleset.upgradeTracks.slice(-1), true)
}
