import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import { fetchItemPreview, fetchRealmStatus, fetchTokenPrice, type BlizzardApi, type BlizzardRegion, type ItemPreview, type RealmStatus } from './providers/blizzard'
import type { GameDataClient } from './gamedata/client'
import type { ItemDetail } from '../shared/gamedata'
import { fetchAffixes, fetchTopPlayers, type WeeklyAffixes } from './providers/raiderio-top'
import { weekStart } from '../shared/weekly'
import { capTopLevels, type TopPlayers, type TopRegion } from '../shared/top-players'
import { ladderCeiling } from './item-tracks'

const TOP_TTL = 6 * 3_600_000
const TOKEN_TTL = 20 * 60_000
/** Blizzard refreshes realm state every minute or so; two minutes keeps the list current without hammering the API */
const REALM_TTL = 2 * 60_000
const HISTORY_DAYS = 30
const PREVIEW_TTL = 24 * 3_600_000
const PREVIEW_LIMIT = 800

export type RealmStatusReport = { configured: false } | { configured: true; region: BlizzardRegion; checkedAt: string; realms: RealmStatus[] }
export type TokenPrice = { configured: false } | { configured: true; region: BlizzardRegion; gold: number; updatedAt: string; history: Array<{ at: string; gold: number }> }

const historySchema = z.record(z.string(), z.array(z.object({ at: z.string().datetime(), gold: z.number().int().nonnegative() })).max(5000))

