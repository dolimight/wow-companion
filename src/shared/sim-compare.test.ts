import { describe, expect, it } from 'vite-plus/test'
import { buildFrom, chooseHeroTree, encodeLoadout, learn } from './talent-editor'
import { talentDifferences } from './sim-compare'
import type { TalentNode, TalentTree } from './talents'

const node = (id: number, section: TalentNode['section'], extra: Partial<TalentNode> = {}): TalentNode => ({
  id, x: 0, y: 0, type: 0, section, subTreeId: 0, granted: false, currency: section === 'class' ? 1 : section === 'hero' ? 3 : null,
  entries: [{ id: id * 10, spellId: id * 100, name: `Talent ${id}`, icon: id, maxRanks: 1, subTreeId: 0 }], ...extra,
})
const tree: TalentTree = {
  treeId: 1, specId: 250, build: 'test', order: [1, 2, 3, 20, 21, 22, 30],
  nodes: [
    node(1, 'class'), node(2, 'class', { entries: [{ id: 20, spellId: 200, name: 'Two', icon: 2, maxRanks: 2, subTreeId: 0 }] }),
    node(3, 'class', { entries: [{ id: 30, spellId: 300, name: 'Left', icon: 3, maxRanks: 1, subTreeId: 0 }, { id: 31, spellId: 310, name: 'Right', icon: 4, maxRanks: 1, subTreeId: 0 }] }),
    node(20, 'hero', { subTreeId: 7 }), node(22, 'hero', { subTreeId: 7 }), node(21, 'hero', { subTreeId: 8 }),
    node(30, 'selection', { type: 3, entries: [{ id: 300, spellId: 0, name: 'Seven', icon: null, maxRanks: 1, subTreeId: 7 }, { id: 301, spellId: 0, name: 'Eight', icon: null, maxRanks: 1, subTreeId: 8 }] }),
  ],
  edges: [], subTrees: [{ id: 7, name: 'Seven', description: '', icon: null }, { id: 8, name: 'Eight', description: '', icon: null }],
  caps: { 1: 10, 3: 10 }, gates: [], spells: {},
}
const make = (steps: Array<[number, number?]>, hero = 7) => encodeLoadout(tree, steps.reduce((build, [id, entry]) => learn(tree, build, id, entry ?? null), chooseHeroTree(tree, buildFrom(tree, null), hero)))

describe('talent differences between two builds', () => {
  it('lists each side of a choice, rank gaps, and talents only one build takes', () => {
    const result = talentDifferences(tree, make([[1], [2], [3, 0], [20]]), make([[2], [2], [3, 1], [20], [22]]))!
    expect(result.onlyMine.map(entry => `${entry.name} ${entry.ranks}/${entry.maxRanks}`)).toEqual(['Talent 1 1/1', 'Two 1/2', 'Left 1/1'])
    expect(result.onlyTheirs.map(entry => `${entry.name} ${entry.ranks}/${entry.maxRanks}`)).toEqual(['Two 2/2', 'Right 1/1', 'Talent 22 1/1'])
    expect(result.shared).toBe(1)
    expect(result.hero).toEqual({ mine: 'Seven', theirs: 'Seven' })
  })
  it('names the hero trees instead of listing every hero talent when they differ', () => {
    const result = talentDifferences(tree, make([[20]], 7), make([[21]], 8))!
    expect(result.hero).toEqual({ mine: 'Seven', theirs: 'Eight' })
    expect([...result.onlyMine, ...result.onlyTheirs].some(entry => entry.section === 'hero')).toBe(false)
  })
  it('gives nothing when a build is missing or unreadable', () => {
    expect(talentDifferences(tree, null, make([]))).toBeNull()
    expect(talentDifferences(tree, 'not a build', make([]))).toBeNull()
  })
})
