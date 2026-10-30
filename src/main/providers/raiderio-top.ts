import { z } from 'zod'
import { topRegionNames, type TopPlayers, type TopRegion, type TopSlotGroup } from '../../shared/top-players'

const ORIGIN = 'https://raider.io'
const MAX_BYTES = 4 * 1024 * 1024

export class RaiderIoTopError extends Error { constructor(message: string) { super(message); this.name = 'RaiderIoTopError' } }

/** Same safeguards as the profile provider: fixed origin, no redirects, timeouts, and a size cap */
async function getJson(path: string, params: Record<string, string>, signal?: AbortSignal): Promise<unknown> {
  const url = new URL(path, ORIGIN)
  url.search = new URLSearchParams(params).toString()
  const response = await fetch(url, { headers: { Accept: 'application/json' }, redirect: 'error', signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
  if (!response.ok) throw new RaiderIoTopError(response.status === 429 ? 'Raider.IO rate limit reached, try again in a minute' : `Raider.IO request failed (${response.status})`)
  const reader = response.body?.getReader()
  if (!reader) throw new RaiderIoTopError('Raider.IO returned an empty response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new RaiderIoTopError('Raider.IO response exceeds the 4 MiB limit')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

const seasonSchema = z.object({ slug: z.string(), name: z.string(), is_main_season: z.boolean().optional(), starts: z.record(z.string(), z.string().nullable()).optional() })
export type SeasonInfo = { slug: string; name: string }

/** The newest main season that has started in the US, from Raider.IO static data */
export async function fetchCurrentSeason(signal?: AbortSignal): Promise<SeasonInfo> {
  for (const expansion of [12, 11]) {
    const data = z.object({ seasons: z.array(seasonSchema).default([]) }).safeParse(await getJson('/api/v1/mythic-plus/static-data', { expansion_id: String(expansion) }, signal).catch(() => null))
    if (!data.success) continue
    const started = data.data.seasons.filter(season => season.is_main_season !== false && season.starts?.us && Date.parse(season.starts.us) <= Date.now()).sort((a, b) => Date.parse(b.starts!.us!) - Date.parse(a.starts!.us!))
    if (started[0]) return { slug: started[0].slug, name: started[0].name }
  }
  throw new RaiderIoTopError('The current Mythic+ season is not available from Raider.IO')
}

const rosterSchema = z.object({
  character: z.object({ name: z.string(), path: z.string(), class: z.object({ name: z.string() }), spec: z.object({ id: z.number().int(), name: z.string() }), realm: z.object({ name: z.string(), slug: z.string() }), region: z.object({ slug: z.string() }) }),
  loadout: z.string().max(400).nullable().optional(),
})
const runsSchema = z.object({ rankings: z.array(z.object({ score: z.number().optional(), run: z.object({ mythic_level: z.number().int(), dungeon: z.object({ name: z.string() }), roster: z.array(z.unknown()).default([]) }) })).default([]) })
type Entrant = { name: string; realm: string; realmSlug: string; region: string; path: string; className: string; specName: string; score: number | null; keyLevel: number | null; dungeon: string | null; loadout: string | null }
const slug = (value: string) => value.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
const rankedSchema = z.object({ rankings: z.object({ rankedCharacters: z.array(z.object({ score: z.number().optional(), runs: z.array(z.object({ mythicLevel: z.number().int() })).default([]), character: z.object({ name: z.string(), path: z.string(), class: z.object({ name: z.string() }), spec: z.object({ id: z.number().int(), name: z.string() }), realm: z.object({ name: z.string(), slug: z.string() }), region: z.object({ slug: z.string() }), talentLoadoutText: z.string().max(400).nullable().optional() }) })).default([]) }) })

/** Raider.IO's spec leaderboard, the same list its website shows; undocumented, so failures fall back to run scanning */
async function rankedForSpec(season: SeasonInfo, input: { specId: number; specName: string; className: string; region: TopRegion }, want: number, signal?: AbortSignal): Promise<Entrant[] | null> {
  try {
    const parsed = rankedSchema.safeParse(await getJson('/api/mythic-plus/rankings/specs', { region: input.region, season: season.slug, class: slug(input.className), spec: slug(input.specName), page: '0' }, signal))
    if (!parsed.success) return null
    const entrants = parsed.data.rankings.rankedCharacters.filter(entry => entry.character.spec.id === input.specId).slice(0, want).map(entry => {
      const c = entry.character
      return { name: c.name, realm: c.realm.name, realmSlug: c.realm.slug, region: c.region.slug, path: c.path, className: c.class.name, specName: c.spec.name, score: entry.score ?? null, keyLevel: entry.runs.length ? Math.max(...entry.runs.map(run => run.mythicLevel)) : null, dungeon: null, loadout: c.talentLoadoutText ?? null }
    })
    return entrants.length ? entrants : null
  } catch (error) { if (signal?.aborted) throw error; return null }
}

const gearItemSchema = z.object({ item_id: z.number().int().positive(), name: z.string().optional(), item_level: z.number().optional(), gems: z.array(z.number().int()).optional(), gems_detail: z.array(z.object({ id: z.number().int(), name: z.string().optional() })).optional(), enchants_detail: z.array(z.object({ id: z.number().int(), name: z.string().optional() })).optional() }).passthrough()
const gearSchema = z.object({ gear: z.object({ item_level_equipped: z.number().optional(), items: z.record(z.string(), z.unknown()).default({}) }).nullable().optional() })
const groups: Record<string, TopSlotGroup> = { head: 'head', neck: 'neck', shoulder: 'shoulder', back: 'back', chest: 'chest', wrist: 'wrist', hands: 'hands', waist: 'waist', legs: 'legs', feet: 'feet', finger1: 'rings', finger2: 'rings', trinket1: 'trinkets', trinket2: 'trinkets', mainhand: 'mainHand', offhand: 'offHand' }
/** Strips WoW colour and quality markup such as |cnIQ4:…|r and |cffa335ee…|r */
const plain = (name: string) => name.replace(/\|cn[^:|]*:|\|c[0-9a-fA-F]{8}|\|r|\|A:[^|]*\|a|\|T[^|]*\|t/g, '').trim()
const enchantName = (name: string) => plain(name).replace(/^Enchant\s+[^-–]+[-–]\s*/i, '').trim()

function tally<T extends { id: number }>(map: Map<number, T & { count: number; levelSum?: number; levelCount?: number }>, entry: T, level?: number | null) {
  const current = map.get(entry.id)
  const target = current ?? map.set(entry.id, { ...entry, count: 0 }).get(entry.id)!
  target.count += 1
  if (level) { target.levelSum = (target.levelSum ?? 0) + level; target.levelCount = (target.levelCount ?? 0) + 1 }
}

/**
 * Finds the highest-scoring players of one specialization in this season's top Mythic+ runs, then
 * tallies the talent strings and gear they actually use. Every count is out of a named sample
 */
export async function fetchTopPlayers(input: { specId: number; specName: string; className: string; region: TopRegion; want?: number; gearSample?: number }, signal?: AbortSignal): Promise<TopPlayers> {
  const want = input.want ?? 20
  const season = await fetchCurrentSeason(signal)
  const ranked = await rankedForSpec(season, input, want, signal)
  const found = new Map<string, Entrant>((ranked ?? []).map(entry => [entry.path.toLowerCase(), entry]))
  let runsScanned = 0
  for (let page = 0; !ranked && page < 12 && found.size < want; page++) {
    const parsed = runsSchema.safeParse(await getJson('/api/v1/mythic-plus/runs', { season: season.slug, region: input.region, dungeon: 'all', page: String(page) }, signal))
    if (!parsed.success || !parsed.data.rankings.length) break
    for (const ranking of parsed.data.rankings) {
      runsScanned += 1
      for (const raw of ranking.run.roster) {
        const member = rosterSchema.safeParse(raw)
        if (!member.success || member.data.character.spec.id !== input.specId) continue
        const c = member.data.character
        const key = c.path.toLowerCase()
        const existing = found.get(key)
        if (existing) { if (ranking.run.mythic_level > (existing.keyLevel ?? 0)) Object.assign(existing, { keyLevel: ranking.run.mythic_level, dungeon: ranking.run.dungeon.name }); if (!existing.loadout && member.data.loadout) existing.loadout = member.data.loadout; continue }
        if (found.size >= want) continue
        found.set(key, { name: c.name, realm: c.realm.name, realmSlug: c.realm.slug, region: c.region.slug, path: c.path, className: c.class.name, specName: c.spec.name, score: ranking.score ?? null, keyLevel: ranking.run.mythic_level, dungeon: ranking.run.dungeon.name, loadout: member.data.loadout ?? null })
      }
    }
  }
  const players = [...found.values()]
  const builds = new Map<string, { loadout: string; count: number; players: string[] }>()
  for (const player of players) {
    if (!player.loadout) continue
    const build = builds.get(player.loadout) ?? { loadout: player.loadout, count: 0, players: [] }
    build.count += 1
    build.players.push(player.name)
    builds.set(player.loadout, build)
  }
  // Gear needs one profile request per player, so only the first few players are sampled
  const sample = players.slice(0, input.gearSample ?? 12)
  const slotItems = new Map<TopSlotGroup, { items: Map<number, { id: number; name: string; count: number }>; enchants: Map<number, { id: number; name: string; count: number }>; gems: Map<number, { id: number; name: string; count: number }> }>()
  let gearPlayers = 0
  const itemLevels: number[] = []
  for (let index = 0; index < sample.length; index += 4) {
    const batch = await Promise.all(sample.slice(index, index + 4).map(player => getJson('/api/v1/characters/profile', { region: player.region, realm: player.realmSlug, name: player.name, fields: 'gear' }, signal).catch(() => null)))
    for (const raw of batch) {
      const gear = gearSchema.safeParse(raw)
      if (!gear.success || !gear.data.gear) continue
      gearPlayers += 1
      if (gear.data.gear.item_level_equipped) itemLevels.push(gear.data.gear.item_level_equipped)
      // A ring or trinket is counted once per player even when both slots hold the same item
      const seen = new Set<string>()
      for (const [slotKey, value] of Object.entries(gear.data.gear.items)) {
        const group = groups[slotKey]
        const item = gearItemSchema.safeParse(value)
        if (!group || !item.success) continue
        const bucket = slotItems.get(group) ?? { items: new Map(), enchants: new Map(), gems: new Map() }
        slotItems.set(group, bucket)
        const mark = (kind: string, id: number) => { const key = `${group}:${kind}:${id}`; if (seen.has(key)) return false; seen.add(key); return true }
        if (mark('item', item.data.item_id)) tally(bucket.items, { id: item.data.item_id, name: item.data.name ? plain(item.data.name) : `Item ${item.data.item_id}` }, item.data.item_level)
        for (const enchant of item.data.enchants_detail ?? []) if (mark('enchant', enchant.id)) tally(bucket.enchants, { id: enchant.id, name: enchantName(enchant.name ?? `Enchant ${enchant.id}`) })
        const gems = item.data.gems_detail ?? (item.data.gems ?? []).map(id => ({ id, name: undefined }))
        for (const gem of gems) if (mark('gem', gem.id)) tally(bucket.gems, { id: gem.id, name: gem.name ? plain(gem.name) : `Gem ${gem.id}` })
      }
    }
  }
  const top = <T extends { count: number; levelSum?: number; levelCount?: number }>(map: Map<number, T>, limit: number) => [...map.values()].sort((a, b) => b.count - a.count).slice(0, limit).map(({ levelSum, levelCount, ...entry }) => ({ ...entry, level: levelCount ? Math.round((levelSum ?? 0) / levelCount) : null }))
  return {
    season, specId: input.specId, specName: input.specName, className: input.className, region: input.region, observedAt: new Date().toISOString(), runsScanned,
    source: ranked ? 'Raider.IO spec rankings' : 'Raider.IO top runs',
    population: ranked ? `Top ${players.length} ${input.specName} ${input.className} players by Mythic+ score in ${season.name}, ${topRegionNames[input.region]}` : `${players.length} ${input.specName} ${input.className} players found in the top ${runsScanned} Mythic+ runs of ${season.name}, ${topRegionNames[input.region]}`,
    players: players.map(player => ({ name: player.name, realm: player.realm, region: player.region, score: player.score, keyLevel: player.keyLevel, dungeon: player.dungeon, url: `${ORIGIN}${player.path}`, loadout: player.loadout })),
    builds: [...builds.values()].sort((a, b) => b.count - a.count).slice(0, 5),
    gearPlayers, averageItemLevel: itemLevels.length ? Math.round(itemLevels.reduce((sum, value) => sum + value, 0) / itemLevels.length * 10) / 10 : null,
    slots: Object.fromEntries([...slotItems.entries()].map(([group, bucket]) => [group, { items: top(bucket.items, 4), enchants: top(bucket.enchants, 3), gems: top(bucket.gems, 4) }])),
  }
}
