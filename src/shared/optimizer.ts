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
  /** How hard SimulationCraft may push the processor: sustained all-core load can reset a computer with unstable power or cooling */
  load: z.enum(['light', 'medium', 'heavy']).default('light'),
  /**
   * Best gear weighs everything you could wear; the loot finder measures only this season's drops, by where they
   * drop; the vault advisor compares each Great Vault choice worn with the best of what you own; the upgrade advisor
   * measures each equipped piece one crest rank higher; best talents runs the top players' builds on your gear;
   * enchants tries the top players' enchants and gems on what you wear
   */
  mode: z.enum(['gear', 'loot', 'vault', 'upgrades', 'talents', 'enchants']).default('gear'),
  /** The loot finder measures drops at the first rank of this upgrade track */
  track: z.enum(['champion', 'hero', 'myth']).default('hero'),
})
export type OptimizerMode = z.output<typeof optimizerStartSchema>['mode']
export type OptimizerTrack = z.output<typeof optimizerStartSchema>['track']
export const optimizerTrackNames: Record<OptimizerTrack, string> = { champion: 'Champion', hero: 'Hero', myth: 'Myth' }
export type OptimizerLoad = z.output<typeof optimizerStartSchema>['load']
export const optimizerLoads: Record<OptimizerLoad, { label: string; threads: number | null }> = {
  light: { label: 'Light load', threads: 2 },
  medium: { label: 'Medium load', threads: 4 },
  heavy: { label: 'Heavy load', threads: null },
}
export type OptimizerStart = z.input<typeof optimizerStartSchema>

export type OptimizerOrigin = 'equipped' | 'bags' | 'bank' | 'vault' | 'drop' | 'top' | 'upgrade'
export const ownedOrigins: readonly OptimizerOrigin[] = ['equipped', 'bags', 'bank', 'vault']
export const originLabels: Record<OptimizerOrigin, string> = { equipped: 'Equipped', bags: 'In your bags', bank: 'In your bank', vault: 'Great Vault choice', drop: 'Drops this season', top: 'Worn by top players', upgrade: 'Upgrade with crests' }

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
  /** For an upgrade, the crest rank it costs */
  upgrade?: { track: string; fromLevel: number; toLevel: number; crestId: string | null; crests: number; gold: number }
  /** For a drop, the dungeon or raid and the boss it drops from */
  instance?: string | null
  boss?: string | null
}

/** taken is a tank's change in damage taken per second over what is worn, from the same run */
export type OptimizerMeasure = { mean: number; error: number | null; gain: number; taken?: { change: number; error: number | null } | null }
export type OptimizerCombo = { key: string; label: string; picks: Partial<Record<GearSlot, string>>; why: string | null; by: 'ai' | 'app'; talents?: string; players?: number; enhancement?: { kind: 'enchant' | 'gem'; slot: GearSlot | null; name: string; current: string | null } }
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
  /** Something about the inputs that makes the result less trustworthy, such as gear saved before a level squish */
  warning?: string | null
  /** Best gear or the loot finder; runs saved before the loot finder are Best gear */
  mode?: OptimizerMode
  /** The loot finder's upgrade track and the item level its drops were measured at */
  track?: OptimizerTrack
  trackLevel?: number | null
  /** For a healer, no engine run: picks come from what top healers of the spec wear */
  healer?: boolean
  /** How many screening results came from earlier runs instead of the engine */
  reused?: number
  /** What was equipped when the run started, so the page can tell when the gear has changed since */
  equipped?: Array<{ slot: GearSlot; itemId: number | null; itemLevel: number | null }>
  notes: string[]
  failure: string | null
}

/**
 * A gain only counts when it clears the noise: twice the error of a difference between two runs, each with this
 * error. A screening run at 1,500 iterations is about ±260 damage per second, so a +126 swap is noise, not an upgrade
 */
export const noise = (measure: Pick<OptimizerMeasure, 'error'>) => 2 * Math.SQRT2 * (measure.error ?? 0)
export const isGain = (measure: OptimizerMeasure | undefined): measure is OptimizerMeasure => !!measure && measure.gain > noise(measure) && !tankRisk(measure)
/** A tank's pick that takes more damage past the noise isn't an upgrade, however much damage it adds */
export const tankRisk = (measure: OptimizerMeasure) => !!measure.taken && measure.taken.change > noise({ error: measure.taken.error })


