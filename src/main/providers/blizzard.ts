import { z } from 'zod'
import { gearItemSchema, specializationIdSchema, type ActivityRating, type AppearanceSlot, type CharacterStats, type GearItem } from '../../shared/domain'
import { weekStart, type WeeklySnapshot } from '../../shared/weekly'
import { itemLinkVariant } from '../../shared/item-link'

export const blizzardRegions = ['us', 'eu', 'kr', 'tw'] as const
export type BlizzardRegion = (typeof blizzardRegions)[number]
export type BlizzardCredentials = { clientId: string; clientSecret: string; region: BlizzardRegion }

const OAUTH = 'https://oauth.battle.net'
const MAX_BYTES = 4 * 1024 * 1024

export class BlizzardError extends Error {
  constructor(message: string, readonly status: number | null = null, readonly retryAfterMs: number | null = null) { super(message); this.name = 'BlizzardError' }
}

async function readJson(response: Response): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw new BlizzardError('Blizzard returned an empty response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new BlizzardError('Blizzard response exceeds the 4 MiB limit')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

function failure(response: Response, what: string) {
  const retry = Number(response.headers.get('retry-after'))
  const message = response.status === 401 ? 'Blizzard did not accept the API key, check the Client ID and Client Secret'
    : response.status === 403 ? 'This Blizzard key is not allowed to read that data'
    : response.status === 404 ? `${what} was not found or is private on Blizzard's servers`
    : response.status === 429 ? 'Blizzard rate limit reached, try again shortly'
    : `Blizzard request failed (${response.status})`
  return new BlizzardError(message, response.status, response.status === 429 && Number.isFinite(retry) && retry > 0 ? retry * 1000 : null)
}

const tokenSchema = z.object({ access_token: z.string().min(1), expires_in: z.number().positive(), token_type: z.string().optional() })

/** Exchanges a grant at Blizzard's fixed OAuth host using the user's own client credentials */
export async function requestToken(credentials: BlizzardCredentials, body: Record<string, string>, signal?: AbortSignal) {
  const response = await fetch(`${OAUTH}/token`, {
    method: 'POST',
    headers: { Authorization: `Basic ${Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString('base64')}`, 'Content-Type': 'application/x-www-form-urlencoded', Accept: 'application/json' },
    body: new URLSearchParams(body).toString(),
    redirect: 'error',
    signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw response.status === 400 || response.status === 401 ? new BlizzardError('Blizzard did not accept the API key, check the Client ID and Client Secret', response.status) : failure(response, 'Token')
  const token = tokenSchema.parse(await readJson(response))
  return { accessToken: token.access_token, expiresAt: Date.now() + token.expires_in * 1000 }
}

export function authorizeUrl(credentials: BlizzardCredentials, redirectUri: string, state: string) {
  const url = new URL(`${OAUTH}/authorize`)
  url.search = new URLSearchParams({ client_id: credentials.clientId, scope: 'openid wow.profile', state, redirect_uri: redirectUri, response_type: 'code' }).toString()
  return url.href
}

export async function userInfo(accessToken: string, signal?: AbortSignal) {
  const response = await fetch(`${OAUTH}/userinfo`, { headers: { Authorization: `Bearer ${accessToken}`, Accept: 'application/json' }, redirect: 'error', signal: signal ?? AbortSignal.timeout(15_000) })
  if (!response.ok) throw failure(response, 'Account')
  return z.object({ battletag: z.string().optional(), id: z.number().optional() }).parse(await readJson(response))
}

export function realmSlug(realm: string) {
  return realm.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

/** One API client per region, reusing an app token until shortly before it expires */
export class BlizzardApi {
  private appToken: { accessToken: string; expiresAt: number } | null = null
  constructor(readonly credentials: BlizzardCredentials) {}
  private host(region: BlizzardRegion) { return `https://${region}.api.blizzard.com` }
  private expansion: { id: number | null; at: number } | null = null
  /** Newest expansion in the Adventure Journal, cached for a day; null when Blizzard doesn't say */
  async currentExpansionId(region?: BlizzardRegion, signal?: AbortSignal) {
    if (this.expansion && Date.now() - this.expansion.at < 86_400_000) return this.expansion.id
    try {
      const data = z.object({ tiers: z.array(z.object({ id: z.number().int(), name: z.string() })).default([]) }).parse(await this.get('/data/wow/journal-expansion/index', 'static', { region, signal }))
      const tiers = data.tiers.filter(tier => !/current season/i.test(tier.name))
      this.expansion = { id: tiers.length ? Math.max(...tiers.map(tier => tier.id)) : null, at: Date.now() }
    } catch { this.expansion = { id: null, at: Date.now() - 86_400_000 + 600_000 } }
    return this.expansion.id
  }
  async token(signal?: AbortSignal) {
    if (!this.appToken || this.appToken.expiresAt - 60_000 < Date.now()) this.appToken = await requestToken(this.credentials, { grant_type: 'client_credentials' }, signal)
    return this.appToken.accessToken
  }
  async get(path: string, namespace: 'profile' | 'static' | 'dynamic', options: { region?: BlizzardRegion; token?: string; signal?: AbortSignal; what?: string } = {}): Promise<unknown> {
    const region = options.region ?? this.credentials.region
    if (!blizzardRegions.includes(region)) throw new BlizzardError('This region is not supported by the Blizzard API')
    const url = new URL(this.host(region) + path)
    url.searchParams.set('namespace', `${namespace}-${region}`)
    url.searchParams.set('locale', 'en_US')
    const token = options.token ?? await this.token(options.signal)
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, redirect: 'error', signal: options.signal ? AbortSignal.any([options.signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
    if (!response.ok) throw failure(response, options.what ?? 'This data')
    return readJson(response)
  }
}

const named = z.object({ id: z.number().int().optional(), name: z.string().optional() }).passthrough()
const summarySchema = z.object({
  id: z.number().int(), name: z.string(), level: z.number().int().optional(), equipped_item_level: z.number().optional(), last_login_timestamp: z.number().optional(),
  gender: z.object({ type: z.string() }).optional(), race: named.optional(), character_class: named.optional(), active_spec: named.optional(), realm: z.object({ name: z.string(), slug: z.string() }),
})
const equipmentSchema = z.object({ equipped_items: z.array(z.object({
  slot: z.object({ type: z.string() }), item: z.object({ id: z.number().int() }), name: z.string().optional(), level: z.object({ value: z.number() }).optional(),
  bonus_list:z.array(z.number().int().nonnegative()).max(128).optional(),item_link:z.string().max(2000).optional(),
  enchantments: z.array(z.object({ display_string: z.string().optional(), enchantment_id: z.number().optional(), enchantment_slot: z.object({ type: z.string().optional() }).optional() })).optional(),
  sockets: z.array(z.object({ item: z.object({ id: z.number(), name: z.string().optional() }).optional() })).optional(),
  transmog: z.object({ item: z.object({ id: z.number(), name: z.string().optional() }), item_modified_appearance_id: z.number().optional() }).optional(),
  armor: z.object({ display: z.object({ display_string: z.string() }).optional() }).optional(),
  stats: z.array(z.object({ display: z.object({ display_string: z.string(), color: z.object({ r: z.number(), g: z.number(), b: z.number() }).optional() }).optional(), is_negated: z.boolean().optional() })).optional(),
  spells: z.array(z.object({ description: z.string().optional() })).optional(),
}).passthrough()).default([]) })
const appearanceSchema = z.object({ customizations: z.array(z.object({ option: z.object({ id: z.number() }), choice: z.object({ id: z.number() }) })).default([]) }).passthrough()
const mediaSchema = z.object({ assets: z.array(z.object({ key: z.string(), value: z.string().url() })).default([]) })
const keystoneSchema = z.object({ current_mythic_rating: z.object({ rating: z.number() }).optional(), current_period: z.object({ period: z.object({ id: z.number() }).optional() }).optional() }).passthrough()
const pvpSummarySchema = z.object({ brackets: z.array(z.object({ href: z.string() })).default([]) }).passthrough()
const pvpBracketSchema = z.object({ rating: z.number().optional(), bracket: z.object({ type: z.string().optional() }).optional() }).passthrough()

const slotMap: Record<string, GearItem['slot']> = { HEAD: 'head', NECK: 'neck', SHOULDER: 'shoulder', BACK: 'back', CHEST: 'chest', WRIST: 'wrist', HANDS: 'hands', WAIST: 'waist', LEGS: 'legs', FEET: 'feet', FINGER_1: 'finger1', FINGER_2: 'finger2', TRINKET_1: 'trinket1', TRINKET_2: 'trinket2', MAIN_HAND: 'mainHand', OFF_HAND: 'offHand' }
const lookMap: Record<string, AppearanceSlot> = { ...slotMap, SHIRT: 'shirt', TABARD: 'tabard' }

export type BlizzardProfile = {
  characterId: number; name: string; realm: string; realmSlug: string; region: BlizzardRegion; level: number | null; itemLevel: number | null
  className: string | null; specName: string | null; specId: number | null; raceName: string | null; raceId: number | null; sex: 'male' | 'female' | null; observedAt: string | null
  gear: GearItem[]; observedTransmog: Partial<Record<AppearanceSlot, { itemId: number; modifiedAppearanceId: number | null; name: string }>>
  customization: Array<{ optionId: number; choiceId: number }>; renders: Partial<Record<'main' | 'inset' | 'avatar', string>>
  ratings: { mythicPlus: ActivityRating | null; pvp: ActivityRating | null }
  weekly: WeeklySnapshot | null; stats: CharacterStats | null; talents: { loadout: string; specId: number | null; source: string; observedAt: string | null } | null
}

/** Blizzard colours secondary stats green; armor and primary stats stay white like the in-game tooltip */
type StatSource = { armor?: { display?: { display_string: string } }; stats?: Array<{ display?: { display_string: string; color?: { r: number; g: number; b: number } }; is_negated?: boolean }>; spells?: Array<{ description?: string }> }
function statLines(entry: StatSource) {
  const stats = [
    ...(entry.armor?.display ? [{ text: entry.armor.display.display_string, secondary: false }] : []),
    ...(entry.stats ?? []).filter(stat => stat.display && !stat.is_negated).map(stat => ({ text: stat.display!.display_string, secondary: !!stat.display!.color && stat.display!.color.g > 200 && stat.display!.color.r < 100 })),
  ].slice(0, 24)
  const effects = (entry.spells ?? []).flatMap(spell => spell.description ? [spell.description.slice(0, 600)] : []).slice(0, 10)
  return { stats, effects }
}
const clean = (value: string) => value.replace(/\|c[0-9a-fA-F]{8}|\|r|\|A:[^|]*\|a|\|T[^|]*\|t/g, '').replace(/^Enchanted:\s*/, '').trim()

const rated = z.object({ value: z.number(), rating_bonus: z.number(), rating_normalized: z.number() }).partial().passthrough().optional()
const attribute = z.object({ effective: z.number() }).partial().passthrough().optional()
const statisticsSchema = z.object({ health: z.number().optional(), strength: attribute, agility: attribute, intellect: attribute, stamina: attribute, melee_crit: rated, spell_crit: rated, ranged_crit: rated, melee_haste: rated, spell_haste: rated, ranged_haste: rated, mastery: rated, versatility: z.number().optional(), versatility_damage_done_bonus: z.number().optional() }).passthrough()
const specializationsSchema = z.object({ active_specialization: named.optional(), specializations: z.array(z.object({ specialization: named, loadouts: z.array(z.object({ is_active: z.boolean().optional(), talent_loadout_code: z.string().optional() })).default([]) })).default([]) }).passthrough()
const raidsSchema = z.object({ expansions: z.array(z.object({ expansion: named, instances: z.array(z.object({ instance: named, modes: z.array(z.object({ difficulty: z.object({ type: z.string(), name: z.string().optional() }), progress: z.object({ total_count: z.number().int().optional(), encounters: z.array(z.object({ encounter: named, last_kill_timestamp: z.number().optional() })).default([]) }).optional() })).default([]) })).default([]) })).default([]) }).passthrough()
const difficultyRank: Record<string, number> = { LFR: 1, NORMAL: 2, HEROIC: 3, MYTHIC: 4 }
const difficultyLabel: Record<string, string> = { LFR: 'Raid Finder', NORMAL: 'Normal', HEROIC: 'Heroic', MYTHIC: 'Mythic' }
const percent = (value: number | undefined) => value == null ? null : Math.round(value * 100) / 100

/** Stats, talents, and this week's raid kills; each part stays unknown when its endpoint is private */
export function parseBlizzardExtras(input: { statistics: unknown; specializations: unknown; raids: unknown; currentExpansionId?: number | null }, region: BlizzardRegion, now = Date.now()) {
  const observedAt = new Date(now).toISOString()
  let stats: CharacterStats | null = null
  const statistics = statisticsSchema.safeParse(input.statistics ?? null)
  if (statistics.success) {
    const d = statistics.data
    const primary = ([['Strength', d.strength], ['Agility', d.agility], ['Intellect', d.intellect]] as const).map(([name, value]) => ({ name, value: value?.effective ?? 0 })).sort((a, b) => b.value - a.value)[0]!
    const best = (...values: Array<number | undefined>) => { const known = values.filter((value): value is number => value != null); return known.length ? percent(Math.max(...known)) : null }
    stats = { primary: primary.value > 0 ? primary : null, stamina: d.stamina?.effective ?? null, health: d.health ?? null, crit: best(d.melee_crit?.value, d.spell_crit?.value, d.ranged_crit?.value), haste: best(d.melee_haste?.value, d.spell_haste?.value, d.ranged_haste?.value), mastery: percent(d.mastery?.value), versatility: percent(d.versatility_damage_done_bonus), ratings: { crit: best(d.melee_crit?.rating_normalized, d.spell_crit?.rating_normalized, d.ranged_crit?.rating_normalized), haste: best(d.melee_haste?.rating_normalized, d.spell_haste?.rating_normalized, d.ranged_haste?.rating_normalized), mastery: d.mastery?.rating_normalized ?? null, versatility: d.versatility ?? null }, ratingBonus: { crit: best(d.melee_crit?.rating_bonus, d.spell_crit?.rating_bonus, d.ranged_crit?.rating_bonus), haste: best(d.melee_haste?.rating_bonus, d.spell_haste?.rating_bonus, d.ranged_haste?.rating_bonus), mastery: percent(d.mastery?.rating_bonus), versatility: percent(d.versatility_damage_done_bonus) }, source: 'Blizzard', observedAt }
  }
  let talents: BlizzardProfile['talents'] = null
  const specs = specializationsSchema.safeParse(input.specializations ?? null)
  if (specs.success) {
    const activeId = specializationIdSchema.parse(specs.data.active_specialization?.id ?? null)
    const active = specs.data.specializations.find(entry => entry.specialization.id === activeId)
    const code = active?.loadouts.find(loadout => loadout.is_active)?.talent_loadout_code ?? active?.loadouts[0]?.talent_loadout_code
    if (code && code.length <= 400) talents = { loadout: code, specId: activeId ?? null, source: 'Blizzard', observedAt }
  }
  let weekly: WeeklySnapshot | null = null
  const raids = raidsSchema.safeParse(input.raids ?? null)
  const start = weekStart(region, now)
  if (raids.success && start != null) {
    // Only the current expansion's raids fill the Great Vault; older raids still show as lockouts
    const expansions = raids.data.expansions
    const current = expansions.find(entry => /current season/i.test(entry.expansion.name ?? ''))
      ?? (input.currentExpansionId != null ? expansions.find(entry => entry.expansion.id === input.currentExpansionId) : [...expansions].sort((a, b) => (b.expansion.id ?? 0) - (a.expansion.id ?? 0))[0])
    const best = new Map<string, { boss: string; difficulty: string; rank: number }>()
    const lockouts: WeeklySnapshot['lockouts'] = []
    for (const expansion of expansions) for (const instance of expansion.instances) for (const mode of instance.modes) {
      const killed = (mode.progress?.encounters ?? []).filter(entry => (entry.last_kill_timestamp ?? 0) >= start)
      if (!killed.length) continue
      const rank = difficultyRank[mode.difficulty.type] ?? 0
      const difficulty = difficultyLabel[mode.difficulty.type] ?? mode.difficulty.name ?? mode.difficulty.type
      lockouts.push({ name: instance.instance.name ?? 'Raid', difficulty, killed: killed.length, total: mode.progress?.total_count ?? killed.length, raid: true })
      if (expansion !== current) continue
      for (const entry of killed) {
        const key = String(entry.encounter.id ?? entry.encounter.name)
        const current = best.get(key)
        if (!current || current.rank < rank) best.set(key, { boss: entry.encounter.name ?? 'Boss', difficulty, rank })
      }
    }
    weekly = { source: 'Blizzard', observedAt, weekStart: new Date(start).toISOString(), vault: [], raidKills: [...best.values()].slice(0, 60), lockouts: lockouts.slice(0, 60), runs: [] }
  }
  return { stats, talents, weekly }
}

export function parseBlizzardProfile(input: { summary: unknown; equipment: unknown; appearance: unknown; media: unknown; keystone: unknown; pvp: Array<unknown>; statistics?: unknown; specializations?: unknown; raids?: unknown; currentExpansionId?: number | null }, region: BlizzardRegion, now = Date.now()): BlizzardProfile {
  const summary = summarySchema.parse(input.summary)
  const equipment = equipmentSchema.parse(input.equipment ?? {})
  const appearance = appearanceSchema.safeParse(input.appearance ?? {})
  const media = mediaSchema.safeParse(input.media ?? {})
  const keystone = keystoneSchema.safeParse(input.keystone ?? {})
  const observedAt = summary.last_login_timestamp ? new Date(summary.last_login_timestamp).toISOString() : null
  const source = { source: 'Blizzard', sourceUrl: null, observedAt, seasonId: null, rank: null, population: null, rankScope: null }
  const gear: GearItem[] = []
  const observedTransmog: BlizzardProfile['observedTransmog'] = {}
  for (const entry of equipment.equipped_items) {
    const slot = slotMap[entry.slot.type]
    const look = lookMap[entry.slot.type]
    if (look) observedTransmog[look] = entry.transmog ? { itemId: entry.transmog.item.id, modifiedAppearanceId: entry.transmog.item_modified_appearance_id ?? null, name: entry.transmog.item.name ?? `Item ${entry.transmog.item.id}` } : { itemId: entry.item.id, modifiedAppearanceId: null, name: entry.name ?? `Item ${entry.item.id}` }
    if (!slot) continue
    const permanent = entry.enchantments?.find(enchant => enchant.enchantment_slot?.type === 'PERMANENT') ?? entry.enchantments?.[0]
    gear.push(gearItemSchema.parse({ slot, ...itemLinkVariant(entry.item_link), bonusIds:entry.bonus_list??itemLinkVariant(entry.item_link).bonusIds, itemLink:entry.item_link??null, variantCoverage:'partial', itemId: entry.item.id, name: entry.name ?? `Item ${entry.item.id}`, itemLevel: entry.level?.value ?? null, enchant: permanent?.display_string ? clean(permanent.display_string) : null, enchantCoverage: 'complete', gems: (entry.sockets ?? []).map(socket => socket.item?.name ? clean(socket.item.name) : 'Empty socket'), gemsCoverage: 'complete', ...statLines(entry) }))
  }
  const pvpRatings = input.pvp.flatMap(value => { const parsed = pvpBracketSchema.safeParse(value); return parsed.success && parsed.data.rating != null ? [{ rating: parsed.data.rating, bracket: parsed.data.bracket?.type ?? 'PvP' }] : [] }).sort((a, b) => b.rating - a.rating)
  const bracketNames: Record<string, string> = { ARENA_2v2: '2v2 arena', ARENA_3v3: '3v3 arena', BATTLEGROUNDS: 'Rated battlegrounds', SHUFFLE: 'Solo Shuffle', BLITZ: 'Battleground Blitz' }
  const bestPvp = pvpRatings[0]
  const renders: BlizzardProfile['renders'] = {}
  if (media.success) for (const asset of media.data.assets) { if (asset.key === 'main-raw' || (asset.key === 'main' && !renders.main)) renders.main = asset.value; if (asset.key === 'inset') renders.inset = asset.value; if (asset.key === 'avatar') renders.avatar = asset.value }
  const rating = keystone.success ? keystone.data.current_mythic_rating?.rating : undefined
  const specs = specializationsSchema.safeParse(input.specializations ?? null)
  const summarySpecId = specializationIdSchema.parse(summary.active_spec?.id ?? null)
  const activeSpec = specs.success ? specs.data.active_specialization : undefined
  const specId = summarySpecId ?? specializationIdSchema.parse(activeSpec?.id ?? null)
  return {
    characterId: summary.id, name: summary.name, realm: summary.realm.name, realmSlug: summary.realm.slug, region, level: summary.level ?? null, itemLevel: summary.equipped_item_level ?? null,
    className: summary.character_class?.name ?? null, specName: summarySpecId ? summary.active_spec?.name ?? activeSpec?.name ?? null : activeSpec?.name ?? summary.active_spec?.name ?? null, specId, raceName: summary.race?.name ?? null, raceId: summary.race?.id ?? null,
    sex: summary.gender?.type === 'FEMALE' ? 'female' : summary.gender?.type === 'MALE' ? 'male' : null, observedAt, gear, observedTransmog,
    ...parseBlizzardExtras({ statistics: input.statistics, specializations: input.specializations, raids: input.raids, currentExpansionId: input.currentExpansionId }, region, now),
    customization: appearance.success ? appearance.data.customizations.map(entry => ({ optionId: entry.option.id, choiceId: entry.choice.id })) : [], renders,
    ratings: {
      mythicPlus: rating != null ? { ...source, value: Math.round(rating * 10) / 10, label: 'Mythic+ rating' } : null,
      pvp: bestPvp ? { ...source, value: bestPvp.rating, label: `${bracketNames[bestPvp.bracket] ?? bestPvp.bracket} rating`, rankScope: 'Highest current bracket' } : null,
    },
  }
}

/** Optional endpoints fail soft: a private keystone or PvP profile leaves those values unknown */
export async function fetchBlizzardProfile(api: BlizzardApi, lookup: { region: BlizzardRegion; realm: string; name: string }, signal?: AbortSignal): Promise<BlizzardProfile> {
  const base = `/profile/wow/character/${encodeURIComponent(realmSlug(lookup.realm))}/${encodeURIComponent(lookup.name.toLocaleLowerCase())}`
  const options = { region: lookup.region, signal }
  const optional = (path: string) => api.get(base + path, 'profile', options).catch(error => { if (error instanceof BlizzardError && (error.status === 429 || error.status === 401)) throw error; return null })
  const summary = await api.get(base, 'profile', { ...options, what: 'This character' })
  const [equipment, appearance, media, keystone, pvpSummary, statistics, specializations, raids] = await Promise.all([optional('/equipment'), optional('/appearance'), optional('/character-media'), optional('/mythic-keystone-profile'), optional('/pvp-summary'), optional('/statistics'), optional('/specializations'), optional('/encounters/raids')])
  const pvpPaths = pvpSummarySchema.safeParse(pvpSummary ?? {}).data?.brackets.map(entry => { try { return new URL(entry.href).pathname } catch { return null } }).filter((path): path is string => !!path && path.startsWith(base + '/pvp-bracket/')).slice(0, 6) ?? []
  const pvp = await Promise.all(pvpPaths.map(path => api.get(path, 'profile', options).catch(() => null)))
  const currentExpansionId = await api.currentExpansionId(lookup.region, signal)
  return parseBlizzardProfile({ summary, equipment, appearance, media, keystone, pvp, statistics, specializations, raids, currentExpansionId }, lookup.region)
}

const accountSchema = z.object({ wow_accounts: z.array(z.object({ characters: z.array(z.object({ id: z.number(), name: z.string(), level: z.number().optional(), realm: z.object({ name: z.string(), slug: z.string() }), playable_class: named.optional(), playable_race: named.optional() })).default([]) })).default([]) })
export type AccountCharacter = { id: number; name: string; realm: string; level: number | null; className: string | null; raceName: string | null }

export async function fetchAccountCharacters(api: BlizzardApi, userToken: string, region: BlizzardRegion, signal?: AbortSignal): Promise<AccountCharacter[]> {
  const data = accountSchema.parse(await api.get('/profile/user/wow', 'profile', { region, token: userToken, signal, what: 'This account' }))
  return data.wow_accounts.flatMap(account => account.characters).map(c => ({ id: c.id, name: c.name, realm: c.realm.name, level: c.level ?? null, className: c.playable_class?.name ?? null, raceName: c.playable_race?.name ?? null })).sort((a, b) => (b.level ?? 0) - (a.level ?? 0) || a.name.localeCompare(b.name))
}

const realmIndexSchema = z.object({ realms: z.array(z.object({ name: z.string(), slug: z.string() })).default([]) })
export async function fetchRealms(api: BlizzardApi, region: BlizzardRegion, signal?: AbortSignal) {
  return realmIndexSchema.parse(await api.get('/data/wow/realm/index', 'dynamic', { region, signal, what: 'The realm list' })).realms.map(realm => realm.name).sort((a, b) => a.localeCompare(b))
}

/** Account-wide transmog collection; appearance IDs only, and only what the endpoint lists */
export async function fetchCollectedAppearances(api: BlizzardApi, userToken: string, region: BlizzardRegion, signal?: AbortSignal): Promise<number[] | null> {
  try {
    const data = await api.get('/profile/user/wow/collections/transmogs', 'profile', { region, token: userToken, signal })
    const ids = new Set<number>()
    const parsed = z.object({ slots: z.array(z.object({ appearances: z.array(z.object({ id: z.number().int().positive() })).default([]) })).default([]) }).safeParse(data)
    if (!parsed.success) return null
    for (const slot of parsed.data.slots) for (const appearance of slot.appearances) ids.add(appearance.id)
    return ids.size ? [...ids] : null
  } catch { return null }
}

const tokenIndexSchema = z.object({ price: z.number().int().nonnegative(), last_updated_timestamp: z.number() })
/** WoW Token price in gold for one region, as Blizzard publishes it */
export async function fetchTokenPrice(api: BlizzardApi, region: BlizzardRegion, signal?: AbortSignal) {
  const data = tokenIndexSchema.parse(await api.get('/data/wow/token/index', 'dynamic', { region, signal, what: 'The WoW Token price' }))
  return { gold: Math.round(data.price / 10_000), updatedAt: new Date(data.last_updated_timestamp).toISOString() }
}

const display = z.object({ display_string: z.string() })
const previewSchema = z.object({ preview_item: z.object({
  level: z.object({ value: z.number() }).optional(), binding: z.object({ name: z.string() }).optional(), inventory_type: z.object({ name: z.string() }).optional(), item_subclass: z.object({ name: z.string() }).optional(),
  armor: z.object({ display: display.optional() }).optional(), stats: z.array(z.object({ display: display.extend({ color: z.object({ r: z.number(), g: z.number(), b: z.number() }).optional() }).optional(), is_negated: z.boolean().optional() })).optional(),
  spells: z.array(z.object({ description: z.string().optional() })).optional(), sockets: z.array(z.object({ socket_type: z.object({ name: z.string() }).optional() })).optional(),
  weapon: z.object({ damage: display.optional(), attack_speed: display.optional(), dps: display.optional() }).optional(),
  requirements: z.object({ level: display.optional() }).optional(), set: z.object({ display_string: z.string().optional() }).optional(),
}).passthrough() }).passthrough()
export type ItemPreview = { level: number | null; binding: string | null; slot: string | null; subclass: string | null; weapon: string[]; stats: Array<{ text: string; secondary: boolean }>; effects: string[]; sockets: string[]; requirement: string | null; set: string | null }

/** Base-level tooltip lines for any item, as Blizzard's item endpoint describes them */
export async function fetchItemPreview(api: BlizzardApi, id: number, signal?: AbortSignal): Promise<ItemPreview | null> {
  const parsed = previewSchema.safeParse(await api.get(`/data/wow/item/${id}`, 'static', { signal, what: 'This item' }))
  if (!parsed.success) return null
  const item = parsed.data.preview_item
  const { stats, effects } = statLines(item)
  return {
    level: item.level?.value ?? null, binding: item.binding?.name ?? null, slot: item.inventory_type?.name ?? null, subclass: item.item_subclass?.name ?? null,
    weapon: [item.weapon?.damage?.display_string, item.weapon?.attack_speed?.display_string, item.weapon?.dps?.display_string].filter((line): line is string => !!line),
    stats, effects, sockets: (item.sockets ?? []).map(socket => socket.socket_type?.name ?? 'Socket'), requirement: item.requirements?.level?.display_string ?? null, set: item.set?.display_string ?? null,
  }
}
