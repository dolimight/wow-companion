import type { GearItem } from './domain'
import { topRegionNames, topSlotGroups, type TopPlayers } from './top-players'

export type EnchantGap = { label: string; enchant: string; share: number }
export type TopComparison = {
  population: string
  players: number
  itemLevel: { yours: number | null; average: number } | null
  /** Slots most sampled players enchant where your observed item has no enchant */
  enchantGaps: EnchantGap[]
  /** Slots compared, so a clean result says how much was checked */
  enchantSlotsChecked: number
}

/**
 * Your gear against the sampled top players of your specialization. The population is named every time: these are
 * leaderboard players, not players who time a given key level, so the result is a reference, not a verdict
 */
export function compareWithTop(gear: GearItem[], itemLevel: number | null, top: TopPlayers): TopComparison | null {
  if (!top.gearPlayers) return null
  const enchantGaps: EnchantGap[] = []
  let enchantSlotsChecked = 0
  for (const group of topSlotGroups) {
    const favourite = top.slots[group.group]?.enchants[0]
    if (!favourite) continue
    // Rings and trinkets are tallied together, so each of the pair counts once
    const share = favourite.count / (top.gearPlayers * group.slots.length)
    if (share < 0.5) continue
    for (const slot of group.slots) {
      const item = gear.find(entry => entry.slot === slot)
      if (!item || item.enchantCoverage !== 'complete') continue
      enchantSlotsChecked++
      if (!item.enchant) enchantGaps.push({ label: group.slots.length > 1 ? `${group.label} (${slot.endsWith('1') ? 'first' : 'second'})` : group.label, enchant: favourite.name, share: Math.min(1, share) })
    }
  }
  return {
    population: `${top.gearPlayers} top ${top.specName} ${top.className} players on ${top.source}, ${topRegionNames[top.region]}`,
    players: top.gearPlayers,
    itemLevel: top.averageItemLevel != null ? { yours: itemLevel, average: top.averageItemLevel } : null,
    enchantGaps,
    enchantSlotsChecked,
  }
}
