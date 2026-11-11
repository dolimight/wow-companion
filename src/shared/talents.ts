/** One choice on a talent node; a choice node has two, others one */
export type TalentEntry = { id: number; spellId: number; name: string; icon: number | null; maxRanks: number; subTreeId: number }
/** Where a node sits: the shared class tree, the specialization's own tree, or a hero tree */
export type TalentSection = 'class' | 'spec' | 'hero' | 'selection'
export type TalentNode = { id: number; x: number; y: number; type: number; section: TalentSection; subTreeId: number; entries: TalentEntry[]; granted: boolean; currency: number | null }
export type TalentSubTree = { id: number; name: string; description: string; icon: number | null }
/**
 * A specialization's talent tree from the installed game files. `order` lists every node of the class tree in ID
 * order, which is how export strings are laid out; `nodes` only holds the ones this specialization can see
 */
export type TalentTree = {
  treeId: number; specId: number; build: string; order: number[]; nodes: TalentNode[]; edges: Array<[number, number]>; subTrees: TalentSubTree[]
  /** Points each currency (class, specialization, each hero tree) gives at the level cap */
  caps: Record<number, number>
  /** Nodes that unlock once enough points of a currency are spent */
  gates: Array<{ currency: number; required: number; nodes: number[] }>
  /** Talent spells and the spells their descriptions borrow values from */
  spells: Record<number, import('./item-scaling').SpellData>
}

export type TalentPick = { nodeId: number; ranks: number; entryIndex: number | null; purchased: boolean }
export type DecodedLoadout = { version: number; specId: number; picks: TalentPick[] }

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'

/** Reads the game's export string bit by bit, least significant bit first, six bits per character */
function bitReader(text: string) {
  const values = [...text.trim()].map(char => { const value = alphabet.indexOf(char); if (value < 0) throw new Error('This isn’t a talent string from the game'); return value })
  let position = 0
  return {
    read(bits: number) {
      let result = 0
      for (let bit = 0; bit < bits; bit++) {
        const index = position >> 0, char = Math.floor(index / 6), offset = index % 6
        if (char >= values.length) throw new Error('This talent string is cut short')
        result += ((values[char]! >> offset) & 1) * 2 ** bit
        position++
      }
      return result
    },
  }
}

/**
 * Decodes a talent export string against its tree. Version 1 strings predate hero talents; version 2 adds whether a
 * selected node was bought or granted for free
 */
export function decodeLoadout(text: string, order: number[], maxRanks: (nodeId: number) => number): DecodedLoadout {
  const reader = bitReader(text)
  const version = reader.read(8)
  if (version !== 1 && version !== 2) throw new Error(`Talent strings of version ${version} aren’t supported yet`)
  const specId = reader.read(16)
  for (let index = 0; index < 16; index++) reader.read(8) // tree hash, zero in most exports
  const picks: TalentPick[] = []
  for (const nodeId of order) {
    if (!reader.read(1)) continue
    const purchased = version >= 2 ? !!reader.read(1) : true
    let ranks = maxRanks(nodeId), entryIndex: number | null = null
    if (purchased) {
      if (reader.read(1)) ranks = reader.read(6)
      if (reader.read(1)) entryIndex = reader.read(2)
    }
    picks.push({ nodeId, ranks, entryIndex, purchased })
  }
  return { version, specId, picks }
}
