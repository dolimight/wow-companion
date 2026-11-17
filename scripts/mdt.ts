// Reads trash spells from Mythic Dungeon Tools' dungeon files (GPL-2.0, github.com/Nnoggie/MythicDungeonTools)
// The Lua is parsed as text and never run
import { spellTags, type EnemySpellRef, type SpellTag } from '../src/shared/dungeons'

export const MDT_REPO = 'Nnoggie/MythicDungeonTools'

export type MdtEnemy = { npcId: number; displayId: number | null; spells: EnemySpellRef[]; stunnable: boolean }

/** Each enemy in a dungeon file's MDT.dungeonEnemies table, by NPC id */
export function parseMdtEnemies(lua: string): Map<number, MdtEnemy> {
  const text = lua.replace(/\r\n/g, '\n')
  const start = text.indexOf('MDT.dungeonEnemies[')
  const out = new Map<number, MdtEnemy>()
  if (start < 0) return out
  // Enemies are the table's direct entries, written two spaces in
  for (const chunk of text.slice(start).split(/\n {2}\[\d+\] = \{\n/).slice(1)) {
    const npcId = Number(chunk.match(/^ {4}\["id"\] = (\d+),/m)?.[1])
    if (!(npcId > 0)) continue
    const displayId = Number(chunk.match(/^ {4}\["displayId"\] = (\d+),/m)?.[1]) || null
    const characteristics = chunk.match(/^ {4}\["characteristics"\] = \{\n([\s\S]*?)\n {4}\},/m)?.[1] ?? ''
    const block = chunk.match(/^ {4}\["spells"\] = \{\n([\s\S]*?)\n {4}\},/m)?.[1] ?? ''
    // Spells sit six spaces in, and their flags, such as interruptible or magic, eight
    const spells: EnemySpellRef[] = []
    let flags = new Set<string>()
    const close = () => {
      const last = spells.at(-1)
      if (!last) return
      last.interrupt = flags.has('interruptible')
      const tags = spellTags.filter(tag => flags.has(tag)) as SpellTag[]
      if (tags.length) last.tags = tags
    }
    for (const line of block.split('\n')) {
      const id = line.match(/^ {6}\[(\d+)\] = \{/)?.[1]
      if (id) { close(); spells.push({ id: Number(id), interrupt: false }); flags = new Set(); continue }
      const flag = line.match(/^ {8}\["(\w+)"\] = true/)?.[1]
      if (flag) flags.add(flag)
    }
    close()
    const previous = out.get(npcId)
    out.set(npcId, { npcId, displayId: previous?.displayId ?? displayId, spells: previous?.spells.length ? previous.spells : spells, stunnable: /\["Stun"\] = true/.test(characteristics) })
  }
  return out
}

/** The MDT file for a Raider.IO dungeon slug, matched on letters only, such as kings-rest to KingsRest.lua */
export function mdtFileFor(slug: string, files: string[]) {
  const key = slug.replace(/[^a-z0-9]/gi, '').toLowerCase()
  return files.find(file => file.replace(/\.lua$/, '').replace(/[^a-z0-9]/gi, '').toLowerCase() === key) ?? null
}
