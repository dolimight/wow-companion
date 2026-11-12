import type { Character, GearItem } from './domain'
import { itemLinkVariant } from './item-link'
import { topSlotGroups, type TopPlayers } from './top-players'

export type GearSlotName = GearItem['slot']
export const gearSlotLabels: Record<GearItem['slot'], string> = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Cloak', chest: 'Chest', wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2', mainHand: 'Main hand', offHand: 'Off hand' }
export type BenchmarkKind = 'gear' | 'talents' | 'both'
export const benchmarkLabels: Record<BenchmarkKind, string> = { gear: "Top players' gear", talents: "Top players' talents", both: "Top players' gear and talents" }
export type BenchmarkPlan = {
  /** Items swapped onto your character, empty when you already wear what they wear */
  gear: GearItem[]
  /** The most popular talent build, or null when yours already matches or no build is shared */
  talents: string | null
  kinds: BenchmarkKind[]
  /** Slots left as yours, with the reason, so the result says what was not tested */
  skipped: string[]
}

/**
 * An item described to the engine by id and level, carrying the enchant and gems of the item you wear in that slot so
 * a comparison isolates the item itself. Slot metadata comes from the planned item when known, else from yours
 */
export function describedItem(current: GearItem, slot: GearItem['slot'], item: Pick<GearItem, 'itemId' | 'name' | 'itemLevel'> & Partial<GearItem>): GearItem {
  const raw = itemLinkVariant(current.itemLink)
  return {
    ...current, inventoryType: item.inventoryType ?? current.inventoryType, classId: item.classId ?? current.classId, subclassId: item.subclassId ?? current.subclassId,
    slot, itemId: item.itemId, name: item.name, itemLevel: item.itemLevel === null ? null : Math.round(item.itemLevel), itemLink: null, bonusIds: [],
    enchantId: current.enchantId ?? raw.enchantId ?? 0, gemIds: current.gemIds ?? raw.gemIds ?? [0, 0, 0, 0],
    variantCoverage: 'complete', stats: [], effects: [], appearanceId: null,
  }
}

export type PlanSwaps = { swaps: GearItem[]; skipped: string[]; capped: string[] }
/**
 * The changes a saved plan makes to the gear you wear. A planned item with its own exact link is used as is; otherwise
 * it is described by id and level with your enchant and gems. Items you already wear at that level or higher are left alone.
 * Planned levels above `cap`, the top regular upgrade rank, run at the cap: ascension levels above it are too rare to plan on
 */
export function planSwaps(character: Pick<Character, 'gear'>, planned: GearItem[], cap: number | null = null): PlanSwaps {
  const swaps: GearItem[] = []
  const skipped: string[] = []
  const capped: string[] = []
  for (const original of planned) {
    const label = gearSlotLabels[original.slot]
    const over = cap !== null && original.itemLevel !== null && original.itemLevel > cap
    // A capped item drops its link and bonus IDs, which name the higher level, and keeps its own enchant and gems
    const item: GearItem = over ? { ...original, itemLevel: cap, itemLink: null, bonusIds: [] } : original
    if (over) capped.push(`${label}: ${item.name} runs at item level ${cap}, the top regular upgrade rank, instead of ${original.itemLevel}`)
    if (!item.itemId) { skipped.push(`${label}: the planned item is unknown`); continue }
    const current = character.gear.find(value => value.slot === item.slot)
    if (current?.itemId === item.itemId && (item.itemLevel === null || (current.itemLevel ?? 0) >= item.itemLevel)) continue
    if (item.itemLevel === null) { skipped.push(`${label}: the planned item level is unknown`); continue }
    const exact = item.itemLink && itemLinkVariant(item.itemLink).bonusIds !== null
    if (exact) { swaps.push(item); continue }
    if (!current) {
      if (over) { swaps.push(item); continue }
      skipped.push(`${label}: nothing is equipped there to copy enchants and gems from`); continue
    }
    const described = describedItem(current, item.slot, item)
    swaps.push(over ? { ...described, enchantId: original.enchantId ?? itemLinkVariant(original.itemLink).enchantId ?? described.enchantId, gemIds: original.gemIds ?? itemLinkVariant(original.itemLink).gemIds ?? described.gemIds } : described)
  }
  return { swaps, skipped, capped }
}

const loadoutPattern = /^[A-Za-z0-9+/=]{1,400}$/

/**
 * Builds the top-player setup to simulate on your own character. Items are the most worn in each slot at the highest
 * level any sampled player wears them, up to `cap`, keeping your own enchants and gems so the run isolates items and talents.
 * The cap is the top of the season's regular upgrade ranks: levels past it come from rare ascension routes few players reach.
 * Enchants are not copied because Raider.IO's enchant identifiers do not match SimulationCraft's
 */
export function benchmarkPlan(character: Pick<Character, 'gear' | 'talents'>, top: TopPlayers, cap: number | null = null): BenchmarkPlan {
  const gear: GearItem[] = []
  const skipped: string[] = []
  for (const group of topSlotGroups) {
    const tally = top.slots[group.group]
    if (!tally?.items.length) continue
    const yours = group.slots.map(slot => character.gear.find(item => item.slot === slot))
    if (yours.every(item => !item)) continue
    // A pair takes the two most worn different items, one per slot
    const picks = tally.items.slice(0, group.slots.length)
    group.slots.forEach((slot, index) => {
      const pick = picks[index]
      const current = yours[index]
      if (!pick || !current) { if (current) skipped.push(`${group.label}: not enough top players share a second item`); return }
      // The ceiling the sample shows, so the run measures fully upgraded top gear rather than a typical copy
      const seen = pick.levelRange?.max ?? pick.level ?? null
      const level = seen !== null && cap !== null ? Math.min(seen, cap) : seen
      if (level === null) { skipped.push(`${group.label}: the item level top players wear is unknown`); return }
      const already = character.gear.some(item => group.slots.includes(item.slot) && item.itemId === pick.id && (item.itemLevel ?? 0) >= level)
      if (already) return
      gear.push(describedItem(current, slot, { itemId: pick.id, name: pick.name, itemLevel: level }))
    })
  }
  const build = top.builds[0]
  const talents = build && build.count >= 2 && loadoutPattern.test(build.loadout) && build.loadout !== character.talents?.loadout ? build.loadout : null
  const kinds: BenchmarkKind[] = []
  if (gear.length) kinds.push('gear')
  if (talents) kinds.push('talents')
  if (gear.length && talents) kinds.push('both')
  return { gear, talents, kinds, skipped }
}

type Measured = { mean: number; standardError: number | null }
/** Plain reading of a benchmark: how much of the top-player setup your current one reaches */
export function benchmarkReading(baseline: Measured, results: Array<{ kind: BenchmarkKind; value: Measured }>) {
  const best = [...results].sort((a, b) => b.value.mean - a.value.mean)[0]
  if (!best || best.value.mean <= 0) return { share: 1, matches: true, best: null }
  const uncertainty = baseline.standardError !== null && best.value.standardError !== null ? 1.96 * Math.hypot(baseline.standardError, best.value.standardError) : null
  const matches = best.value.mean <= baseline.mean || (uncertainty !== null && best.value.mean - baseline.mean <= uncertainty)
  return { share: Math.min(1, baseline.mean / best.value.mean), matches, best: best.kind }
}