/** True when what's equipped now differs from what the run measured against */
export function gearChanged(run: Pick<OptimizerRun, 'equipped'>, gear: Array<Pick<GearItem, 'slot' | 'itemId' | 'itemLevel'>>): boolean {
  if (!run.equipped) return false
  const now = new Map(gear.map(item => [item.slot, `${item.itemId}:${item.itemLevel}`]))
  return run.equipped.length !== gear.length || run.equipped.some(item => now.get(item.slot) !== `${item.itemId}:${item.itemLevel}`)
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
    // Measured from the lower of what you wear and the best piece on offer, so gear saved above this season's levels,
    // such as from before an item level squish, never empties a slot
    const best = Math.max(0, ...list.map(candidate => candidate.item.itemLevel ?? 0))
    const floor = Math.min(worn?.itemLevel ?? 0, best) - below
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
    const best = (slot: GearSlot, exclude: number | null = null) => pool.filter(candidate => candidate.slot === slot && allowed(candidate) && isGain(screen[candidate.key]) && candidate.item.itemId !== exclude)
      .sort((a, b) => gainOf(b.key) - gainOf(a.key))[0]
    // A ring or trinket in only one of its slots still pairs with the other, so it is never skipped
    const slots = [...new Set(pool.flatMap(candidate => [candidate.slot, ...(pairedSlots[candidate.slot] ? [pairedSlots[candidate.slot]!] : [])]))]
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
  add('app-owned', 'Best of what you own', build(isOwned), 'Each slot\'s biggest clear gain from gear you already have')
  add('app-owned-no-vault', 'Best you own without the vault', build(candidate => isOwned(candidate) && candidate.origin !== 'vault'), 'The same, leaving your Great Vault choice open')
  add('app-all', 'Best including targets', build(() => true), 'Each slot\'s biggest single gain, including drops and top-player items you could still get')
  return sets
}

/** Sets whose every pick is owned gear count toward "wear now"; any target makes a set one to chase */
export const ownedOnly = (combo: OptimizerCombo, pool: Map<string, OptimizerCandidate>) => Object.values(combo.picks).every(key => { const candidate = pool.get(key!); return !!candidate && isOwned(candidate) })

/** The best owned set, and the best set with targets when it beats the owned one */
export function bestCombos(combos: OptimizerCombo[], results: Record<string, OptimizerMeasure>, pool: Map<string, OptimizerCandidate>): { wearNow: string | null; chase: string | null } {
  const measured = combos.filter(combo => results[combo.key]).sort((a, b) => results[b.key]!.gain - results[a.key]!.gain)
  const wearNow = measured.find(combo => ownedOnly(combo, pool) && isGain(results[combo.key]))?.key ?? null
  const chase = measured.find(combo => !ownedOnly(combo, pool) && isGain(results[combo.key]) && results[combo.key]!.gain > (wearNow ? results[wearNow]!.gain : 0))?.key ?? null
  return { wearNow, chase }
}

export type OptimizerUpgrade = { candidate: OptimizerCandidate; gain: number; error: number | null }

/**
 * The pieces worth getting, one entry per item and one per slot (two for rings and trinkets), ranked by what each adds beyond the best you already own for that
 * slot. Only clear gains count, so the list says what to farm next instead of naming a whole set
 */
export function upgradesToChase(run: Pick<OptimizerRun, 'pool' | 'screen'>, limit = 8): OptimizerUpgrade[] {
  const ownedBest = new Map<GearSlot, number>()
  for (const candidate of run.pool) {
    const measure = run.screen[candidate.key]
    if (isOwned(candidate) && isGain(measure)) ownedBest.set(candidate.slot, Math.max(ownedBest.get(candidate.slot) ?? 0, measure.gain))
  }
  const best = new Map<string, OptimizerUpgrade>()
  for (const candidate of run.pool) {
    const measure = run.screen[candidate.key]
    if (isOwned(candidate) || !isGain(measure)) continue
    const gain = measure.gain - (ownedBest.get(candidate.slot) ?? 0)
    if (gain <= noise(measure)) continue
    const identity = `${candidate.item.itemId}:${candidate.item.itemLevel}`
    const seen = best.get(identity)
    if (!seen || gain > seen.gain) best.set(identity, { candidate, gain, error: measure.error })
  }
  // The best one per slot, two for rings and trinkets, so the list spans the gear instead of four alternatives for one slot
  const taken = new Map<string, number>()
  return [...best.values()].sort((a, b) => b.gain - a.gain).filter(entry => {
    const family = entry.candidate.slot.replace(/[12]$/, '')
    const count = taken.get(family) ?? 0
    if (count >= (pairedSlots[entry.candidate.slot] ? 2 : 1)) return false
    taken.set(family, count + 1)
    return true
  }).slice(0, limit)
}

