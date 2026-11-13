import { availableParallelism } from 'node:os'
import path from 'node:path'
import { mkdir, readdir, readFile, realpath, rename, rm, stat, writeFile } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import type { Character, GearItem } from '../../shared/domain'
import type { DatabaseClient } from '../database'
import { baselineFromCharacter, toItemVariant } from '../../shared/gear-variants'
import { getItemCompatibility } from '../../shared/item-compatibility'
import { asCompatibilityItem } from '../../shared/gear-set-validation'
import { validateGearSet } from '../../shared/gear-set-validation'
import { resolveSeasonRuleset } from '../../shared/season-rules'
import { loadBundledProgressionRules } from '../progression/service'
import { ladderCeiling, socketRules } from '../item-tracks'
import { itemLinkVariant } from '../../shared/item-link'
import type { BonusInfo, CatalystSource, ItemPower } from '../../shared/gamedata'
import type { TopPlayerItem } from '../../shared/top-players'
import { catalyzedBase, engineStats, primaryStatOf } from '../../shared/catalyst'
import { type PlannedItem, benchmarkLabels, benchmarkPlan, describedItem, gearSlotLabels, loadoutPattern, planSwaps } from '../../shared/simulation-benchmark'
import { capTopLevels, type TopPlayers } from '../../shared/top-players'
import { PROFILESET_LIMIT, classifySimulationResult, resolveScenario, simulationBenchmarkStartSchema, simulationPlanStartSchema, simulationStartSchema, simulationStoredWorkspaceSchema, simulationSwapsStartSchema, type SimulationJob, type SimulationRequest, type SimulationWorkspace, type SimulationStart, type SimulationSwapsStart, type SimulationBenchmarkStart, type SimulationPlanStart } from '../../shared/simulation'
import { characterBaselineHash, classToken, exportCharacterProfile, hash, healerSpecs, importCharacterProfile, itemLine, parseSimulationProfile, slots as engineSlots, tankSpecs } from './profiles'
import { parseSimulationReport, REFERENCE_PROFILESET, runSimulationProcess, type SimulationProcess } from './runner'

