import { describe, expect, it } from 'vite-plus/test'
import { blockReason, buildFrom, chooseHeroTree, chosenHero, encodeLoadout, learn, spent, unlearn } from './talent-editor'
import { decodeLoadout, type TalentNode, type TalentTree } from './talents'

const node = (id: number, section: TalentNode['section'], extra: Partial<TalentNode> = {}): TalentNode => ({
  id, x: 0, y: 0, type: 0, section, subTreeId: 0, granted: false, currency: section === 'class' ? 1 : section === 'spec' ? 2 : section === 'hero' ? 3 : null,
  entries: [{ id: id * 10, spellId: 0, name: `Talent ${id}`, icon: null, maxRanks: 1, subTreeId: 0 }], ...extra,
})
// Class: 1 → 2 (two ranks) → 3, with 4 gated behind 3 points. Spec 10 is free. Hero trees 7 and 8 with one talent each
const tree: TalentTree = {
  treeId: 1, specId: 250, build: 'test', order: [1, 2, 3, 4, 5, 10, 20, 21, 30],
  nodes: [
    node(1, 'class'),
    node(2, 'class', { entries: [{ id: 20, spellId: 0, name: 'Talent 2', icon: null, maxRanks: 2, subTreeId: 0 }] }),
    node(3, 'class', { entries: [{ id: 30, spellId: 0, name: 'Left', icon: null, maxRanks: 1, subTreeId: 0 }, { id: 31, spellId: 0, name: 'Right', icon: null, maxRanks: 1, subTreeId: 0 }] }),
    node(4, 'class'),
    node(10, 'spec', { granted: true }),
    node(20, 'hero', { subTreeId: 7 }), node(21, 'hero', { subTreeId: 8 }),
    node(30, 'selection', { type: 3, entries: [{ id: 300, spellId: 0, name: 'Seven', icon: null, maxRanks: 1, subTreeId: 7 }, { id: 301, spellId: 0, name: 'Eight', icon: null, maxRanks: 1, subTreeId: 8 }] }),
  ],
  edges: [[1, 2], [2, 3]],
  subTrees: [{ id: 7, name: 'Seven', description: '', icon: null }, { id: 8, name: 'Eight', description: '', icon: null }],
  caps: { 1: 4, 2: 30, 3: 13 },
  gates: [{ currency: 1, required: 3, nodes: [4] }],
  spells: {},
}

describe('editing a talent build', () => {
  it('starts with free talents and follows the paths, ranks, and gates', () => {
    let build = buildFrom(tree, null)
    expect([...build.keys()]).toEqual([10])
    expect(blockReason(tree, build, 2)).toBe('Needs Talent 1 at full rank')
    build = learn(tree, build, 1)
    expect(blockReason(tree, build, 4)).toBe('Spend 2 more points in this tree to unlock it')
    build = learn(tree, build, 2)
    expect(blockReason(tree, build, 3)).toBe('Needs Talent 2 at full rank')
    build = learn(tree, build, 2)
    expect(build.get(2)?.ranks).toBe(2)
    expect(blockReason(tree, build, 4)).toBeNull()
    build = learn(tree, build, 3, 1)
    expect(build.get(3)).toMatchObject({ entryIndex: 1, ranks: 1 })
    expect(spent(tree, build, 1)).toBe(4)
    expect(blockReason(tree, build, 4)).toBe('All 4 points in this tree are spent')
    expect(blockReason(tree, build, 10)).toBe('This specialization learns it automatically')
  })
  it('switches the side of a choice without spending another point', () => {
    let build = [1, 2, 2].reduce((next, id) => learn(tree, next, id), buildFrom(tree, null))
    build = learn(tree, build, 3, 0)
    build = learn(tree, build, 3, 1)
    expect(build.get(3)).toMatchObject({ entryIndex: 1, ranks: 1 })
    expect(spent(tree, build, 1)).toBe(4)
  })
  it('drops talents that lose their parent or their gate when a rank is removed', () => {
    let build = [1, 2, 2].reduce((next, id) => learn(tree, next, id), buildFrom(tree, null))
    build = learn(tree, build, 3, 0)
    build = unlearn(tree, build, 2)
    expect(build.has(3)).toBe(false)
    expect(build.get(2)?.ranks).toBe(1)
    expect(unlearn(tree, build, 10).has(10)).toBe(true)
  })
  it('switches hero trees and keeps each tree’s talents for switching back', () => {
    let build = chooseHeroTree(tree, buildFrom(tree, null), 7)
    expect(chosenHero(tree, build)).toBe(7)
    expect(blockReason(tree, build, 21)).toBe('Choose this hero tree first')
    build = learn(tree, build, 20)
    build = chooseHeroTree(tree, build, 8)
    expect(chosenHero(tree, build)).toBe(8)
    expect(build.has(20)).toBe(true)
    expect(chosenHero(tree, chooseHeroTree(tree, build, 7))).toBe(7)
  })
  it('exports a string that reads back to the same build', () => {
    let build = [1, 2].reduce((next, id) => learn(tree, next, id), chooseHeroTree(tree, buildFrom(tree, null), 8))
    build = learn(tree, build, 21)
    const text = encodeLoadout(tree, build)
    const maxRanks = (id: number) => tree.nodes.find(entry => entry.id === id)!.entries[0]!.maxRanks
    const read = decodeLoadout(text, tree.order, maxRanks)
    expect(read.specId).toBe(250)
    expect(new Map(read.picks.map(pick => [pick.nodeId, pick]))).toEqual(build)
  })
})