export type LootSource = { key: string; instance: string; boss: string | null; total: number; pieces: Array<{ candidate: OptimizerCandidate; gain: number }> }

/**
 * Where to farm: each dungeon, or each raid boss, with what its drops add for this character. A source counts its best
 * clear gain per slot (a ring or trinket once, in its better slot), so one source with many weak drops can't outrank
 * one great drop, and noise never counts
 */
export function lootSources(run: Pick<OptimizerRun, 'pool' | 'screen'>): LootSource[] {
  const sources = new Map<string, LootSource & { bySlot: Map<string, { candidate: OptimizerCandidate; gain: number }> }>()
  for (const candidate of run.pool) {
    const measure = run.screen[candidate.key]
    if (candidate.origin !== 'drop' || !candidate.instance || !isGain(measure)) continue
    const key = candidate.boss ? `${candidate.instance}:${candidate.boss}` : candidate.instance
    const source = sources.get(key) ?? { key, instance: candidate.instance, boss: candidate.boss ?? null, total: 0, pieces: [], bySlot: new Map() }
    // Paired slots share one entry per item, so a ring counts once
    const slot = pairedSlots[candidate.slot] ? `${candidate.slot.replace(/[12]$/, '')}:${candidate.item.itemId}` : candidate.slot
    const seen = source.bySlot.get(slot)
    if (!seen || measure.gain > seen.gain) source.bySlot.set(slot, { candidate, gain: measure.gain })
    sources.set(key, source)
  }
  return [...sources.values()].map(({ bySlot, ...source }) => {
    const pieces = [...bySlot.values()].sort((a, b) => b.gain - a.gain)
    return { ...source, pieces, total: pieces.reduce((sum, piece) => sum + piece.gain, 0) }
  }).sort((a, b) => b.total - a.total)
}

/**
 * The Great Vault advisor's sets: the best of what you own without the vault, then that set with each vault choice
 * in its slot. Every choice is measured, even one that screened poorly, so the advice can say to skip them all
 */
export function vaultSets(pool: OptimizerCandidate[], screen: Record<string, OptimizerMeasure>): OptimizerCombo[] {
  const byKey = new Map(pool.map(candidate => [candidate.key, candidate]))
  const base = greedyCombos(pool.filter(candidate => isOwned(candidate) && candidate.origin !== 'vault'), screen).find(set => set.key === 'app-owned')?.picks ?? {}
  const sets: OptimizerCombo[] = []
  if (Object.keys(base).length) sets.push({ key: 'vault-skip', label: 'Skip the vault', picks: base, why: 'The best of what you own without a vault choice', by: 'app' })
  pool.filter(candidate => candidate.origin === 'vault').forEach((candidate, index) => {
    const picks = { ...base, [candidate.slot]: candidate.key }
    if (wearable(picks, byKey)) sets.push({ key: `vault-${index + 1}`, label: candidate.item.name, picks, why: `${candidate.item.name} in your ${candidate.slot}, with the best of what you own`, by: 'app' })
  })
  return sets
}

export type VaultChoice = { candidate: OptimizerCandidate; combo: OptimizerCombo; gain: number; error: number | null; over: number }

/**
 * Each vault choice once, in its better slot, ranked by what it adds over skipping the vault. The first one is the
 * pick only when that difference clears the noise
 */
export function vaultChoices(run: Pick<OptimizerRun, 'pool' | 'combos' | 'results'>): { choices: VaultChoice[]; take: VaultChoice | null } {
  const byKey = new Map(run.pool.map(candidate => [candidate.key, candidate]))
  const skip = run.results['vault-skip']?.gain ?? 0
  const best = new Map<string, VaultChoice>()
  for (const combo of run.combos) {
    const result = run.results[combo.key]
    if (!combo.key.startsWith('vault-') || combo.key === 'vault-skip' || !result) continue
    const candidate = Object.values(combo.picks).map(key => byKey.get(key!)).find(entry => entry?.origin === 'vault')
    if (!candidate) continue
    const identity = `${candidate.item.itemId}:${candidate.item.itemLevel}`
    const choice = { candidate, combo, gain: result.gain, error: result.error, over: result.gain - skip }
    if (!best.has(identity) || choice.gain > best.get(identity)!.gain) best.set(identity, choice)
  }
  const choices = [...best.values()].sort((a, b) => b.gain - a.gain)
  const top = choices[0]
  return { choices, take: top && top.over > noise({ error: top.error }) ? top : null }
}

export type UpgradeAdvice = { candidate: OptimizerCandidate; gain: number; error: number | null; perCrest: number; clear: boolean; affordable: boolean | null }