type SimulationDatabase = Pick<DatabaseClient, 'call'>
type Executable = { path: string; name: string; hash: string }
const engineName = process.platform === 'win32' ? 'simc.exe' : 'simc'
/** The SimulationCraft desktop app ships beside the command-line engine, so a pick of the app resolves to the engine next to it */
async function commandLineEngine(selected: string) {
  if (!/^simulationcraft(\.exe)?$/i.test(path.basename(selected))) return selected
  const sibling = path.join(path.dirname(selected), engineName)
  try { if ((await stat(sibling)).isFile()) return sibling } catch { /* reported below */ }
  throw new Error(`Choose ${engineName}, the command-line engine that comes with SimulationCraft`)
}
/** Where the file picker opens: the configured engine, else the newest SimulationCraft folder in a usual install place */
export async function engineFolder(configured: string | null, roots: string[]) {
  if (configured) return path.dirname(configured)
  for (const root of roots) {
    try {
      const folders = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory() && /^simc/i.test(entry.name)).map(entry => entry.name).sort().reverse()
      for (const folder of folders) { const candidate = path.join(root, folder); try { if ((await stat(path.join(candidate, engineName))).isFile()) return candidate } catch { /* keep looking */ } }
      if ((await stat(path.join(root, engineName)).catch(() => null))?.isFile()) return root
    } catch { /* missing root */ }
  }
  return undefined
}
export type EnhancementLookup = (requests: Array<{ slot: GearItem['slot']; enchant: string | null; gems: string[]; embellishment: number | null; enchantItem?: number }>) => Promise<Array<{ enchantId: number | null; gemIds: number[]; bonusIds: number[] }>>
export function createSimulationService(options: { db: SimulationDatabase; artifactDir: string; onChanged?: () => Promise<void>; enhancementIds?: EnhancementLookup; catalystSources?: (itemId: number) => Promise<CatalystSource[]>; itemPower?: (itemId: number, itemLevel: number) => Promise<ItemPower | null>; embellishmentBonusLists?: () => Promise<number[]>; bonusInfo?: (ids: number[]) => Promise<Record<number, BonusInfo>>; now?: () => Date; execution?: Partial<Pick<Parameters<typeof runSimulationProcess>[0], 'launch' | 'timeoutMs' | 'resultLimit'>> }) {
  let executable: Executable | null = null
  let loaded = false
  let closed = false
  let pumping = false
  let draining: Promise<void> | null = null
  const jobs: Array<{ characterId: string; id: string; profile: string; complete: boolean; executable: Executable }> = []
  const knownJobs = new Set<string>()
  const mutations = new Map<string, Promise<unknown>>()
  let active: { characterId: string; id: string; process: SimulationProcess } | undefined
  const now = () => (options.now?.() ?? new Date()).toISOString()
  const configFile = path.join(options.artifactDir, 'engine.json')
  async function character(id: string) { const value = await options.db.call('getCharacter', id); if (!value) throw new Error('Character was not found'); return value }
  async function read(id: string) { await character(id); return simulationStoredWorkspaceSchema.parse(await options.db.call('getFeatureState', id, 'simulation') ?? {}) }
  async function mutate<T>(id: string, fn: (value: ReturnType<typeof simulationStoredWorkspaceSchema.parse>) => T | Promise<T>): Promise<T> {
    const previous = mutations.get(id) ?? Promise.resolve()
    const operation = previous.catch(() => {}).then(async () => { const state = await read(id); const result = await fn(state); await options.db.call('saveFeatureState', id, 'simulation', state); await options.onChanged?.(); return result })
    mutations.set(id, operation)
    try { return await operation } finally { if (mutations.get(id) === operation) mutations.delete(id) }
  }
  async function inspectExecutable(selected: string): Promise<Executable> {
    if (!path.isAbsolute(selected)) throw new Error('Choose an absolute SimulationCraft executable path')
    const canonical = await realpath(await commandLineEngine(selected))
    const info = await stat(canonical)
    if (!info.isFile() || info.size > 256 * 1024 * 1024) throw new Error('Choose a SimulationCraft executable smaller than 256 MiB')
    if (process.platform === 'win32' && path.extname(canonical).toLowerCase() !== '.exe') throw new Error('Choose the SimulationCraft .exe file')
    return { path: canonical, name: path.basename(canonical), hash: hash(await readFile(canonical)) }
  }
  async function loadExecutable() {
    if (loaded) return
    loaded = true
    try { const value = JSON.parse(await readFile(configFile, 'utf8')) as { path?: unknown }; if (typeof value.path === 'string') executable = await inspectExecutable(value.path) } catch { executable = null }
  }
  async function updateJob(characterId: string, id: string, transform: (job: SimulationJob) => void) {
    return mutate(characterId, state => { const job = state.jobs.find(value => value.id === id); if (!job) throw new Error('The simulation job no longer exists'); transform(job); return job })
  }
  async function pump() {
    if (pumping || closed) return
    pumping = true
    try {
      while (jobs.length && !closed) {
        const queued = jobs.shift()!
        try {
          const current = await character(queued.characterId)
          const workspace = await read(queued.characterId)
          const job = workspace.jobs.find(value => value.id === queued.id)
          if (!job || job.state !== 'queued') continue
          if (characterBaselineHash(current) !== job.request.baselineHash) throw new Error('The character baseline changed before the job started')
          const selected = await inspectExecutable(queued.executable.path)
          if (selected.hash !== queued.executable.hash) throw new Error('The selected SimulationCraft executable changed — choose it again')
          if (closed) break
          await updateJob(queued.characterId, queued.id, value => { value.state = 'running'; value.startedAt = now() })
          if (closed) break
          const process = runSimulationProcess({ executable: selected.path, directory: path.join(options.artifactDir, queued.id), profile: queued.profile, request: job.request, ...options.execution })
          active = { characterId: queued.characterId, id: queued.id, process }
          const json = await process.promise
          if (closed) continue
          const latest = await character(queued.characterId)
          const result = parseSimulationReport(json, job.request, selected.hash, queued.id, now(), queued.complete)
          if (characterBaselineHash(latest) !== job.request.baselineHash) { result.applicability = 'stale'; result.reasons.push('Gear, talents, specialization, or character context changed while the simulation ran') }
          await updateJob(queued.characterId, queued.id, value => { if (value.state === 'cancelled') return; value.state = 'completed'; value.finishedAt = now(); value.result = result })
        } catch (error) {
          await updateJob(queued.characterId, queued.id, value => { if (value.state === 'cancelled') return; value.state = 'failed'; value.finishedAt = now(); value.result = null; value.failure = error instanceof Error ? error.message : 'The simulation failed' }).catch(() => {})
        } finally { active = undefined; knownJobs.delete(queued.id) }
      }
    } finally { pumping = false }
  }
  /** Current gear with the candidate's items swapped in, checked for this character and unique-equipped limits */
  function swapIn(current: Character, items: GearItem[]) {
    if (new Set(items.map(item => item.slot)).size !== items.length) throw new Error('A candidate can hold only one item per slot')
    const merged = current.gear.map(item => items.find(candidate => candidate.slot === item.slot) ?? item)
    for (const item of items) if (!merged.some(value => value.slot === item.slot)) merged.push(item)
    if (merged.length > 16) throw new Error('A gear set holds at most 16 items')
    for (const item of merged) {
      const variant = toItemVariant(item)
      const compatibility = getItemCompatibility(asCompatibilityItem(variant), current, { slot: item.slot })
      if (!compatibility.compatible) throw new Error(`${item.name}: ${compatibility.reason}`)
      if (variant.uniqueGroups.some(group => merged.filter(other => toItemVariant(other).uniqueGroups.includes(group)).length > 1)) throw new Error(`${item.name} conflicts with another unique-equipped item`)
    }
    return merged
  }
  /**
   * The top players' most worn items on your character, for reading a plan against them, plus the slots where the plan
   * falls short of what they wear. Null when no usable sample exists or their set cannot be described to the engine
   */
  /** Plans keep enchants, gems, and embellishments by name; the engine needs their game identifiers */
  async function resolveEnhancements(items: GearItem[]): Promise<PlannedItem[]> {
    const resolved = options.enhancementIds ? await options.enhancementIds(items.map(item => ({ slot: item.slot, enchant: item.enchant, gems: item.gems, embellishment: item.embellishment?.itemId ?? null }))).catch(() => null) : null
    if (!resolved) return items
    return items.map((item, index) => {
      const found = resolved[index]
      if (!found) return item
      // A named enchant the game files don't know keeps the item's own; a plan that says "no enchant" runs without one
      const enchantId = item.enchant ? found.enchantId ?? item.enchantId ?? null : item.enchantCoverage === 'complete' ? 0 : item.enchantId ?? null
      const gemIds = item.gems.length ? item.gems.map((_, slot) => found.gemIds[slot] || item.gemIds?.filter(Boolean)[slot] || 0) : item.gemIds ?? null
      return { ...item, enchantId, gemIds, embellishmentBonusIds: found.bonusIds }
    })
  }

  /**
   * Bonus lists for a planned item that names only its item. Your own copy is used when it already reaches the planned
   * level; one planned higher moves onto the upgrade track a top player's copy at that level is on. Without your copy, a
   * top player's is used, minus their embellishment and any named variant effect (such as Venomcursed) the plan didn't
   * choose. Otherwise the item gets the socket it drops with and any socket its planned gems need
   */
  async function planBonusIds(current: Character, top: TopPlayers | null) {
    const embellished = new Set(options.embellishmentBonusLists ? await options.embellishmentBonusLists().catch(() => []) : [])
    const copies = new Map<number, Array<{ itemLevel: number; bonusIds: number[] }>>()
    for (const player of top?.players ?? []) for (const item of player.gear ?? []) if (item.bonusIds.length) copies.set(item.itemId, [...(copies.get(item.itemId) ?? []), { itemLevel: item.itemLevel, bonusIds: item.bonusIds.filter(id => !embellished.has(id)) }])
    const ownIds = (gear: GearItem) => gear.bonusIds?.length ? gear.bonusIds : itemLinkVariant(gear.itemLink).bonusIds ?? []
    const known = [...new Set([...[...copies.values()].flat().flatMap(copy => copy.bonusIds), ...current.gear.flatMap(ownIds)])]
    const info = options.bonusInfo && known.length ? await options.bonusInfo(known).catch(() => ({})) : {}
    const variant = (id: number) => !!(info as Record<number, BonusInfo>)[id]?.variant
    const track = (id: number) => (info as Record<number, BonusInfo>)[id]?.trackGroup != null
    return (item: GearItem): number[] | null => {
      // The copy nearest the planned level, preferring one that reaches it
      const theirs = (copies.get(item.itemId ?? 0) ?? []).sort((a, b) => Math.abs(a.itemLevel - (item.itemLevel ?? 0)) - Math.abs(b.itemLevel - (item.itemLevel ?? 0)))[0]
      const plain = theirs?.bonusIds.filter(id => !variant(id))
      const owned = current.gear.find(gear => gear.itemId === item.itemId)
      const mine = owned ? ownIds(owned).filter(id => !embellished.has(id)) : []
      if (mine.length) {
        if (!plain || (owned!.itemLevel ?? 0) >= (item.itemLevel ?? 0)) return mine
        const theirTrack = plain.filter(track)
        return theirTrack.length ? [...mine.filter(id => !track(id)), ...theirTrack] : mine
      }
      if (plain?.length) return plain
      if (!socketRules || item.inventoryType == null) return null
      const ids: number[] = []
      let sockets = 0
      if (socketRules.drop.inventoryTypes.includes(item.inventoryType)) { ids.push(socketRules.drop.bonusList); sockets += socketRules.bonusLists[String(socketRules.drop.bonusList)] ?? 0 }
      if ((item.gemIds?.filter(Boolean).length ?? item.gems.length) > sockets && socketRules.addable.inventoryTypes.includes(item.inventoryType)) ids.push(socketRules.addable.bonusList)
      return ids.length ? ids : null
    }
  }

  /**
   * Raider.IO names a slot's enchant by the scroll or kit item applied, while the engine needs the enchant itself.
   * Each slot keeps only the enchants that resolve; without game data their items run unenchanted, as before
   */
  async function withEnchantIds(top: TopPlayers): Promise<TopPlayers> {
    const groups = Object.entries(top.slots) as Array<[keyof TopPlayers['slots'], NonNullable<TopPlayers['slots'][keyof TopPlayers['slots']]>]>
    const wanted = [...new Set(groups.flatMap(([, slot]) => slot.enchants.map(enchant => enchant.id)))].slice(0, 40)
    const resolved = wanted.length && options.enhancementIds ? await options.enhancementIds(wanted.map(id => ({ slot: 'head', enchant: null, gems: [], embellishment: null, enchantItem: id }))).catch(() => null) : null
    const byItem = new Map(wanted.map((id, index) => [id, resolved?.[index]?.enchantId ?? null]))
    const slots: TopPlayers['slots'] = {}
    for (const [group, slot] of groups) slots[group] = { ...slot, enchants: slot.enchants.flatMap(enchant => { const id = byItem.get(enchant.id); return id ? [{ ...enchant, id }] : [] }) }
    return { ...top, slots }
  }
  /**
   * Each sampled top player as they play: all their items and their talents on your character, then each of their
   * items alone. Items several players share, or that match your plan or what you wear, are measured once. Players
   * whose setup can't be described to the engine are left out, and the run stays inside the engine's profileset limit
   */
  /**
   * Catalyzed tier pieces keep their base item's stats, which the tier item's own data doesn't have. A planned piece
   * uses the base the plan names; a top player's uses the base its cantrip came from, when only one base drops with it.
   * Pieces with no known base keep the tier item's stats
   */
  async function catalystStats(current: Character, planned: GearItem[], top: TopPlayers | null) {
    const none = { plan: (_item: GearItem) => null as string | null, theirs: (_item: TopPlayerItem) => null as string | null }
    const primary = primaryStatOf(current)
    if (!options.catalystSources || !options.itemPower || !primary) return none
    const ids = new Set([...planned.map(item => item.itemId ?? 0), ...(top?.players ?? []).flatMap(player => (player.gear ?? []).map(item => item.itemId))].filter(id => id > 0))
    const sources = new Map<number, CatalystSource[]>()
    await Promise.all([...ids].map(async id => { const list = await options.catalystSources!(id).catch(() => []); if (list.length) sources.set(id, list) }))
    if (!sources.size) return none
    const stats = new Map<string, string | null>()
    const load = async (base: number, level: number) => { const key = `${base}@${level}`; if (!stats.has(key)) stats.set(key, engineStats(await options.itemPower!(base, level).catch(() => null), primary)) }
    const baseOf = (item: TopPlayerItem) => catalyzedBase(sources.get(item.itemId) ?? [], item.bonusIds)
    for (const item of planned) if (item.catalyzedFrom && item.itemLevel && sources.has(item.itemId ?? 0)) await load(item.catalyzedFrom.itemId, Math.round(item.itemLevel))
    for (const player of top?.players ?? []) for (const item of player.gear ?? []) { const base = baseOf(item); if (base) await load(base.itemId, item.itemLevel) }
    return {
      plan: (item: GearItem) => item.catalyzedFrom && item.itemLevel && sources.has(item.itemId ?? 0) ? stats.get(`${item.catalyzedFrom.itemId}@${Math.round(item.itemLevel)}`) ?? null : null,
      theirs: (item: TopPlayerItem) => { const base = baseOf(item); return base ? stats.get(`${base.itemId}@${item.itemLevel}`) ?? null : null },
    }
  }

  function rosterRuns(current: Character, top: TopPlayers, sets: Array<{ label: string; entries: Array<{ item: GearItem; text: string }>; extra: string[] }>, shared: Map<string, number>, wearing: Set<string>, mine: Map<GearItem['slot'], number | null>, catalyst: Awaited<ReturnType<typeof catalystStats>>) {
    const players: NonNullable<NonNullable<SimulationRequest['plan']>['roster']>['players'] = []
    const fallback = current.gear[0]
    if (!fallback) return players
    for (const player of top.players) {
      if (!player.gear?.length || players.length >= 20) continue
      // Rings and trinkets are a pair. Their copy of a planned item goes in the plan's slot, so its run alone replaces
      // the same item yours does; otherwise the gap measures whichever item each pushed out, not the item itself
      const slotOf = new Map(player.gear.map(item => [item.slot, item.slot]))
      for (const [a, b] of [['finger1', 'finger2'], ['trinket1', 'trinket2']] as const) {
        const theirs = (slot: GearItem['slot']) => player.gear!.find(item => item.slot === slot)?.itemId ?? null
        const crossed = (mine.get(a) != null && mine.get(a) === theirs(b) && mine.get(a) !== theirs(a)) || (mine.get(b) != null && mine.get(b) === theirs(a) && mine.get(b) !== theirs(b))
        if (crossed) { slotOf.set(a, b); slotOf.set(b, a) }
      }
      const entries = player.gear.map(worn => {
        const item = { ...worn, slot: slotOf.get(worn.slot) ?? worn.slot }
        const base = current.gear.find(value => value.slot === item.slot) ?? fallback
        const stats = catalyst.theirs(item)
        const described = { ...describedItem(base, item.slot, { itemId: item.itemId, name: item.name, itemLevel: item.itemLevel, bonusIds: item.bonusIds, enchantId: item.enchantId, gemIds: item.gemIds.length ? [...item.gemIds, 0, 0, 0, 0].slice(0, Math.max(4, item.gemIds.length)) : [0, 0, 0, 0] }), ...(stats ? { engineStats: stats } : {}) }
        return { item: described, text: itemLine(described).text }
      })
      if (entries.some(entry => !entry.text)) continue
      const described = entries as Array<{ item: GearItem; text: string }>
      // Your off hand comes off beside their two-hander. Any other slot their profile lacks keeps yours, since a missing
      // item there means Raider.IO didn't report it, not that they play without one
      const twoHanded = player.gear.some(item => item.slot === 'mainHand') && !player.gear.some(item => item.slot === 'offHand')
      const cleared = twoHanded && current.gear.some(item => item.slot === 'offHand') ? [`${engineSlots.offHand}=`] : []
      const loadout = player.loadout && loadoutPattern.test(player.loadout) ? player.loadout : null
      const fresh = described.filter(entry => !wearing.has(entry.text) && !shared.has(entry.text)).length
      if (sets.length + 1 + fresh > PROFILESET_LIMIT) break
      const index = sets.push({ label: `Top player · ${player.name}`, entries: described, extra: [...cleared, ...(loadout ? [`talents=${loadout}`] : [])] }) - 1
      const singles = described.map(entry => {
        if (wearing.has(entry.text)) return { slot: entry.item.slot, index: null }
        const known = shared.get(entry.text)
        if (known !== undefined) return { slot: entry.item.slot, index: known }
        const single = sets.push({ label: `Top player item · ${gearSlotLabels[entry.item.slot]}: ${entry.item.name} at ${entry.item.itemLevel}`, entries: [entry], extra: [] }) - 1
        shared.set(entry.text, single)
        return { slot: entry.item.slot, index: single }
      })
      players.push({ name: player.name, realm: player.realm, url: player.url, score: player.score, loadout, index, singles })
    }
    return players
  }
  /** Checks shared by every job: engine, activity, role, and a complete matching baseline profile */
  async function prepare(start: { characterId: string; activity: SimulationStart['activity'] }) {
    await loadExecutable()
    if (!executable) throw new Error('Choose a local SimulationCraft executable first')
    if (jobs.length >= 10) throw new Error('Wait for queued simulations to finish before adding more')
    const current = await character(start.characterId)
    if (start.activity === 'pvp') throw new Error('PvP combat simulation is not supported by this workflow')
    if (!current.specId || healerSpecs.has(current.specId)) throw new Error('This workflow supports damage modeling for known damage and tank specializations')
    const generated = exportCharacterProfile(current, now())
    if (!generated.text.startsWith('#') || !classToken(current)) throw new Error('The character baseline is unsupported')
    const workspace = await read(current.id)
    const profile = workspace.profile ?? generated
    if (!profile.matchesCurrent || profile.baselineHash !== characterBaselineHash(current)) throw new Error('The imported profile no longer matches this character — import a fresh profile')
    if (profile.coverage !== 'complete') throw new Error(`Complete the character baseline before running a local simulation — ${profile.reasons[0] ?? 'some fields are unknown'}`)
    return { current, profile, engine: executable, text: parseSimulationProfile(profile.text).text, baseline: baselineFromCharacter(current) }
  }
  async function enqueue(prepared: Awaited<ReturnType<typeof prepare>>, request: SimulationRequest, text: string, label: string) {
    const job: SimulationJob = { schemaVersion: 1, id: randomUUID(), characterId: prepared.current.id, state: 'queued', createdAt: now(), startedAt: null, finishedAt: null, request, result: null, failure: null, label }
    jobs.push({ characterId: prepared.current.id, id: job.id, profile: text, complete: prepared.profile.coverage === 'complete', executable: { ...prepared.engine } })
    knownJobs.add(job.id)
    try { await mutate(prepared.current.id, state => { state.jobs = [job, ...state.jobs].slice(0, 20) }) }
    catch (error) { const index = jobs.findIndex(value => value.id === job.id); if (index >= 0) jobs.splice(index, 1); knownJobs.delete(job.id); throw error }
    draining = pump()
    return job
  }
  function request(prepared: Awaited<ReturnType<typeof prepare>>, start: ReturnType<typeof simulationStartSchema.parse> | ReturnType<typeof simulationSwapsStartSchema.parse> | ReturnType<typeof simulationBenchmarkStartSchema.parse> | ReturnType<typeof simulationPlanStartSchema.parse>, candidates: SimulationRequest['candidates'], extra: Pick<SimulationRequest, 'mode' | 'candidateLabels'> & Partial<Pick<SimulationRequest, 'benchmark' | 'plan'>>, hashExtra: unknown = null): SimulationRequest {
    const { current, profile, engine, baseline } = prepared
    const settings = { iterations: start.iterations, threads: Math.min(start.threads, Math.max(1, availableParallelism() - 2)), timeoutMinutes: start.timeoutMinutes }
    const scenario = resolveScenario(start.scenarioId, { targets: start.targets, fightSeconds: start.fightSeconds })
    const damageTaken = tankSpecs.has(current.specId ?? 0)
    return { schemaVersion: 1, characterId: current.id, activity: start.activity, baseline, baselineHash: characterBaselineHash(current), candidates, benchmark: null, plan: null, ...extra, damageTaken, scenarioId: start.scenarioId, scenario, scenarioHash: hash({ scenarioId: start.scenarioId, scenario, settings, candidates, mode: extra.mode, damageTaken, engine: engine.hash, ...(hashExtra === null ? {} : { extra: hashExtra }) }), profileHash: profile.profileHash, options: settings, context: { now: now(), gameBuild: current.gameBuild, seasonId: null, rulesetId: null, region: current.region }, evidenceRefs: baseline.evidenceRefs }
  }
  const service = {
    get busy() { return pumping || !!active || jobs.length > 0 || mutations.size > 0 },
    async exportProfile(characterId: string) { return exportCharacterProfile(await character(characterId), now()) },
    async importProfile(characterId: string, text: string) { const profile = importCharacterProfile(await character(characterId), text, now()); await mutate(characterId, state => { state.profile = profile }); return profile },
    async clearProfile(characterId: string) { await mutate(characterId, state => { state.profile = null }); return service.list(characterId) },
    async saveReport(characterId: string, url: string, notes: string): Promise<SimulationWorkspace> {
      const parsed = new URL(url)
      if (parsed.protocol !== 'https:' || parsed.username || parsed.password || !['www.raidbots.com', 'raidbots.com', 'www.simulationcraft.org', 'simulationcraft.org'].includes(parsed.hostname) || url.length > 2048) throw new Error('Use an HTTPS Raidbots or SimulationCraft report link')
      if (notes.length > 4000) throw new Error('Report notes must be shorter than 4000 characters')
      const baselineHash = characterBaselineHash(await character(characterId))
      await mutate(characterId, state => { state.reports = [{ id: randomUUID(), url: parsed.href, notes, createdAt: now(), baselineHash }, ...state.reports].slice(0, 40) })
      return service.list(characterId)
    },
    async list(characterId: string): Promise<SimulationWorkspace> {
      await loadExecutable()
      const current = await character(characterId)
      const baselineHash = characterBaselineHash(current)
      const workspace = await read(characterId)
      if (workspace.profile) workspace.profile.matchesCurrent = workspace.profile.baselineHash === baselineHash && workspace.profile.matchesCurrent
      for (const job of workspace.jobs) {
        if (job.result) {
          const request = { ...job.request, baselineHash, context: { ...job.request.context, gameBuild: current.gameBuild } }
          const validity = classifySimulationResult(job.result, request)
          if (executable && job.result.engine.executableHash !== executable.hash) validity.reasons.push('The selected SimulationCraft executable changed')
          job.result.applicability = validity.reasons.length ? job.result.applicability === 'unsupported' ? 'unsupported' : 'stale' : 'current'
          job.result.reasons = [...new Set(validity.reasons)]
        }
        if ((job.state === 'queued' || job.state === 'running') && !knownJobs.has(job.id)) { job.state = 'failed'; job.failure = 'The app stopped before this simulation finished'; job.finishedAt = now(); job.result = null }
      }
      return { ...workspace, configured: !!executable, executableName: executable?.name ?? null, baselineHash, limitations: ['Results model damage in the selected scenario, not player skill, healing effectiveness, or tank survival', 'External report links are bookmarks and do not establish a verified combat gain', 'Only matching engine game data and complete baseline coverage can produce a current result'] }
    },
    /** The folder the engine picker should open in */
    async engineFolder(roots: string[]) { await loadExecutable(); return engineFolder(executable?.path ?? null, roots) },
    async configureExecutable(selected: string) {
      if (closed) throw new Error('The simulation service is closing')
      const value = await inspectExecutable(selected)
      await mkdir(options.artifactDir, { recursive: true })
      const temporary = `${configFile}.tmp`
      await writeFile(temporary, JSON.stringify({ path: value.path }), { encoding: 'utf8', mode: 0o600 })
      await rename(temporary, configFile)
      executable = value; loaded = true
      return { configured: true as const, name: value.name }
    },
    async startJob(input: SimulationStart): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationStartSchema.parse(input)
      const prepared = await prepare(start)
      const { current, baseline } = prepared
      let text = prepared.text
      const candidates: SimulationRequest['candidates'] = []
      if (start.comparePlan) {
        const draft = await options.db.call('getGearDraft', { characterId: current.id, activity: start.activity, specId: current.specId })
        if (!draft?.items.length) throw new Error('Save a gear plan before comparing it')
        if (new Set(draft.items.map(item => item.slot)).size !== draft.items.length) throw new Error('The gear plan must contain one item per slot')
        const merged = swapIn(current, draft.items)
        const candidate = exportCharacterProfile(current, now(), merged)
        if (candidate.coverage !== 'complete') throw new Error(`The planned gear is incomplete — ${candidate.reasons[0]}`)
        const variants = merged.map(item => toItemVariant(item, { owned: true, observedAt: current.gearObservedAt }))
        const catalog = loadBundledProgressionRules().catalog
        const context = { now: now(), gameBuild: current.gameBuild, seasonId: null as string | null, rulesetId: null, region: current.region }
        const eligible = catalog.rulesets.filter(rule => resolveSeasonRuleset({ schemaVersion: 1, rulesets: [rule] }, { ...context, seasonId: rule.seasonId }) !== null)
        if (eligible.length !== 1) throw new Error('Planned-set simulation needs verified seasonal equipment restrictions for this game build')
        const legality = validateGearSet(variants, eligible[0]!, baseline)
        if (legality.status !== 'valid') throw new Error(`The complete planned set could not be verified — ${legality.violations[0] ?? legality.unknowns[0]}`)
        candidates.push(variants)
        text += `\ncopy=companion_candidate_1,companion_baseline\n${merged.map(item => itemLine(item).text).filter(Boolean).join('\n')}\n`
      }
      const job = request(prepared, start, candidates, { mode: 'copy', candidateLabels: start.comparePlan ? ['Planned gear'] : [] })
      return enqueue(prepared, job, text, start.comparePlan ? 'Current gear and planned gear' : 'Current gear baseline')
    },
    /** Many swaps against current gear in one engine run, each its own SimulationCraft profileset */
    async startSwaps(input: SimulationSwapsStart): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationSwapsStartSchema.parse(input)
      const prepared = await prepare(start)
      const candidates: SimulationRequest['candidates'] = []
      const lines: string[] = []
      start.candidates.forEach((candidate, index) => {
        try { swapIn(prepared.current, candidate.items) } catch (error) { throw new Error(`${candidate.label}: ${error instanceof Error ? error.message : 'this swap is not allowed'}`) }
        for (const item of candidate.items) {
          const line = itemLine(item)
          if (!line.text || line.reasons.length) throw new Error(`${candidate.label}: ${line.reasons[0] ?? 'the item could not be described to the engine'}`)
          lines.push(`profileset."companion_candidate_${index + 1}"+=${line.text}`)
        }
        candidates.push(candidate.items.map(item => toItemVariant(item)))
      })
      // Restating one equipped item changes nothing, which gives SimulationCraft a profileset for current gear
      const reference = prepared.current.gear.map(item => itemLine(item).text).find(Boolean)
      if (!reference) throw new Error('No equipped item could be described to the engine')
      lines.unshift(`profileset."${REFERENCE_PROFILESET}"+=${reference}`)
      const job = request(prepared, start, candidates, { mode: 'profileset', candidateLabels: start.candidates.map(candidate => candidate.label) })
      return enqueue(prepared, job, `${prepared.text}\n${lines.join('\n')}\n`, start.label)
    },
    /** Runs a saved gear plan as a whole and each planned upgrade on its own, so the biggest gains stand out */
    async startPlan(input: SimulationPlanStart, top: TopPlayers | null = null): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationPlanStartSchema.parse(input)
      const prepared = await prepare(start)
      const activity = start.planActivity ?? start.activity
      const draft = await options.db.call('getGearDraft', { characterId: prepared.current.id, activity, specId: prepared.current.specId, plan: start.plan ?? 'main' })
      if (!draft?.items.length) throw new Error('Save a gear plan for this activity before simulating it')
      if (new Set(draft.items.map(item => item.slot)).size !== draft.items.length) throw new Error('The gear plan must contain one item per slot')
      const planned = planSwaps(prepared.current, await resolveEnhancements(draft.items), await planBonusIds(prepared.current, top))
      const skipped = planned.skipped
      // The plan's own talent build runs with the whole plan and on its own, when it differs from yours
      const planTalents = draft.talents?.loadout && /^[A-Za-z0-9+/=]{1,400}$/.test(draft.talents.loadout) && draft.talents.loadout !== prepared.current.talents?.loadout ? draft.talents.loadout : null
      // Planned levels run as chosen. A plan that reaches past the top regular rank, such as an ascension level, is
      // compared with the highest levels top players really wear; otherwise their items are capped there too
      const beyond = draft.items.some(item => item.itemLevel != null && ladderCeiling != null && item.itemLevel > ladderCeiling)
      const cap = beyond ? null : ladderCeiling
      const topForRun = top ? capTopLevels(top, cap) : null
      const catalyst = await catalystStats(prepared.current, draft.items, topForRun)
      // A catalyzed piece the plan names a base for runs with that base's stats
      const swaps = planned.swaps.map(swap => { const item = draft.items.find(entry => entry.slot === swap.slot); const stats = item ? catalyst.plan({ ...item, itemLevel: swap.itemLevel }) : null; return stats ? { ...swap, engineStats: stats } : swap })
      if (!swaps.length && !planTalents) throw new Error(skipped[0] ?? 'Your plan matches the gear and talents you already use')
      if (swaps.length) try { swapIn(prepared.current, swaps) } catch (error) { throw new Error(`Your plan: ${error instanceof Error ? error.message : 'this set is not allowed'}`) }
      const described = swaps.map(item => { const line = itemLine(item); if (!line.text || line.reasons.length) throw new Error(`${gearSlotLabels[item.slot]}: ${line.reasons[0] ?? 'the planned item could not be described to the engine'}`); return { item, text: line.text } })
      // The whole plan first, then each upgrade alone, all measured against the same unchanged reference
      const talentLine = planTalents ? [`talents=${planTalents}`] : []
      const wholePlan = described.length + talentLine.length > 1
      const sets: Array<{ label: string; entries: typeof described; extra: string[] }> = [
        ...(wholePlan ? [{ label: 'Whole plan', entries: described, extra: talentLine }] : []),
        ...described.map(entry => ({ label: `${gearSlotLabels[entry.item.slot]}: ${entry.item.name} at ${entry.item.itemLevel}`, entries: [entry], extra: [] as string[] })),
        ...(planTalents ? [{ label: 'Plan talents', entries: [] as typeof described, extra: talentLine }] : []),
      ]
      // Each planned item alone, by its profile line, so a top player's identical item shares its measurement:
      // running the same profile twice only measures noise, which once showed the same cloak beating itself
      const sharedSingle = new Map<string, number>(described.map((entry, index) => [entry.text, index + (wholePlan ? 1 : 0)]))
      // What you wear now needs no run of its own; an item identical to it is measured as the reference
      const wearing = new Set(prepared.current.gear.flatMap(item => { const text = itemLine(item).text; return text ? [text] : [] }))
      const roster = topForRun && topForRun.specId === prepared.current.specId ? rosterRuns(prepared.current, topForRun, sets, sharedSingle, wearing, new Map([...prepared.current.gear, ...swaps].map(item => [item.slot, item.itemId ?? null])), catalyst) : []
      const lines = sets.flatMap((set, index) => [...set.entries.map(entry => entry.text), ...set.extra].map(text => `profileset."companion_candidate_${index + 1}"+=${text}`))
      const reference = prepared.current.gear.map(item => itemLine(item).text).find(Boolean)
      if (!reference) throw new Error('No equipped item could be described to the engine')
      lines.unshift(`profileset."${REFERENCE_PROFILESET}"+=${reference}`)
      const plan = {
        name: draft.name, activity, whole: wholePlan ? 0 : null, skipped,
        top: null, talents: planTalents,
        roster: roster.length && topForRun ? { population: topForRun.population, cap, beyondCap: beyond, players: roster } : null,
        swaps: swaps.map(item => ({ slot: item.slot, from: prepared.current.gear.find(value => value.slot === item.slot)?.name ?? 'Empty', to: item.name, itemLevel: item.itemLevel ?? 0 })),
      }
      const job = request(prepared, start, sets.map(set => set.entries.map(entry => toItemVariant(entry.item))), { mode: 'profileset', candidateLabels: sets.map(set => set.label), plan })
      return enqueue(prepared, job, `${prepared.text}\n${lines.join('\n')}\n`, `Plan · ${draft.name}`)
    },
    /** Runs your character with the top players' most worn items and most popular talents, next to your current setup */
    async startBenchmark(input: SimulationBenchmarkStart, top: TopPlayers): Promise<SimulationJob> {
      if (closed) throw new Error('The simulation service is closing')
      const start = simulationBenchmarkStartSchema.parse(input)
      const prepared = await prepare(start)
      if (top.specId !== prepared.current.specId) throw new Error('The top players sampled are for another specialization')
      if (!top.gearPlayers) throw new Error('No top player gear was found for this specialization')
      const plan = benchmarkPlan(prepared.current, await withEnchantIds(top), ladderCeiling)
      if (!plan.kinds.length) throw new Error('You already wear the items and talents most top players use')
      try { swapIn(prepared.current, plan.gear) } catch (error) { throw new Error(`${benchmarkLabels.gear}: ${error instanceof Error ? error.message : 'this swap is not allowed'}`) }
      const gearLines = plan.gear.map(item => { const line = itemLine(item); if (!line.text || line.reasons.length) throw new Error(`${benchmarkLabels.gear}: ${line.reasons[0] ?? 'an item could not be described to the engine'}`); return line.text })
      const lines: string[] = []
      plan.kinds.forEach((kind, index) => {
        const name = `companion_candidate_${index + 1}`
        if (kind !== 'talents') for (const line of gearLines) lines.push(`profileset."${name}"+=${line}`)
        if (kind !== 'gear') lines.push(`profileset."${name}"+=talents=${plan.talents}`)
      })
      const reference = prepared.current.gear.map(item => itemLine(item).text).find(Boolean)
      if (!reference) throw new Error('No equipped item could be described to the engine')
      lines.unshift(`profileset."${REFERENCE_PROFILESET}"+=${reference}`)
      const candidates = plan.kinds.map(kind => kind === 'talents' ? [] : plan.gear.map(item => toItemVariant(item)))
      const benchmark = {
        kinds: plan.kinds, population: top.population, players: top.gearPlayers,
        itemLevel: { yours: prepared.current.itemLevel, average: top.averageItemLevel },
        swapped: plan.gear.map(item => ({ slot: item.slot, from: prepared.current.gear.find(value => value.slot === item.slot)?.name ?? 'Empty', to: item.name, itemLevel: item.itemLevel ?? 0 })),
        talentPlayers: plan.talents ? top.builds[0]?.count ?? null : null, skipped: plan.skipped, cap: ladderCeiling,
      }
      const job = request(prepared, start, candidates, { mode: 'profileset', candidateLabels: plan.kinds.map(kind => benchmarkLabels[kind]), benchmark }, { talents: plan.talents })
      return enqueue(prepared, job, `${prepared.text}\n${lines.join('\n')}\n`, 'Compared with top players')
    },
    async cancelJob(characterId: string, jobId: string) {
      const job = await updateJob(characterId, jobId, value => { if (value.state !== 'queued' && value.state !== 'running') throw new Error('Only queued or running jobs can be cancelled'); value.state = 'cancelled'; value.finishedAt = now(); value.result = null; value.failure = 'Simulation cancelled' })
      if (active?.id === jobId && active.characterId === characterId) active.process.cancel()
      const position = jobs.findIndex(value => value.id === jobId && value.characterId === characterId)
      if (position >= 0) { jobs.splice(position, 1); knownJobs.delete(jobId) }
      return job
    },
    /** Removes a finished, failed, or cancelled run and its engine files; a queued or running one must be cancelled first */
    async deleteJob(characterId: string, jobId: string) {
      if (!/^[0-9a-f-]{36}$/i.test(jobId)) throw new Error('The simulation job no longer exists')
      await mutate(characterId, state => {
        const job = state.jobs.find(value => value.id === jobId)
        if (!job) throw new Error('The simulation job no longer exists')
        if (job.state === 'queued' || job.state === 'running') throw new Error('Cancel this simulation before deleting it')
        state.jobs = state.jobs.filter(value => value.id !== jobId)
      })
      knownJobs.delete(jobId)
      await rm(path.join(options.artifactDir, jobId), { recursive: true, force: true }).catch(() => {})
    },
    async close() { closed = true; jobs.length = 0; active?.process.cancel(); await draining; await Promise.allSettled([...mutations.values()]) },
  }
  return service
}
export type SimulationService = ReturnType<typeof createSimulationService>
