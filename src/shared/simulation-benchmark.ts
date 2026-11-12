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

/** A planned item with the identifiers its planned enhancements resolved to; embellishment bonus lists go on top of the item's own */
export type PlannedItem = GearItem & { embellishmentBonusIds?: number[] }
export type PlanSwaps = { swaps: GearItem[]; skipped: string[] }
const sameGems = (a: number[] | null | undefined, b: number[] | null | undefined) => (a ?? []).filter(Boolean).sort().join() === (b ?? []).filter(Boolean).sort().join()
/**
 * The changes a saved plan makes to the gear you wear. A planned item with its own exact link is used as is; otherwise
 * it is described by id and level. Either way the plan's own enchant, gems, and embellishment win, and your equipped
 * enchant and gems fill in only where the plan doesn't say. Items you already wear at that level or higher, with the same
 * enhancements, are left alone
 */
export function planSwaps(character: Pick<Character, 'gear'>, planned: PlannedItem[]): PlanSwaps {
  const swaps: GearItem[] = []
  const skipped: string[] = []
  for (const item of planned) {
    const label = gearSlotLabels[item.slot]
    if (!item.itemId) { skipped.push(`${label}: the planned item is unknown`); continue }
    const current = character.gear.find(value => value.slot === item.slot)
    const added = item.embellishmentBonusIds ?? []
    const currentRaw = itemLinkVariant(current?.itemLink)
    const sameEnhancements = (item.enchantId == null || item.enchantId === (current?.enchantId ?? currentRaw.enchantId ?? 0))
      && (item.gemIds == null || sameGems(item.gemIds, current?.gemIds ?? currentRaw.gemIds)) && !added.length
    if (current?.itemId === item.itemId && (item.itemLevel === null || (current.itemLevel ?? 0) >= item.itemLevel) && sameEnhancements) continue
    if (item.itemLevel === null) { skipped.push(`${label}: the planned item level is unknown`); continue }
    const { embellishmentBonusIds: _, ...gear } = item
    const raw = itemLinkVariant(item.itemLink)
    const exact = item.itemLink && raw.bonusIds !== null
    if (exact) { swaps.push(added.length ? { ...gear, bonusIds: [...new Set([...(item.bonusIds ?? raw.bonusIds ?? []), ...added])] } : gear); continue }
    if (!current) { skipped.push(`${label}: nothing is equipped there to copy enchants and gems from`); continue }
    const described = describedItem(current, item.slot, gear)
    swaps.push({ ...described, enchantId: item.enchantId ?? described.enchantId, gemIds: item.gemIds?.some(Boolean) ? item.gemIds : described.gemIds, bonusIds: added })
  }
  return { swaps, skipped }
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
