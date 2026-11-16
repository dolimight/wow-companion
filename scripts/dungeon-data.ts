// Downloads a Mythic+ season's dungeon data and art into the app, since almost none of it changes during a season
// Run with `npm run dungeon-data`; commit data/dungeons/<season>.json and any new public/assets/dungeons images
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchDungeonRoutes, fetchSeasonDungeons } from '../src/main/providers/raiderio-dungeons'
import { fetchDungeonEnemies } from '../src/main/providers/keystone-guru'
import { bestFamily, type DungeonBundle, type DungeonEnemies, type DungeonList, type DungeonRoutes } from '../src/shared/dungeons'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type Sources = {
  list: () => Promise<DungeonList>
  routes: (season: string, dungeon: string) => Promise<DungeonRoutes>
  enemies: (dungeon: string, routeKey: string | null) => Promise<DungeonEnemies>
  /** Saves a dungeon's art unless it is already bundled, returning its path under public/assets, or null */
  art: (slug: string, url: string | null) => Promise<string | null>
  log?: (line: string) => void
}

/** One request at a time, so a full season takes a few seconds and stays polite to both sites */
export async function buildBundle(sources: Sources, now = new Date()): Promise<DungeonBundle> {
  const log = sources.log ?? (() => {})
  const list = await sources.list()
  const dungeons: DungeonBundle['dungeons'] = []
  for (const dungeon of list.dungeons) {
    const routes = await sources.routes(list.season.slug, dungeon.slug).catch(error => { log(`${dungeon.slug}: routes unavailable (${(error as Error).message})`); return null })
    const routeKey = routes ? bestFamily(routes.families)?.routeKey ?? routes.families.find(family => family.routeKey)?.routeKey ?? null : null
    const enemies = await sources.enemies(dungeon.slug, routeKey).catch(error => { log(`${dungeon.slug}: enemies unavailable (${(error as Error).message})`); return null })
    const art = await sources.art(dungeon.slug, dungeon.artUrl ?? null).catch(error => { log(`${dungeon.slug}: art unavailable (${(error as Error).message})`); return null })
    const { artUrl, ...info } = dungeon
    dungeons.push({ ...info, artUrl, art, routes, enemies })
    log(`${dungeon.name}: ${routes?.families.length ?? 0} routes, ${enemies?.enemies.length ?? 0} enemies${art ? ', art' : ''}`)
  }
  return { season: { slug: list.season.slug, name: list.season.name, endsAt: list.season.endsAt ?? null }, generatedAt: now.toISOString(), dungeons }
}

/** Art already in the repository is kept, since it may have been resized; new art is saved as downloaded */
async function saveArt(slug: string, url: string | null) {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) return null
  const relative = `dungeons/${slug}.jpg`
  const target = resolve(root, 'public/assets', relative)
  try { await access(target); return relative } catch { /* not bundled yet */ }
  if (!url || new URL(url).origin !== 'https://cdn.raiderio.net') return null
  const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (!response.ok || !response.headers.get('content-type')?.startsWith('image/')) throw new Error(`download failed (${response.status})`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  return relative
}

async function main() {
  const bundle = await buildBundle({ list: () => fetchSeasonDungeons(), routes: fetchDungeonRoutes, enemies: fetchDungeonEnemies, art: saveArt, log: line => console.log(line) })
  const file = resolve(root, 'data/dungeons', `${bundle.season.slug}.json`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(bundle, null, 1)}\n`)
  console.log(`Saved ${bundle.dungeons.length} dungeons for ${bundle.season.name} to ${file}`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
