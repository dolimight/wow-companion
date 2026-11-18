import { z } from 'zod'
import { activitySchema, type Character, type GearItem, type GearSlot } from './domain'
import { getItemCompatibility } from './item-compatibility'
import { simulationScenarioSchema } from './simulation'

/**
 * The gear optimizer: every piece the player owns, plus drops and top-player items they could still get, screened one at
 * a time in SimulationCraft, combined into whole sets (by the connected AI assistant, or by the app), and the best sets
 * confirmed with a precise run. Owned sets answer what to wear now; sets with targets answer what to chase
 */
export const optimizerStartSchema = z.object({
  characterId: z.string().min(1).max(100),
  activity: activitySchema.default('mythicPlus'),
  scenarioId: simulationScenarioSchema.default('dungeon-slice'),
  includeTargets: z.boolean().default(true),
})
export type OptimizerStart = z.input<typeof optimizerStartSchema>

export type OptimizerOrigin = 'equipped' | 'bags' | 'bank' | 'vault' | 'drop' | 'top'
export const ownedOrigins: readonly OptimizerOrigin[] = ['equipped', 'bags', 'bank', 'vault']
export const originLabels: Record<OptimizerOrigin, string> = { equipped: 'Equipped', bags: 'In your bags', bank: 'In your bank', vault: 'Great Vault choice', drop: 'Drops this season', top: 'Worn by top players' }

/** One piece for one slot: a ring or trinket is a candidate for each of its two slots */
export type OptimizerCandidate = {
  key: string
  slot: GearSlot
  item: GearItem
  origin: OptimizerOrigin
  /** Where to get it, such as the boss and instance, or how many top players wear it */
  source: string | null
  icon: number | null
  quality: number | null
  /** Share of sampled top players who wear it, from 0 to 1 */
  popularity: number | null
}

export type OptimizerMeasure = { mean: number; error: number | null; gain: number }
export type OptimizerCombo = { key: string; label: string; picks: Partial<Record<GearSlot, string>>; why: string | null; by: 'ai' | 'app' }
export const optimizerStages = ['gathering', 'screening', 'choosing', 'confirming', 'done'] as const
export type OptimizerStage = (typeof optimizerStages)[number] | 'failed' | 'cancelled'

export type OptimizerRun = {
  id: string
  characterId: string
  activity: z.infer<typeof activitySchema>
  stage: OptimizerStage
  startedAt: string
  finishedAt: string | null
  /** When the current stage began, so the page can show how long it has run */
  stageStartedAt: string
  scenarioId: z.infer<typeof simulationScenarioSchema>
  includeTargets: boolean
  threads: number
  /** The AI assistant that chose the sets, or null when the app chose them */
  provider: string | null
  baseline: number | null
  pool: OptimizerCandidate[]
  screen: Record<string, OptimizerMeasure>
  combos: OptimizerCombo[]
  results: Record<string, OptimizerMeasure>
  /** The best set of owned gear, and the best set with targets when it beats it */
  wearNow: string | null
  chase: string | null
  summary: string | null
  notes: string[]
  failure: string | null
}

export const pairedSlots: Partial<Record<GearSlot, GearSlot>> = { finger1: 'finger2', finger2: 'finger1', trinket1: 'trinket2', trinket2: 'trinket1' }
export const isOwned = (candidate: Pick<OptimizerCandidate, 'origin'>) => ownedOrigins.includes(candidate.origin)
export const candidateKey = (slot: GearSlot, item: Pick<GearItem, 'itemId' | 'itemLevel'>, origin: OptimizerOrigin, index = 0) => `${slot}:${item.itemId ?? 0}:${item.itemLevel ?? 0}:${origin}:${index}`

/** Which slots an item fits, from its inventory type: rings and trinkets fit both of theirs */
export function slotsFor(item: GearItem): GearSlot[] {
  const paired = pairedSlots[item.slot]
  return paired ? [item.slot, paired].sort() as GearSlot[] : [item.slot]
}

/**
 * Keeps the pieces worth a run: ones this character can use, not what's already equipped in that slot, no lower than
 * a few levels below it (a lower piece can still win on its effect), and at most a few per slot, highest level first
 */
export function trimPool(pool: OptimizerCandidate[], character: Pick<Character, 'gear' | 'className' | 'specId' | 'level'>, perSlot = 6, below = 13): OptimizerCandidate[] {
  const equipped = new Map(character.gear.map(item => [item.slot, item]))
  const seen = new Set<string>()
  const kept: OptimizerCandidate[] = []
  const bySlot = new Map<GearSlot, OptimizerCandidate[]>()
  for (const candidate of pool) bySlot.set(candidate.slot, [...(bySlot.get(candidate.slot) ?? []), candidate])
  for (const [slot, list] of bySlot) {
    const worn = equipped.get(slot)
    const floor = (worn?.itemLevel ?? 0) - below
    const usable = list.filter(candidate => {
      const item = candidate.item
      if (worn && worn.itemId === item.itemId && (worn.itemLevel ?? 0) >= (item.itemLevel ?? 0)) return false
      if ((item.itemLevel ?? 0) < floor) return false
      const fits = getItemCompatibility({ id: item.itemId ?? 0, name: item.name, quality: candidate.quality ?? 4, itemLevel: item.itemLevel ?? 0, requiredLevel: 0, slot: item.slot, inventoryType: item.inventoryType ?? 0, armor: null, icon: null, expansion: 0, sources: [], classId: item.classId, subclassId: item.subclassId, allowableClassMask: item.allowableClassMask ?? null, specIds: item.specIds ?? null, primaryStats: item.primaryStats ?? null }, { className: character.className, specId: character.specId, level: null }, item.inventoryType != null ? { slot } : {})
      return fits.compatible
    })
    // The same piece found twice, such as a drop that top players also wear, is kept once, owned copies first
    usable.sort((a, b) => Number(isOwned(b)) - Number(isOwned(a)) || (b.item.itemLevel ?? 0) - (a.item.itemLevel ?? 0) || (b.popularity ?? 0) - (a.popularity ?? 0))
    let count = 0
    for (const candidate of usable) {
      const identity = `${slot}:${candidate.item.itemId}:${candidate.item.itemLevel}`
      if (seen.has(identity) || count >= perSlot) continue
      seen.add(identity)
      kept.push(candidate)
      count++
    }
  }
  return kept
}

