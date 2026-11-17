// Downloads a Mythic+ season's dungeon data and art into the app, since almost none of it changes during a season
// Run with `npm run dungeon-data`; commit data/dungeons/<season>.json and any new public/assets/dungeons images
// `npm run dungeon-data -- --spells` only refreshes the trash spells in the bundle already saved
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { fetchDungeonRoutes, fetchSeasonDungeons } from '../src/main/providers/raiderio-dungeons'
import { fetchDungeonEnemies } from '../src/main/providers/keystone-guru'
import { MDT_REPO, mdtFileFor, parseMdtEnemies } from './mdt'
import { bestFamily, type DungeonBundle, type DungeonEnemies, type DungeonList, type DungeonRoutes } from '../src/shared/dungeons'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

export type Sources = {
  list: () => Promise<DungeonList>
  routes: (season: string, dungeon: string) => Promise<DungeonRoutes>
  enemies: (dungeon: string, routeKey: string | null) => Promise<DungeonEnemies>
  /** Saves a dungeon's art unless it is already bundled, returning its path under public/assets, or null */
  art: (slug: string, url: string | null) => Promise<string | null>
  /** A dungeon's Mythic Dungeon Tools file, or null when MDT has none */
  mdt?: (slug: string) => Promise<string | null>
  /** Saves a creature render unless it is already bundled, returning its path under public/assets, or null */
  npcArt?: (displayId: number) => Promise<string | null>
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
  const bundle: DungeonBundle = { season: { slug: list.season.slug, name: list.season.name, endsAt: list.season.endsAt ?? null }, generatedAt: now.toISOString(), dungeons }
  return sources.mdt ? addSpells(bundle, sources.mdt, log, sources.npcArt) : bundle
}

/** Gives each enemy the spells MDT lists for it, whether stuns work on it, and a picture of the trash worth showing */
export async function addSpells(bundle: DungeonBundle, mdt: (slug: string) => Promise<string | null>, log: (line: string) => void = () => {}, npcArt?: (displayId: number) => Promise<string | null>): Promise<DungeonBundle> {
  const dungeons: DungeonBundle['dungeons'] = []
  for (const dungeon of bundle.dungeons) {
    const lua = dungeon.enemies ? await mdt(dungeon.slug).catch(error => { log(`${dungeon.slug}: spells unavailable (${(error as Error).message})`); return null }) : null
    if (!lua || !dungeon.enemies) { dungeons.push(dungeon); continue }
    const found = parseMdtEnemies(lua)
    const enemies = []
    for (const enemy of dungeon.enemies.enemies) {
      const entry = found.get(enemy.npcId)
      if (!entry) { enemies.push(enemy); continue }
      // Bosses have journal portraits, and filler such as critters is never listed, so only trash that matters gets art
      const listed = !enemy.boss && ((enemy.forces ?? 0) > 0 || enemy.dangerous || entry.spells.length > 0)
      const image = listed && entry.displayId && npcArt ? await npcArt(entry.displayId).catch(error => { log(`${enemy.name}: art unavailable (${(error as Error).message})`); return null }) : null
      enemies.push({ ...enemy, spells: entry.spells, stunnable: entry.stunnable, ...(entry.displayId ? { displayId: entry.displayId } : {}), ...(image ? { image } : {}) })
    }
    log(`${dungeon.name}: spells for ${enemies.filter(enemy => enemy.spells?.length).length} of ${enemies.length} enemies, ${enemies.filter(enemy => enemy.image).length} pictures`)
    dungeons.push({ ...dungeon, enemies: { ...dungeon.enemies, enemies } })
  }
  return { ...bundle, dungeons }
}

/** MDT's current dungeon files, read from its repository's newest expansion folder */
function mdtSource(folder = 'Midnight') {
  let files: Promise<string[]> | null = null
  const list = () => files ??= fetch(`https://api.github.com/repos/${MDT_REPO}/contents/${folder}`, { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(20_000) })
    .then(response => { if (!response.ok) throw new Error(`listing failed (${response.status})`); return response.json() as Promise<Array<{ name: string }>> })
    .then(entries => entries.map(entry => entry.name).filter(name => name.endsWith('.lua')))
  return async (slug: string) => {
    const file = mdtFileFor(slug, await list())
    if (!file) return null
    const response = await fetch(`https://raw.githubusercontent.com/${MDT_REPO}/master/${folder}/${file}`, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
    if (!response.ok) throw new Error(`download failed (${response.status})`)
    return response.text()
  }
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

/** Wowhead's transparent render of a creature model, kept once bundled */
async function saveNpcArt(displayId: number) {
  if (!Number.isInteger(displayId) || displayId <= 0) return null
  const relative = `npcs/${displayId}.webp`
  const target = resolve(root, 'public/assets', relative)
  try { await access(target); return relative } catch { /* not bundled yet */ }
  const response = await fetch(`https://wow.zamimg.com/modelviewer/live/webthumbs/npc/${displayId % 256}/${displayId}.webp`, { redirect: 'error', signal: AbortSignal.timeout(20_000) })
  if (response.status === 404) return null
  if (!response.ok || response.headers.get('content-type') !== 'image/webp') throw new Error(`download failed (${response.status})`)
  await mkdir(dirname(target), { recursive: true })
  await writeFile(target, Buffer.from(await response.arrayBuffer()))
  return relative
}

async function main() {
  const log = (line: string) => console.log(line)
  const bundle = process.argv.includes('--spells')
    ? await addSpells(JSON.parse(await readFile(resolve(root, 'data/dungeons', `${(await fetchSeasonDungeons()).season.slug}.json`), 'utf8')) as DungeonBundle, mdtSource(), log, saveNpcArt)
    : await buildBundle({ list: () => fetchSeasonDungeons(), routes: fetchDungeonRoutes, enemies: fetchDungeonEnemies, art: saveArt, mdt: mdtSource(), npcArt: saveNpcArt, log })
  const file = resolve(root, 'data/dungeons', `${bundle.season.slug}.json`)
  await mkdir(dirname(file), { recursive: true })
  await writeFile(file, `${JSON.stringify(bundle, null, 1)}\n`)
  console.log(`Saved ${bundle.dungeons.length} dungeons for ${bundle.season.name} to ${file}`)
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