/**
 * Each equipped piece's next crest rank, ranked by damage gained per crest spent (ranks that cost no crest first).
 * With crest balances known, spends them on the best value first, one rank per piece, as crestPlan does for item level
 */
export function upgradeAdvice(run: Pick<OptimizerRun, 'pool' | 'screen'>, currencies: Record<string, number> | null): UpgradeAdvice[] {
  const ranked = run.pool.flatMap(candidate => {
    const measure = run.screen[candidate.key]
    if (!candidate.upgrade || !measure) return []
    const perCrest = candidate.upgrade.crests ? measure.gain / candidate.upgrade.crests : Infinity
    return [{ candidate, gain: measure.gain, error: measure.error, perCrest, clear: isGain(measure), affordable: null as boolean | null }]
  }).sort((a, b) => Number(b.clear) - Number(a.clear) || b.perCrest - a.perCrest || b.gain - a.gain)
  if (!currencies) return ranked
  const left = new Map(Object.entries(currencies))
  return ranked.map(entry => {
    const { crestId, crests } = entry.candidate.upgrade!
    if (!crestId) return { ...entry, affordable: true }
    const balance = left.get(crestId)
    if (balance == null) return entry
    const affordable = entry.clear && balance >= crests
    if (affordable) left.set(crestId, balance - crests)
    return { ...entry, affordable }
  })
}

export type TalentBuild = { combo: OptimizerCombo; gain: number; error: number | null; clear: boolean }

/** The top players' builds on your gear, best first, each marked when its gain over your build clears the noise */
export function talentBuilds(run: Pick<OptimizerRun, 'combos' | 'results'>): TalentBuild[] {
  return run.combos.flatMap(combo => {
    const result = run.results[combo.key]
    return combo.talents && result ? [{ combo, gain: result.gain, error: result.error, clear: isGain(result) }] : []
  }).sort((a, b) => b.gain - a.gain)
}

export type EnhancementOption = { combo: OptimizerCombo; gain: number; error: number | null; clear: boolean }

/** Each slot's best enchant swap and the best gem, ranked by gain; one is worth making only when it clears the noise */
export function enhancementAdvice(run: Pick<OptimizerRun, 'combos' | 'results'>): EnhancementOption[] {
  const best = new Map<string, EnhancementOption>()
  for (const combo of run.combos) {
    const result = run.results[combo.key]
    if (!combo.enhancement || !result) continue
    const group = combo.enhancement.kind === 'gem' ? 'gems' : combo.enhancement.slot!
    const option = { combo, gain: result.gain, error: result.error, clear: isGain(result) }
    if (!best.has(group) || option.gain > best.get(group)!.gain) best.set(group, option)
  }
  return [...best.values()].sort((a, b) => Number(b.clear) - Number(a.clear) || b.gain - a.gain)
}

export type HealerPick = { candidate: OptimizerCandidate; reason: string }

/**
 * A healer's picks without SimulationCraft, which can't model healing: per slot, the piece top healers of the spec wear
 * most when it's a clear step from what you wear, or a piece you own well above what you wear
 */
export function healerPicks(pool: OptimizerCandidate[], gear: Array<{ slot: GearSlot; itemId: number | null; itemLevel: number | null }>): HealerPick[] {
  const picks: HealerPick[] = []
  for (const slot of [...new Set(pool.map(candidate => candidate.slot))]) {
    const worn = gear.find(item => item.slot === slot)
    const options = pool.filter(candidate => candidate.slot === slot && candidate.item.itemId !== worn?.itemId)
    const popular = options.filter(candidate => (candidate.popularity ?? 0) >= 0.25).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || (b.item.itemLevel ?? 0) - (a.item.itemLevel ?? 0))[0]
    const owned = options.filter(candidate => isOwned(candidate) && (candidate.item.itemLevel ?? 0) >= (worn?.itemLevel ?? 0) + 7).sort((a, b) => (b.item.itemLevel ?? 0) - (a.item.itemLevel ?? 0))[0]
    if (owned) picks.push({ candidate: owned, reason: `${(owned.item.itemLevel ?? 0) - (worn?.itemLevel ?? 0)} item levels above what you wear` })
    if (popular && popular !== owned) picks.push({ candidate: popular, reason: `Worn by ${Math.round((popular.popularity ?? 0) * 100)}% of top healers of your specialization` })
  }
  return picks.sort((a, b) => Number(isOwned(b.candidate)) - Number(isOwned(a.candidate)) || (b.candidate.popularity ?? 0) - (a.candidate.popularity ?? 0))
}
