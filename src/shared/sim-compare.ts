import { buildFrom, chosenHero } from './talent-editor'
import { decodeLoadout, type TalentNode, type TalentTree } from './talents'

export type TalentChoice = { nodeId: number; section: TalentNode['section']; name: string; icon: number | null; spellId: number; ranks: number; maxRanks: number }
export type TalentDifferences = {
  /** The hero tree each build takes, by name; equal names mean both picked the same tree */
  hero: { mine: string | null; theirs: string | null }
  onlyMine: TalentChoice[]
  onlyTheirs: TalentChoice[]
  /** Talents both builds take; free ones are left out */
  shared: number
}

function read(tree: TalentTree, loadout: string | null) {
  if (!loadout) return null
  const nodes = new Map(tree.nodes.map(node => [node.id, node]))
  try { return buildFrom(tree, decodeLoadout(loadout, tree.order, id => nodes.get(id)?.entries[0]?.maxRanks ?? 1)) } catch { return null }
}

/**
 * The talents two builds disagree on. A choice node taken on different sides counts as a difference on each side,
 * and a talent taken at different ranks shows each side's ranks. When the hero trees differ, only the tree is named,
 * since every hero talent would differ
 */
export function talentDifferences(tree: TalentTree, mine: string | null, theirs: string | null): TalentDifferences | null {
  const a = read(tree, mine), b = read(tree, theirs)
  if (!a || !b) return null
  const heroName = (build: NonNullable<typeof a>) => { const id = chosenHero(tree, build); return tree.subTrees.find(entry => entry.id === id)?.name ?? null }
  const heroA = chosenHero(tree, a), heroB = chosenHero(tree, b)
  const onlyMine: TalentChoice[] = [], onlyTheirs: TalentChoice[] = []
  let shared = 0
  const choice = (node: TalentNode, pick: { ranks: number; entryIndex: number | null }): TalentChoice => {
    const entry = node.entries[pick.entryIndex ?? 0] ?? node.entries[0]!
    return { nodeId: node.id, section: node.section, name: entry.name, icon: entry.icon, spellId: entry.spellId, ranks: pick.ranks, maxRanks: entry.maxRanks }
  }
  for (const node of tree.nodes) {
    if (node.section === 'selection' || node.granted) continue
    if (node.section === 'hero' && (heroA !== heroB || node.subTreeId !== heroA)) continue
    const x = a.get(node.id), y = b.get(node.id)
    if (x && y && (x.entryIndex ?? 0) === (y.entryIndex ?? 0) && x.ranks === y.ranks) { shared++; continue }
    if (x) onlyMine.push(choice(node, x))
    if (y) onlyTheirs.push(choice(node, y))
  }
  return { hero: { mine: heroName(a), theirs: heroName(b) }, onlyMine, onlyTheirs, shared }
}
