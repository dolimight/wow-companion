// Bundles the raids of every ended season in the last three expansions, so the Raids page can open them without the player's game files:
// which raids each season had (Raider.IO's documented static data), and each raid's bosses and loot at every
// difficulty, its loading-screen art, and its icons (a local World of Warcraft install). Run with
// `npm run raid-history` (add `-- --cache <dir>` to reuse a game data folder that already holds the item index), then
// commit data/raids/history.json, data/raids/encounters/history.json, and any new public/assets images.
// Cropping the art needs ffmpeg on the PATH; without it the raids fall back to the journal's button art
import { execFile } from 'node:child_process'
import { access, mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { promisify } from 'node:util'
import { z } from 'zod'
import type { EncounterBundle } from '../src/shared/dungeons'
import { fullSeasonName, pastRaidSeasons, raidSlug, type RaidHistory, type RaidHistoryJournals, type RaidInfo, type RaidSeason, type SeasonWindow } from '../src/shared/raids'
import { bundleIcons, raidJournals, saveIcons, type EncounterSource } from './encounter-data'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const run = promisify(execFile)

/** What the script reads from the game files, so the assembly can be tested without an install */
export type HistorySource = Pick<EncounterSource, 'build' | 'journal' | 'loot' | 'log'> & {
  /** The journal instances holding these bosses, each with its loading-screen art */
  instances: (encounterNames: string[]) => Promise<Array<{ name: string; art: number | null }>>
}

/** "March on Quel'Danas" becomes "MOQ" */
const initials = (name: string) => name.split(/[\s-]+/).map(word => word[0] ?? '').join('').toLocaleUpperCase()

/**
 * Each season's raids as the journal keeps them: a tier Raider.IO files as one raid is split into its instances, each
 * named and listed with its bosses as the journal has them. A raid run again later, such as Dragonflight's Awakened
 * raids, shares the first one's journal rather than bundling it twice. The art maps a raid slug to its loading-screen
 * file
 */
export async function buildRaidHistory(seasons: RaidSeason[], source: HistorySource, now = new Date()): Promise<{ history: RaidHistory; journals: RaidHistoryJournals; art: Record<string, number> }> {
  const log = source.log ?? (() => {})
  const journals: RaidHistoryJournals['raids'] = {}
  const art: Record<string, number> = {}
  const kept: RaidSeason[] = []
  // Journal instance name to the slug its journal is bundled under
  const bundled = new Map<string, string>()
  // Oldest first, so an original raid owns its journal before its later run shares it
  for (const season of [...seasons].reverse()) {
    const raids: RaidInfo[] = []
    for (const raid of season.raids) {
      // Awakened bosses keep their journal names
      const instances = await source.instances(raid.encounters.map(encounter => encounter.name.replace(/^Awakened /, '')))
      if (!instances.length) { log(`${raid.name}: not in the Encounter Journal`); continue }
      for (const instance of instances) {
        const single = instances.length === 1
        const slug = single ? raid.slug : raidSlug(instance.name)
        const shared = bundled.get(instance.name)
        const entry = shared ? journals[shared] : await raidJournals(instance.name, source)
        if (!entry) { log(`${instance.name}: not in the Encounter Journal`); continue }
        const bosses = (entry.heroic ?? Object.values(entry)[0])?.bosses ?? []
        if (!shared) { journals[slug] = entry; bundled.set(instance.name, slug) }
        if (instance.art) art[slug] = instance.art
        // Raider.IO's name keeps "Awakened"; a split tier takes each instance's journal name
        raids.push({ slug, name: single ? raid.name : instance.name, shortName: single ? raid.shortName : initials(instance.name), startsAt: raid.startsAt, encounters: bosses.map(boss => ({ slug: raidSlug(boss.name), name: boss.name })), ...(shared ? { journal: shared } : {}) })
        log(`${season.name} · ${instance.name}: ${bosses.length} bosses on ${Object.keys(entry).join(', ')}`)
      }
    }
    raids.sort((a, b) => b.encounters.length - a.encounters.length || a.name.localeCompare(b.name))
    if (raids.length) kept.unshift({ ...season, raids })
  }
  const generatedAt = now.toISOString()
  return { history: { generatedAt, gameBuild: source.build, seasons: kept }, journals: { generatedAt, gameBuild: source.build, raids: journals }, art }
}

/**
 * The rows of a loading screen that hold the art, read from a picture scaled to `width` pixels per row: the game pads
 * the art with a flat border above and below, the colour of its first column. A row counts as border when most of it is
 * that colour, since badges and the raid's crest can reach into the border
 */
export function artBand(rgb: Uint8Array, width: number): { top: number; height: number } {
  const rows = Math.floor(rgb.length / (width * 3))
  // Read a little inside, since the outermost rows can carry a thin edge line
  const at = Math.min(8, rows - 1) * width * 3
  const pad = [rgb[at]!, rgb[at + 1]!, rgb[at + 2]!]
  const flat = (row: number) => {
    let matching = 0
    for (let x = 0; x < width; x++) if ([0, 1, 2].every(c => Math.abs(rgb[(row * width + x) * 3 + c]! - pad[c]!) <= 16)) matching++
    return matching >= width / 2
  }
  // Start inside the edge line when the border is there, then walk to the art
  const inset = Math.min(8, Math.floor(rows / 8))
  let top = flat(inset) ? inset : 0
  while (top < rows && flat(top)) top++
  let bottom = flat(rows - 1 - inset) ? rows - 1 - inset : rows - 1
  while (bottom > top && flat(bottom)) bottom--
  return top >= rows ? { top: 0, height: rows } : { top, height: bottom - top + 1 }
}

/** The loading screen cropped to its art and saved 1440 px wide, like the current season's; false without ffmpeg */
async function saveArt(slug: string, png: string, log: (line: string) => void): Promise<boolean> {
  const target = resolve(root, 'public/assets/raids', `${slug}.jpg`)
  try { await access(target); return true } catch { /* not saved yet */ }
  try {
    const width = 64
    const { stdout } = await run('ffmpeg', ['-v', 'error', '-i', png, '-vf', `scale=${width}:ih:flags=neighbor`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], { encoding: 'buffer', maxBuffer: 64 * 1024 * 1024 })
    const band = artBand(new Uint8Array(stdout), width)
    await mkdir(dirname(target), { recursive: true })
    await run('ffmpeg', ['-v', 'error', '-y', '-i', png, '-vf', `crop=iw:${band.height}:0:${band.top},scale=1440:-2`, '-q:v', '3', target])
    return true
  } catch (error) {
    log(`${slug}: art not saved (${(error as Error).message.split('\n')[0]})`)
    return false
  }
}

const seasonSchema = z.object({ slug: z.string(), name: z.string(), is_main_season: z.boolean().optional(), starts: z.record(z.string(), z.string().nullable()).optional(), ends: z.record(z.string(), z.string().nullable()).optional() })

/** Every main Mythic+ season with its US window, under its full name such as "The War Within Season 3" */
async function fetchSeasonWindows(): Promise<SeasonWindow[]> {
  const { getJson } = await import('../src/main/providers/raiderio-top')
  const windows: SeasonWindow[] = []
  for (const expansion of [12, 11, 10, 9]) {
    const parsed = z.object({ seasons: z.array(seasonSchema).default([]) }).safeParse(await getJson('/api/v1/mythic-plus/static-data', { expansion_id: String(expansion) }).catch(() => null))
    for (const season of parsed.success ? parsed.data.seasons : []) {
      if (season.is_main_season === false || !season.starts?.us || !season.ends?.us) continue
      windows.push({ slug: season.slug, name: fullSeasonName(season.slug, season.name.split(' • ')[0]!.trim()), startsAt: season.starts.us, endsAt: season.ends.us })
    }
  }
  return windows
}

async function main() {
  // Loaded here so the tests can import the assembly without the game data engine's native modules
  const { GameDataEngine } = await import('../src/main/gamedata/engine')
  const { detectInstall } = await import('../src/main/gamedata/install')
  const { fetchRaids } = await import('../src/main/providers/raiderio-raids')
  const log = (line: string) => console.log(line)
  const seasons = pastRaidSeasons(await fetchRaids(undefined, [12, 11, 10, 9]), await fetchSeasonWindows())
  log(`Seasons: ${seasons.map(season => `${season.name} (${season.raids.map(raid => raid.name).join(', ')})`).join('; ')}`)
  const at = process.argv.indexOf('--cache')
  const cache = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]!) : resolve(root, '.local/gamedata')
  const install = await detectInstall()
  if (!install) throw new Error('No World of Warcraft install found')
  const engine = new GameDataEngine(cache, { status: status => { if (status.progress) console.log(status.progress) } })
  try {
    await engine.useInstall(install)
    await engine.ensureIndex()
    const built = await buildRaidHistory(seasons, {
      build: engine.getStatus().indexedVersion ?? 'unknown',
      instances: names => engine.raidInstances(names),
      journal: (name, ids, difficulty) => engine.dungeonJournal(name, ids, difficulty),
      loot: ids => engine.encounterLoot(ids),
      log,
    })
    // One picture per loading screen, so a raid run again reuses its original's
    const saved = new Map<number, string>()
    for (const season of [...built.history.seasons].reverse()) {
      for (const raid of season.raids) {
        const file = built.art[raid.slug]
        if (!file) continue
        const path = saved.get(file) ?? (await saveArt(raid.slug, await engine.icon(file), log) ? `raids/${raid.slug}.jpg` : null)
        if (path) { saved.set(file, path); raid.art = path }
      }
    }
    const icons = await saveIcons(id => engine.icon(id), bundleIcons({ dungeons: {}, raids: built.journals.raids, spells: {} } as unknown as EncounterBundle))
    await mkdir(resolve(root, 'data/raids/encounters'), { recursive: true })
    await writeFile(resolve(root, 'data/raids/history.json'), `${JSON.stringify(built.history, null, 1)}\n`)
    await writeFile(resolve(root, 'data/raids/encounters/history.json'), `${JSON.stringify(built.journals)}\n`)
    log(`Saved ${built.history.seasons.length} seasons and ${Object.keys(built.journals.raids).length} raids from ${built.history.gameBuild}, ${icons} new icons`)
  } finally { await engine.close() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
