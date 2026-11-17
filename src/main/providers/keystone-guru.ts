import { z } from 'zod'
import { routeEmbedUrl, type DungeonEnemies } from '../../shared/dungeons'

const SITE = 'https://keystone.guru'
const ASSETS = 'https://assets.keystone.guru'
const MAX_BYTES = 4 * 1024 * 1024

export class KeystoneGuruError extends Error { constructor(message: string) { super(message); this.name = 'KeystoneGuruError' } }

/** Fixed origins, no redirects, a timeout, and a size cap, the same safeguards as the Raider.IO providers */
async function getText(url: string, signal?: AbortSignal, headers?: Record<string, string>): Promise<string> {
  const origin = new URL(url).origin
  if (origin !== SITE && origin !== ASSETS) throw new KeystoneGuruError('Unexpected Keystone Guru address')
  const response = await fetch(url, { redirect: 'error', headers, signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(15_000)]) : AbortSignal.timeout(15_000) })
  if (!response.ok) throw new KeystoneGuruError(response.status === 429 ? 'Keystone Guru rate limit reached, try again in a minute' : `Keystone Guru request failed (${response.status})`)
  const reader = response.body?.getReader()
  if (!reader) throw new KeystoneGuruError('Keystone Guru returned an empty response')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_BYTES) throw new KeystoneGuruError('Keystone Guru response exceeds the 4 MiB limit')
      chunks.push(value)
    }
  } finally { await reader.cancel().catch(() => {}) }
  return Buffer.concat(chunks).toString('utf8')
}

/** The site's data files are scripts that assign one JSON object (let name = {...};); only that object is read, never run */
export function scriptObject(text: string): unknown {
  const start = text.indexOf('{'), end = text.lastIndexOf('}')
  if (start < 0 || end <= start) throw new KeystoneGuruError('Keystone Guru changed its dungeon data')
  return JSON.parse(text.slice(start, end + 1))
}

const npcsSchema = z.object({
  dungeonNpcs: z.array(z.object({
    id: z.number().int().positive(),
    name: z.string().max(200),
    dangerous: z.union([z.number(), z.boolean()]).optional(),
    classification_id: z.number().int().optional(),
    class: z.object({ key: z.string().max(40) }).nullable().optional(),
    npc_healths: z.array(z.object({ health: z.number().nonnegative() })).optional(),
  })).default([]),
})
const facadeSchema = z.object({
  mappingVersion: z.object({ enemy_forces_required: z.number().int().positive().nullable().optional() }).optional(),
  // Each entry's forces is either a number or a record holding it
  npcEnemyForces: z.array(z.object({ id: z.number().int().positive(), enemy_forces: z.union([z.number().int().nonnegative(), z.object({ enemy_forces: z.number().int().nonnegative().nullable() })]).nullable() })).default([]),
})

/**
 * Every enemy in a dungeon from the public data files Keystone Guru's map loads: name, the curators' dangerous flag, what
 * kind of enemy it is, and the enemy forces it gives. The site's build version and the dungeon's mapping version are read
 * from a route's public embed page, since the file addresses include them
 */
export async function fetchDungeonEnemies(dungeon: string, routeKey: string | null, signal?: AbortSignal): Promise<DungeonEnemies> {
  if (!/^[a-z0-9-]{1,80}$/.test(dungeon)) throw new KeystoneGuruError('Unknown dungeon')
  const page = await getText(routeKey ? routeEmbedUrl(dungeon, routeKey) : `${SITE}/`, signal)
  const build = page.match(/assets\.keystone\.guru\/compiled\/(v[\d.]{1,20})\//)?.[1]
  if (!build) throw new KeystoneGuruError('Keystone Guru changed its pages; enemies are unavailable for now')
  const mapping = page.match(new RegExp(`mapcontext/data/${dungeon}/(\\d{1,8})/facade\\.js`))?.[1] ?? null
  const [npcs, facade] = await Promise.all([
    getText(`${ASSETS}/compiled/${build}/mapcontext/data/${dungeon}/en_US.js`, signal).then(text => npcsSchema.parse(scriptObject(text))),
    mapping ? getText(`${ASSETS}/compiled/${build}/mapcontext/data/${dungeon}/${mapping}/facade.js`, signal).then(text => facadeSchema.parse(scriptObject(text))).catch(() => null) : Promise.resolve(null),
  ])
  const forces = new Map((facade?.npcEnemyForces ?? []).map(entry => [entry.id, typeof entry.enemy_forces === 'number' ? entry.enemy_forces : entry.enemy_forces?.enemy_forces ?? null]))
  const kinds = new Set(['caster', 'melee', 'ranged', 'healer'])
  return {
    dungeon,
    forcesRequired: facade?.mappingVersion?.enemy_forces_required ?? null,
    enemies: npcs.dungeonNpcs.map(npc => ({
      npcId: npc.id,
      name: npc.name,
      dangerous: !!npc.dangerous,
      kind: (npc.class?.key && kinds.has(npc.class.key) ? npc.class.key : 'other') as DungeonEnemies['enemies'][number]['kind'],
      // Keystone Guru's classifications: 1 normal, 2 elite, 3 boss, 4 final boss
      elite: npc.classification_id === 2,
      boss: (npc.classification_id ?? 0) >= 3,
      health: npc.npc_healths?.[0]?.health ?? null,
      forces: forces.get(npc.id) ?? null,
    })),
    observedAt: new Date().toISOString(),
    source: 'Keystone Guru',
  }
}

/**
 * A route's Mythic Dungeon Tools import string, from the signed export link its embed page carries. The site answers
 * only the requests its own page makes, so the request says it comes from script as that page's does
 */
export async function fetchRouteMdt(dungeon: string, routeKey: string, signal?: AbortSignal): Promise<string> {
  if (!/^[a-z0-9-]{1,80}$/.test(dungeon) || !/^[A-Za-z0-9]{1,20}$/.test(routeKey)) throw new KeystoneGuruError('Unknown route')
  const page = await getText(routeEmbedUrl(dungeon, routeKey), signal)
  // The link sits in the page's JSON options with escaped slashes, such as "\/ajax\/3Kx6vSa\/mdtExport?expires=…"
  const link = page.match(/"mdtExportUrl":"([^"]{1,600})"/)?.[1]?.replace(/\\\//g, '/')
  if (!link || !link.startsWith(`/ajax/${routeKey}/mdtExport?`)) throw new KeystoneGuruError('Keystone Guru has no MDT export for this route')
  const body = await getText(`${SITE}${link}`, signal, { 'x-requested-with': 'XMLHttpRequest', accept: 'application/json' })
  const parsed = z.object({ mdt_string: z.string().min(1).max(200_000).regex(/^[A-Za-z0-9+/=!~]+$/) }).safeParse(JSON.parse(body))
  if (!parsed.success) throw new KeystoneGuruError('Keystone Guru returned an unreadable MDT string')
  return parsed.data.mdt_string
}
