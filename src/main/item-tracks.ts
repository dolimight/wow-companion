import catalogJson from '../../data/season-rules/catalog.json'
import candidatesJson from '../../data/season-rules/candidates.json'
import type { AscensionItem, ItemAscension, ItemTrackGroup, ItemTracks, ItemTrackRange } from '../shared/gamedata'

type Candidate = { itemId: number; upgradeTrackId: string | null; source: { activity: string } }
type Track = { id: string; name: string; ranks: Array<{ rank: number; itemLevel: number }>; beyondRanks?: Array<{ rank: number; itemLevel: number; via?: ItemAscension | null }> }
type Ascension = { venomstoneInventoryTypes: number[]; elevatedEncounters: string[]; elevatedSets: boolean }
type Ruleset = { id: string; name: string; upgradeTracks: Track[]; ascension?: Ascension }

const rulesets = (catalogJson as unknown as { rulesets: Ruleset[] }).rulesets

/** Bosses whose drops reach Elevated Myth, so search can tell which items qualify without loading every source */
export const elevatedEncounters = [...new Set(rulesets.flatMap(ruleset => ruleset.ascension?.elevatedEncounters ?? []))]

function reaches(rules: Ascension | undefined, via: ItemAscension, item: AscensionItem | null) {
  if (!rules || !item) return false
  switch (via) {
    case 'venomstone': return rules.venomstoneInventoryTypes.includes(item.inventoryType)
    case 'elevated': return (rules.elevatedSets && item.setPiece) || item.encounters.some(encounter => rules.elevatedEncounters.includes(encounter))
    default: { const unhandled: never = via; return unhandled }
  }
}

/** Levels past the crest ladder this item can reach; a rank with no known route is left out */
const beyondFor = (ruleset: Ruleset, track: Track, item: AscensionItem | null) =>
  (track.beyondRanks ?? []).flatMap(rank => rank.via && reaches(ruleset.ascension, rank.via, item) ? [{ ...rank, via: rank.via }] : [])
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

const range = (ruleset: Ruleset, track: Track, item: AscensionItem | null): ItemTrackRange => ({ name: track.name, ranks: track.ranks.length, minLevel: track.ranks[0]!.itemLevel, maxLevel: track.ranks.at(-1)!.itemLevel, levels: track.ranks.map(rank => rank.itemLevel), beyond: beyondFor(ruleset, track, item).map(rank => ({ level: rank.itemLevel, via: rank.via })) })
const season = (ruleset: Ruleset) => ruleset.name.split(' · ')[0]!
function result(ruleset: Ruleset, tracks: Track[], assumed: boolean, item: AscensionItem | null): ItemTracks {
  const best = tracks.at(-1)!, ladder = best.ranks.at(-1)!, top = beyondFor(ruleset, best, item).at(-1)
  return { season: season(ruleset), tracks: tracks.map(track => range(ruleset, track, item)), max: { itemLevel: top?.itemLevel ?? ladder.itemLevel, track: best.name, rank: top?.rank ?? best.ranks.length, ranks: best.ranks.length, assumed, ladderLevel: ladder.itemLevel, ...(top ? { via: top.via } : {}) } }
}

// Track keys from ItemBonus type 34 stay the same every season; 971 to 978 match the current season's
// Mistcrest track names in the catalog, and 970 is the Explorer track below them
const trackNames: Record<number, string> = { 970: 'Explorer', 971: 'Adventurer', 972: 'Veteran', 973: 'Champion', 974: 'Hero', 978: 'Myth' }

/** Tracks straight from the game files, for gear the season catalog doesn't cover, such as earlier seasons' */
function fromGameFiles(info: ItemTrackGroup[]): ItemTracks | null {
  const newest = Math.max(...info.map(group => group.set))
  const groups = info.filter(group => group.set === newest && group.levels.length && trackNames[group.key]).sort((a, b) => a.levels[0]! - b.levels[0]!)
  if (!groups.length) return null
  const tracks = groups.map(group => ({ name: trackNames[group.key]!, ranks: group.levels.length, minLevel: group.levels[0]!, maxLevel: group.levels.at(-1)!, levels: group.levels }))
  const best = tracks.at(-1)!
  return { season: groups[0]!.latest ? 'This season' : 'An earlier season', tracks, max: { itemLevel: best.maxLevel, track: best.name, rank: best.ranks, ranks: best.ranks, assumed: false, ladderLevel: best.maxLevel } }
}

/**
 * Upgrade tracks a current-season item can drop on, and the highest level it can reach.
 * An item's bonus tree names the track groups it can roll, which settles most gear. Mythic+ drops
 * that only carry an older season's groups get their track from the server at the end of a run,
 * so for those only the season's top track can be named, and it is marked as assumed.
 * Levels past the crest ladder count only when `item` shows a route to them, such as a Venomstone slot
 */
export function itemTracks(itemId: number, groups: number[] | null = null, info: ItemTrackGroup[] | null = null, item: AscensionItem | null = null): ItemTracks | null {
  if (groups?.length) {
    const wanted = new Set(groups.map(group => `client-group-${group}`))
    for (const ruleset of rulesets) {
      const tracks = ruleset.upgradeTracks.filter(track => wanted.has(track.id))
      if (tracks.length) return result(ruleset, tracks, false, item)
    }
  }
  loot ??= seasonLoot()
  const entry = loot.get(itemId)
  if (!entry) return info?.length ? fromGameFiles(info) : null
  const named = new Set(entry.variants.flatMap(variant => variant.upgradeTrackId ? [variant.upgradeTrackId] : []))
  const tracks = entry.ruleset.upgradeTracks.filter(track => named.has(track.id))
  if (tracks.length) return result(entry.ruleset, tracks, false, item)
  if (!entry.ruleset.upgradeTracks.length) return null
  // Mythic+ loot lands on Champion, Hero, or Myth depending on the keystone and the Great Vault
  return result(entry.ruleset, entry.variants[0]?.source.activity === 'mythicPlus' ? entry.ruleset.upgradeTracks.slice(-3) : entry.ruleset.upgradeTracks.slice(-1), true, item)
}
