import type { DecodedLoadout, TalentNode, TalentPick, TalentTree } from './talents'

/** A build being edited: one pick per node, keyed by node ID */
export type Build = Map<number, TalentPick>

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

export function buildFrom(tree: TalentTree, decoded: DecodedLoadout | null): Build {
  const build: Build = new Map((decoded?.picks ?? []).map(pick => [pick.nodeId, pick]))
  // Talents the specialization gets for free are always part of a build
  for (const node of tree.nodes) if (node.granted && !build.has(node.id)) build.set(node.id, { nodeId: node.id, ranks: node.entries[0]!.maxRanks, entryIndex: null, purchased: false })
  return build
}

const maxOf = (node: TalentNode, pick?: TalentPick) => node.entries[pick?.entryIndex ?? 0]?.maxRanks ?? node.entries[0]!.maxRanks
const nodesOf = (tree: TalentTree) => new Map(tree.nodes.map(node => [node.id, node]))

/** The hero tree the build has chosen, from its selection node */
export function chosenHero(tree: TalentTree, build: Build) {
  const selection = tree.nodes.find(node => node.section === 'selection')
  const pick = selection ? build.get(selection.id) : undefined
  return selection && pick ? selection.entries[pick.entryIndex ?? 0]?.subTreeId ?? null : null
}

/** Points bought in one currency; free talents don't count */
export function spent(tree: TalentTree, build: Build, currency: number | null) {
  if (currency == null) return 0
  const nodes = nodesOf(tree)
  let total = 0
  for (const pick of build.values()) { const node = nodes.get(pick.nodeId); if (node?.currency === currency && pick.purchased && node.section !== 'selection') total += pick.ranks }
  return total
}

const parentsOf = (tree: TalentTree, nodeId: number) => tree.edges.filter(([, to]) => to === nodeId).map(([from]) => from)

/** Why a talent can't take another rank right now, or null when it can */
export function blockReason(tree: TalentTree, build: Build, nodeId: number, entryIndex: number | null = null): string | null {
  const nodes = nodesOf(tree)
  const node = nodes.get(nodeId)
  if (!node) return 'This talent isn’t available to this specialization'
  const pick = build.get(nodeId)
  if (node.granted) return 'This specialization learns it automatically'
  if (node.section === 'hero' && chosenHero(tree, build) !== node.subTreeId) return 'Choose this hero tree first'
  const max = maxOf(node, entryIndex != null ? { ...pick!, entryIndex } : pick)
  if (pick && (entryIndex == null || entryIndex === pick.entryIndex) && pick.ranks >= max) return 'Already at its highest rank'
  const cap = node.currency != null ? tree.caps[node.currency] : undefined
  const changingChoice = pick && entryIndex != null && entryIndex !== pick.entryIndex
  if (cap != null && !changingChoice && spent(tree, build, node.currency) >= cap) return `All ${cap} points in this tree are spent`
  for (const gate of tree.gates) if (gate.nodes.includes(nodeId)) {
    const missing = gate.required - spent(tree, build, gate.currency)
    if (missing > 0) return `Spend ${missing} more point${missing === 1 ? '' : 's'} in this tree to unlock it`
  }
  const parents = parentsOf(tree, nodeId).filter(id => nodes.has(id))
  if (parents.length && !parents.some(id => { const parent = build.get(id); return parent && parent.ranks >= maxOf(nodes.get(id)!, parent) })) {
    const names = parents.map(id => nodes.get(id)!.entries.map(entry => entry.name).join(' or '))
    return `Needs ${names.length === 1 ? names[0] : `one of ${names.join(', ')}`} at full rank`
  }
  return null
}

/** Removes talents that lost their way in: no fully ranked parent, or a gate no longer met */
function prune(tree: TalentTree, build: Build) {
  const nodes = nodesOf(tree)
  for (let changed = true; changed;) {
    changed = false
    for (const [id, pick] of build) {
      const node = nodes.get(id)
      if (!node || !pick.purchased || node.section === 'selection') continue
      const parents = parentsOf(tree, id).filter(parent => nodes.has(parent))
      const reachable = !parents.length || parents.some(parent => { const p = build.get(parent); return p && p.ranks >= maxOf(nodes.get(parent)!, p) })
      const gated = tree.gates.some(gate => gate.nodes.includes(id) && spent(tree, build, gate.currency) - (node.currency === gate.currency ? pick.ranks : 0) < gate.required)
      if (!reachable || gated) { build.delete(id); changed = true }
    }
  }
  return build
}

/** Adds a rank, or picks a side of a choice node */
export function learn(tree: TalentTree, current: Build, nodeId: number, entryIndex: number | null = null): Build {
  if (blockReason(tree, current, nodeId, entryIndex)) return current
  const node = nodesOf(tree).get(nodeId)!
  const build = new Map(current)
  const pick = build.get(nodeId)
  const choice = node.entries.length > 1 ? entryIndex ?? pick?.entryIndex ?? 0 : null
  if (pick && choice !== pick.entryIndex) build.set(nodeId, { ...pick, entryIndex: choice, ranks: Math.min(pick.ranks, maxOf(node, { ...pick, entryIndex: choice })) })
  else build.set(nodeId, { nodeId, ranks: (pick?.ranks ?? 0) + 1, entryIndex: choice, purchased: true })
  return build
}

/** Takes a rank away, removing the talents that depended on it */
export function unlearn(tree: TalentTree, current: Build, nodeId: number): Build {
  const pick = current.get(nodeId)
  const node = nodesOf(tree).get(nodeId)
  if (!pick || !node || !pick.purchased || node.section === 'selection') return current
  const build = new Map(current)
  if (pick.ranks > 1) build.set(nodeId, { ...pick, ranks: pick.ranks - 1 }); else build.delete(nodeId)
  return prune(tree, build)
}

/** Switches hero trees. Each hero tree spends its own points, so the other tree's talents are kept, as in game */
export function chooseHeroTree(tree: TalentTree, current: Build, subTreeId: number): Build {
  const selection = tree.nodes.find(node => node.section === 'selection')
  if (!selection) return current
  const index = selection.entries.findIndex(entry => entry.subTreeId === subTreeId)
  if (index < 0) return current
  const build = new Map(current)
  build.set(selection.id, { nodeId: selection.id, ranks: 1, entryIndex: index, purchased: true })
  return build
}

/** Writes the build as a version 2 export string the game can import */
export function encodeLoadout(tree: TalentTree, build: Build): string {
  const nodes = nodesOf(tree)
  const bits: number[] = []
  const write = (value: number, size: number) => { for (let bit = 0; bit < size; bit++) bits.push(Math.floor(value / 2 ** bit) % 2) }
  write(2, 8); write(tree.specId, 16)
  for (let index = 0; index < 16; index++) write(0, 8)
  for (const id of tree.order) {
    const pick = build.get(id), node = nodes.get(id)
    if (!pick) { write(0, 1); continue }
    write(1, 1); write(pick.purchased ? 1 : 0, 1)
    if (!pick.purchased) continue
    const max = node ? maxOf(node, pick) : pick.ranks
    if (pick.ranks < max) { write(1, 1); write(pick.ranks, 6) } else write(0, 1)
    if (pick.entryIndex != null) { write(1, 1); write(pick.entryIndex, 2) } else write(0, 1)
  }
  while (bits.length % 6) bits.push(0)
  let text = ''
  for (let index = 0; index < bits.length; index += 6) text += alphabet[bits.slice(index, index + 6).reduce((sum, bit, offset) => sum + bit * 2 ** offset, 0)]
  return text
}