/** A set is wearable when it takes at most one Great Vault choice and never puts one piece in both paired slots */
export function wearable(picks: Partial<Record<GearSlot, string>>, pool: Map<string, OptimizerCandidate>): boolean {
  const chosen = Object.values(picks).map(key => pool.get(key!)).filter(candidate => !!candidate)
  if (chosen.filter(candidate => candidate.origin === 'vault').length > 1) return false
  for (const [slot, other] of Object.entries(pairedSlots) as Array<[GearSlot, GearSlot]>) {
    const a = picks[slot] ? pool.get(picks[slot]!) : undefined, b = picks[other] ? pool.get(picks[other]!) : undefined
    if (a && b && a.item.itemId === b.item.itemId && !(a.origin !== b.origin && isOwned(a) && isOwned(b))) return false
  }
  return true
}

/**
 * The app's own sets from the screening run: each slot's best gain, with paired slots chosen together so one piece
 * never fills both. One set uses only owned gear, one adds targets, and one leaves out the Great Vault
 */
export function greedyCombos(pool: OptimizerCandidate[], screen: Record<string, OptimizerMeasure>): OptimizerCombo[] {
  const byKey = new Map(pool.map(candidate => [candidate.key, candidate]))
  const build = (allowed: (candidate: OptimizerCandidate) => boolean) => {
    const picks: Partial<Record<GearSlot, string>> = {}
    const gainOf = (key: string | undefined) => key ? screen[key]?.gain ?? 0 : 0
    const best = (slot: GearSlot, exclude: number | null = null) => pool.filter(candidate => candidate.slot === slot && allowed(candidate) && (screen[candidate.key]?.gain ?? 0) > 0 && candidate.item.itemId !== exclude)
      .sort((a, b) => gainOf(b.key) - gainOf(a.key))[0]
    const slots = [...new Set(pool.map(candidate => candidate.slot))]
    for (const slot of slots) {
      const other = pairedSlots[slot]
      if (other && slot > other) continue
      if (!other) { const top = best(slot); if (top) picks[slot] = top.key; continue }
      // Both orders, keeping whichever pair gains more
      const orders = [[slot, other], [other, slot]].map(([first, second]) => { const a = best(first!); const b = best(second!, a?.item.itemId ?? null); return { a, b, first: first!, second: second!, gain: gainOf(a?.key) + gainOf(b?.key) } })
      const pick = orders.sort((x, y) => y.gain - x.gain)[0]!
      if (pick.a) picks[pick.first] = pick.a.key
      if (pick.b) picks[pick.second] = pick.b.key
    }
    // A second Great Vault choice is dropped, keeping the one that gains more
    const vault = Object.entries(picks).filter(([, key]) => byKey.get(key!)?.origin === 'vault').sort((a, b) => gainOf(b[1]) - gainOf(a[1]))
    for (const [slot] of vault.slice(1)) delete picks[slot as GearSlot]
    return picks
  }
  const sets: OptimizerCombo[] = []
  const add = (key: string, label: string, picks: Partial<Record<GearSlot, string>>, why: string) => {
    if (!Object.keys(picks).length || sets.some(set => JSON.stringify(set.picks) === JSON.stringify(picks))) return
    sets.push({ key, label, picks, why, by: 'app' })
  }
  add('app-owned', 'Best of what you own', build(isOwned), 'Each slot\'s biggest single gain from gear you already have')
  add('app-owned-no-vault', 'Best you own without the vault', build(candidate => isOwned(candidate) && candidate.origin !== 'vault'), 'The same, leaving your Great Vault choice open')
  add('app-all', 'Best including targets', build(() => true), 'Each slot\'s biggest single gain, including drops and top-player items you could still get')
  return sets
}

/** Sets whose every pick is owned gear count toward "wear now"; any target makes a set one to chase */
export const ownedOnly = (combo: OptimizerCombo, pool: Map<string, OptimizerCandidate>) => Object.values(combo.picks).every(key => { const candidate = pool.get(key!); return !!candidate && isOwned(candidate) })

/** The best owned set, and the best set with targets when it beats the owned one */
export function bestCombos(combos: OptimizerCombo[], results: Record<string, OptimizerMeasure>, pool: Map<string, OptimizerCandidate>): { wearNow: string | null; chase: string | null } {
  const measured = combos.filter(combo => results[combo.key]).sort((a, b) => results[b.key]!.gain - results[a.key]!.gain)
  const wearNow = measured.find(combo => ownedOnly(combo, pool) && results[combo.key]!.gain > 0)?.key ?? null
  const chase = measured.find(combo => !ownedOnly(combo, pool) && results[combo.key]!.gain > (wearNow ? results[wearNow]!.gain : 0))?.key ?? null
  return { wearNow, chase }
}