async function writeAtomic(file: string, value: unknown) {
  await mkdir(path.dirname(file), { recursive: true })
  const temporary = `${file}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(value))
  await rename(temporary, file)
}

export type ItemTooltip = { item: ItemDetail | null; preview: ItemPreview | null }

/** Public, non-personal data shared by every character: top-player tallies, item tooltips, and the WoW Token price */
export function createInsights(options: { cacheDir: string; blizzardApi: () => Promise<BlizzardApi | null>; gameData: GameDataClient }) {
  const previews = new Map<string, { value: ItemPreview; at: number }>()
  const previewRequests = new Map<string, Promise<ItemPreview | null>>()
  const top = new Map<string, { value: TopPlayers; at: number }>()
  const inflight = new Map<string, Promise<TopPlayers>>()
  const tokenChecked = new Map<BlizzardRegion, number>()
  const realms = new Map<BlizzardRegion, { value: RealmStatus[]; at: number }>()
  const realmRequests = new Map<BlizzardRegion, Promise<RealmStatus[]>>()
  const historyFile = path.join(options.cacheDir, 'token-history.json')
  const topFile = (key: string) => path.join(options.cacheDir, `top-players-${key}.json`)

  /**
   * Top players' items capped at the top regular upgrade rank, which is what every screen shows. A plan simulation asks
   * for the uncapped levels, since a plan that reaches past the cap is compared with what top players really wear
   */
  async function topPlayers(input: { specId: number; specName: string; className: string; region: TopRegion; force?: boolean; uncapped?: boolean }): Promise<TopPlayers> {
    const value = await rawTopPlayers(input)
    return input.uncapped ? value : capTopLevels(value, ladderCeiling)
  }

  async function rawTopPlayers(input: { specId: number; specName: string; className: string; region: TopRegion; force?: boolean }): Promise<TopPlayers> {
    const key = `${input.specId}-${input.region}`
    const cached = top.get(key)
    if (!input.force && cached && Date.now() - cached.at < TOP_TTL) return cached.value
    if (!cached && !input.force) {
      try {
        const disk = JSON.parse(await readFile(topFile(key), 'utf8')) as TopPlayers
        const at = Date.parse(disk.observedAt)
        const hasLevels = Object.values(disk.slots).every((slot) => slot?.items.every((item) => 'level' in item))
        if (hasLevels && disk.specId === input.specId && disk.region === input.region && Number.isFinite(at) && Date.now() - at < TOP_TTL) { top.set(key, { value: disk, at }); return disk }
      } catch { /* No cached tally yet */ }
    }
    const pending = inflight.get(key)
    if (pending) return pending
    const request = fetchTopPlayers(input).then(async value => {
      top.set(key, { value, at: Date.now() })
      await writeAtomic(topFile(key), value).catch(() => {})
      return value
    }).finally(() => inflight.delete(key))
    inflight.set(key, request)
    return request
  }

  async function readHistory() {
    try { return historySchema.parse(JSON.parse(await readFile(historyFile, 'utf8'))) } catch { return {} as z.infer<typeof historySchema> }
  }

  /** Each Blizzard price update is recorded once, so the chart grows while the app is used */
  async function wowToken(region: BlizzardRegion): Promise<TokenPrice> {
    const api = await options.blizzardApi()
    if (!api) return { configured: false }
    const history = await readHistory()
    let series = history[region] ?? []
    const last = series.at(-1)
    if (!last || Date.now() - (tokenChecked.get(region) ?? 0) > TOKEN_TTL) {
      const price = await fetchTokenPrice(api, region)
      tokenChecked.set(region, Date.now())
      if (!series.some(entry => entry.at === price.updatedAt)) {
        const cutoff = Date.now() - HISTORY_DAYS * 86_400_000
        series = [...series, { at: price.updatedAt, gold: price.gold }].filter(entry => Date.parse(entry.at) >= cutoff).sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
        await writeAtomic(historyFile, { ...history, [region]: series })
      }
    }
    const latest = series.at(-1)
    if (!latest) throw new Error('The WoW Token price is not available yet')
    return { configured: true, region, gold: latest.gold, updatedAt: latest.at, history: series }
  }

  /** Every connected realm's state, shared by all open views and fetched at most once per refresh window */
  async function realmStatus(region: BlizzardRegion, force = false): Promise<RealmStatusReport> {
    const api = await options.blizzardApi()
    if (!api) return { configured: false }
    const cached = realms.get(region)
    if (!force && cached && Date.now() - cached.at < REALM_TTL) return { configured: true, region, checkedAt: new Date(cached.at).toISOString(), realms: cached.value }
    let request = realmRequests.get(region)
    if (!request) {
      request = fetchRealmStatus(api, region).then(value => { realms.set(region, { value, at: Date.now() }); return value }).finally(() => realmRequests.delete(region))
      realmRequests.set(region, request)
    }
    try {
      await request
    } catch (error) {
      // A failed check keeps showing the last known state, marked by its age, rather than blanking the list
      if (!cached) throw error
    }
    const latest = realms.get(region)!
    return { configured: true, region, checkedAt: new Date(latest.at).toISOString(), realms: latest.value }
  }

  /** Local name, icon, and sources plus Blizzard's stat lines when a key is connected; each half is optional */
  async function itemTooltip(id: number): Promise<ItemTooltip> {
    const local = Promise.resolve().then(() => options.gameData.call('item', id)).catch(() => null) as Promise<ItemDetail | null>
    const remote = (async () => {
      const api = await options.blizzardApi().catch(() => null)
      if (!api) return null
      const key = `${api.credentials.region}:${id}`
      const cached = previews.get(key)
      if (cached && Date.now() - cached.at < PREVIEW_TTL) {
        previews.delete(key)
        previews.set(key, cached)
        return cached.value
      }
      previews.delete(key)
      const pending = previewRequests.get(key)
      if (pending) return pending
      const request = fetchItemPreview(api, id).then(value => {
        // Missing or failed previews stay retryable, including after reconnecting a key
        if (value) {
          previews.set(key, { value, at: Date.now() })
          if (previews.size > PREVIEW_LIMIT) previews.delete(previews.keys().next().value!)
        }
        return value
      }).catch(() => null).finally(() => previewRequests.delete(key))
      previewRequests.set(key, request)
      return request
    })()
    const [item, preview] = await Promise.all([local, remote])
    return { item, preview }
  }

  const affixCache = new Map<string, { value: WeeklyAffixes; week: number | null; at: number }>()
  /** Affixes change at the weekly reset, so a cached list is reused until the region's week turns over */
  async function affixes(region: 'us' | 'eu' | 'kr' | 'tw'): Promise<WeeklyAffixes> {
    const week = weekStart(region)
    const cached = affixCache.get(region)
    if (cached && cached.week === week && Date.now() - cached.at < TOP_TTL) return cached.value
    const value = await fetchAffixes(region)
    affixCache.set(region, { value, week, at: Date.now() })
    return value
  }

  return { topPlayers, wowToken, realmStatus, itemTooltip, affixes }
}
export type Insights = ReturnType<typeof createInsights>
