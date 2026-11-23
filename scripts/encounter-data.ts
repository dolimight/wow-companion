// Reads the season's boss text, loot, and enemy spells from a local World of Warcraft install into the app, so the
// Dungeons and Raids pages never need the player's game files. Run after `npm run dungeon-data` with
// `npm run encounter-data` (add `-- --cache <dir>` to reuse a game data folder that already holds the item index);
// commit data/dungeons/encounters (the season file and icons.json) and any new public/assets/icons images
import { access, copyFile, mkdir, readdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { journalDifficultyIds, type DungeonBundle, type DungeonJournal, type EncounterBundle, type JournalAbility, type JournalDifficulty, type LootItem } from '../src/shared/dungeons'
import { raidDifficulties } from '../src/shared/raids'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')

/** What the script reads from the game files, so the assembly can be tested without an install */
export type EncounterSource = {
  build: string
  journal: (name: string, encounterIds: number[], difficulty: JournalDifficulty) => Promise<DungeonJournal | null>
  loot: (encounterIds: number[]) => Promise<Record<number, LootItem[]>>
  spells: (ids: number[]) => Promise<EncounterBundle['spells']>
  log?: (line: string) => void
}

const withLoot = (journal: DungeonJournal, loot: Record<number, LootItem[]>): DungeonJournal => ({ ...journal, bosses: journal.bosses.map(boss => ({ ...boss, loot: loot[boss.encounterId] ?? [] })) })

/** Every icon the pages show from the bundle: boss portraits, abilities, loot, enemy spells, and the instance buttons */
export function bundleIcons(bundle: EncounterBundle): number[] {
  const icons = new Set<number>()
  const add = (id: number | null | undefined) => { if (id) icons.add(id) }
  const ability = (entry: JournalAbility) => { add(entry.icon); entry.children.forEach(ability) }
  const journal = (entry: DungeonJournal) => {
    add(entry.button)
    for (const boss of entry.bosses) { add(boss.portrait); boss.abilities.forEach(ability); boss.loot?.forEach(item => add(item.icon)) }
  }
  Object.values(bundle.dungeons).forEach(journal)
  for (const raid of Object.values(bundle.raids)) Object.values(raid).forEach(entry => entry && journal(entry))
  for (const spell of Object.values(bundle.spells)) add(spell.icon)
  return [...icons].sort((a, b) => a - b)
}

/** A raid's journal at every difficulty the journal tags for it, each with the bosses' loot; lairs have no Raid Finder or Mythic */
export async function raidJournals(name: string, source: Pick<EncounterSource, 'journal' | 'loot'>): Promise<EncounterBundle['raids'][string] | null> {
  const probe = await source.journal(name, [], 'heroic')
  if (!probe) return null
  const tagged = new Set(probe.difficultyIds ?? [])
  const offered = raidDifficulties.filter(difficulty => journalDifficultyIds[difficulty].some(id => tagged.has(id)))
  const loot = await source.loot(probe.bosses.map(boss => boss.encounterId))
  const entry: EncounterBundle['raids'][string] = {}
  for (const difficulty of offered.length ? offered : (['normal', 'heroic', 'mythic'] as const)) {
    const journal = difficulty === 'heroic' ? probe : await source.journal(name, [], difficulty)
    if (journal) entry[difficulty] = withLoot(journal, loot)
  }
  return entry
}

/**
 * Copies every wanted icon not yet in public/assets/icons from the game files, then lists the folder in icons.json: the
 * pages load a bundled icon only when it is listed there, so a missing file never replaces the game's own
 */
export async function saveIcons(icon: (id: number) => Promise<string>, wanted: number[]): Promise<number> {
  const icons = resolve(root, 'public/assets/icons')
  await mkdir(icons, { recursive: true })
  let saved = 0
  for (const id of wanted) {
    const target = resolve(icons, `${id}.png`)
    try { await access(target); continue } catch { /* not bundled yet */ }
    try { await copyFile(await icon(id), target); saved++ } catch (error) { console.log(`icon ${id} unavailable (${(error as Error).message})`) }
  }
  const listed = (await readdir(icons)).map(name => Number(name.match(/^(\d+)\.png$/)?.[1])).filter(id => id > 0).sort((a, b) => a - b)
  const folder = resolve(root, 'data/dungeons/encounters')
  await mkdir(folder, { recursive: true })
  await writeFile(resolve(folder, 'icons.json'), `${JSON.stringify(listed)}\n`)
  return saved
}

export async function buildEncounters(season: DungeonBundle, source: EncounterSource, now = new Date()): Promise<EncounterBundle> {
  const log = source.log ?? (() => {})
  const dungeons: EncounterBundle['dungeons'] = {}
  for (const dungeon of season.dungeons) {
    const journal = await source.journal(dungeon.name, dungeon.routes?.encounterIds ?? [], 'mythicPlus')
    if (!journal) { log(`${dungeon.name}: not in the Encounter Journal`); continue }
    const loot = await source.loot(journal.bosses.map(boss => boss.encounterId))
    dungeons[dungeon.slug] = withLoot(journal, loot)
    log(`${dungeon.name}: ${journal.bosses.length} bosses, ${Object.values(loot).flat().length} items`)
  }
  const raids: EncounterBundle['raids'] = {}
  for (const raid of season.raids ?? []) {
    const entry = await raidJournals(raid.name, source)
    if (!entry) { log(`${raid.name}: not in the Encounter Journal`); continue }
    raids[raid.slug] = entry
    const first = Object.values(entry)[0]
    log(`${raid.name}: ${first?.bosses.length ?? 0} bosses on ${Object.keys(entry).join(', ')}, ${first?.bosses.flatMap(boss => boss.loot ?? []).length ?? 0} items`)
  }
  const spellIds = [...new Set(season.dungeons.flatMap(dungeon => dungeon.enemies?.enemies.flatMap(enemy => enemy.spells?.map(spell => spell.id) ?? []) ?? []))]
  const spells = await source.spells(spellIds)
  log(`${Object.keys(spells).length} of ${spellIds.length} enemy spells`)
  return { season: season.season.slug, gameBuild: source.build, generatedAt: now.toISOString(), dungeons, raids, spells }
}

/** The newest season bundle saved by scripts/dungeon-data.ts */
async function savedSeason(): Promise<DungeonBundle> {
  const folder = resolve(root, 'data/dungeons')
  const files = (await readdir(folder)).filter(name => /^season-[\w-]+\.json$/.test(name))
  const bundles = await Promise.all(files.map(async name => JSON.parse(await readFile(resolve(folder, name), 'utf8')) as DungeonBundle))
  const newest = bundles.sort((a, b) => b.generatedAt.localeCompare(a.generatedAt))[0]
  if (!newest) throw new Error('No season bundle; run npm run dungeon-data first')
  return newest
}

async function main() {
  // Loaded here so the tests can import the assembly without the game data engine's native modules
  const { GameDataEngine } = await import('../src/main/gamedata/engine')
  const { detectInstall } = await import('../src/main/gamedata/install')
  const at = process.argv.indexOf('--cache')
  const cache = at > 0 && process.argv[at + 1] ? resolve(process.argv[at + 1]!) : resolve(root, '.local/gamedata')
  const install = await detectInstall()
  if (!install) throw new Error('No World of Warcraft install found')
  const engine = new GameDataEngine(cache, { status: status => { if (status.progress) console.log(status.progress) } })
  try {
    await engine.useInstall(install)
    await engine.ensureIndex()
    const season = await savedSeason()
    const bundle = await buildEncounters(season, {
      build: engine.getStatus().indexedVersion ?? 'unknown',
      journal: (name, ids, difficulty) => engine.dungeonJournal(name, ids, difficulty),
      loot: ids => engine.encounterLoot(ids),
      spells: ids => engine.dungeonSpells(ids),
      log: line => console.log(line),
    })
    const wanted = bundleIcons(bundle)
    const saved = await saveIcons(id => engine.icon(id), wanted)
    const file = resolve(root, 'data/dungeons/encounters', `${bundle.season}.json`)
    await mkdir(dirname(file), { recursive: true })
    await writeFile(file, `${JSON.stringify(bundle)}\n`)
    console.log(`Saved encounters for ${bundle.season} from ${bundle.gameBuild} to ${file}, ${saved} new of ${wanted.length} icons`)
  } finally { await engine.close() }
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) await main()
