import type { TalentEntry, TalentNode, TalentSection, TalentTree } from '../../shared/talents'
import type { SpellData } from '../../shared/item-scaling'
import type { Row } from './wdc'

type Tables = (name: string) => Promise<Map<number, Row>>
const num = (value: unknown) => Number(value ?? 0)

/** Every specialization with its class and icon, for pickers */
export async function specializationRows(table: Tables) {
  return [...(await table('ChrSpecialization')).values()]
    .filter(row => num(row.ClassID) > 0 && num(row.ClassID) <= 13)
    .map(row => ({ id: num(row.ID), classId: num(row.ClassID), name: String(row.Name_lang ?? ''), icon: num(row.SpellIconFileID) || null, role: num(row.Role), order: num(row.OrderIndex) }))
}

/**
 * Builds one specialization's talent tree. Visibility comes from TraitCond rows of type 1 tied to spec sets, either
 * on a node's groups or on the node itself; a node with none is shared by the whole class. Granted (type 2) rows
 * mark nodes the specialization gets for free. Hero nodes belong to a TraitSubTree; the tree's selection node lists
 * which of them this specialization can choose
 */
export async function buildTalentTree(table: Tables, specId: number, build: string, maxLevel = 90): Promise<TalentTree | null> {
  const loadout = [...(await table('TraitTreeLoadout')).values()].find(row => num(row.ChrSpecializationID) === specId)
  if (!loadout) return null
  const treeId = num(loadout.TraitTreeID)
  const allNodes = [...(await table('TraitNode')).values()].filter(row => num(row.TraitTreeID) === treeId)
  const [links, entries, definitions, conds, setRows, groupNodes, groupConds, nodeConds, entryConds, edges, subTrees, spellNames, spellMisc, groupCosts, costs, currencySources] = await Promise.all([
    table('TraitNodeXTraitNodeEntry'), table('TraitNodeEntry'), table('TraitDefinition'), table('TraitCond'), table('SpecSetMember'),
    table('TraitNodeGroupXTraitNode'), table('TraitNodeGroupXTraitCond'), table('TraitNodeXTraitCond'), table('TraitNodeEntryXTraitCond').catch(() => new Map<number, Row>()),
    table('TraitEdge'), table('TraitSubTree'), table('SpellName'), table('SpellMisc'),
    table('TraitNodeGroupXTraitCost'), table('TraitCost'), table('TraitCurrencySource').catch(() => new Map<number, Row>()),
  ])
  const sets = new Map<number, Set<number>>()
  for (const row of setRows.values()) { const set = sets.get(num(row.SpecSet)) ?? new Set(); set.add(num(row.ChrSpecializationID)); sets.set(num(row.SpecSet), set) }
  const ids = new Set(allNodes.map(node => num(node.ID)))
  const groupsOf = new Map<number, number[]>()
  for (const row of groupNodes.values()) if (ids.has(num(row.TraitNodeID))) groupsOf.set(num(row.TraitNodeID), [...(groupsOf.get(num(row.TraitNodeID)) ?? []), num(row.TraitNodeGroupID)])
  const condsOfGroup = new Map<number, Row[]>()
  for (const row of groupConds.values()) { const cond = conds.get(num(row.TraitCondID)); if (cond) condsOfGroup.set(num(row.TraitNodeGroupID), [...(condsOfGroup.get(num(row.TraitNodeGroupID)) ?? []), cond]) }
  const condsOfNode = new Map<number, Row[]>()
  for (const row of nodeConds.values()) { const cond = conds.get(num(row.TraitCondID)); if (cond && ids.has(num(row.TraitNodeID))) condsOfNode.set(num(row.TraitNodeID), [...(condsOfNode.get(num(row.TraitNodeID)) ?? []), cond]) }
  const condsOfEntry = new Map<number, Row[]>()
  for (const row of entryConds.values()) { const cond = conds.get(num(row.TraitCondID)); if (cond) condsOfEntry.set(num(row.TraitNodeEntryID), [...(condsOfEntry.get(num(row.TraitNodeEntryID)) ?? []), cond]) }
  const forSpec = (cond: Row) => !!sets.get(num(cond.SpecSetID))?.has(specId)
  const allows = (list: Row[]) => { const gated = list.filter(cond => num(cond.CondType) === 1 && num(cond.SpecSetID)); return !gated.length || gated.some(forSpec) }
  const condsFor = (nodeId: number) => [...(groupsOf.get(nodeId) ?? []).flatMap(group => condsOfGroup.get(group) ?? []), ...(condsOfNode.get(nodeId) ?? [])]

  const iconOf = new Map<number, number>()
  for (const row of spellMisc.values()) if (!num(row.DifficultyID) && num(row.SpellIconFileDataID) && !iconOf.has(num(row.SpellID))) iconOf.set(num(row.SpellID), num(row.SpellIconFileDataID))
  const entriesOf = new Map<number, Array<{ index: number; entry: Row }>>()
  for (const row of links.values()) { const entry = entries.get(num(row.TraitNodeEntryID)); if (entry && ids.has(num(row.TraitNodeID))) entriesOf.set(num(row.TraitNodeID), [...(entriesOf.get(num(row.TraitNodeID)) ?? []), { index: num(row.Index), entry }]) }
  const subTreeRows = [...subTrees.values()].filter(row => num(row.TraitTreeID) === treeId)

  const entry = (row: Row): TalentEntry | null => {
    if (!allows(condsOfEntry.get(num(row.ID)) ?? [])) return null
    const definition = definitions.get(num(row.TraitDefinitionID))
    const spellId = num(definition?.SpellID)
    const sub = num(row.TraitSubTreeID)
    const subTree = sub ? subTreeRows.find(tree => num(tree.ID) === sub) : undefined
    const name = String(definition?.OverrideName_lang || '') || String(spellNames.get(spellId)?.Name_lang ?? '') || String(subTree?.Name_lang ?? '')
    const icon = num(definition?.OverrideIcon) || iconOf.get(spellId) || null
    return { id: num(row.ID), spellId, name, icon, maxRanks: Math.max(1, num(row.MaxRanks)), subTreeId: sub }
  }

  // Which currency each node group spends, and how many points of it a max-level character has
  const currencyOfGroup = new Map<number, number>()
  for (const row of groupCosts.values()) { const cost = costs.get(num(row.TraitCostID)); if (cost) currencyOfGroup.set(num(row.TraitNodeGroupID), num(cost.TraitCurrencyID)) }
  const visible = allNodes.filter(node => allows(condsFor(num(node.ID))))
  const selection = visible.filter(node => num(node.Type) === 3)
  const heroIds = new Set(selection.flatMap(node => (entriesOf.get(num(node.ID)) ?? []).map(({ entry: row }) => num(row.TraitSubTreeID))))
  const nodes: TalentNode[] = visible.flatMap(node => {
    const id = num(node.ID), sub = num(node.TraitSubTreeID), conditions = condsFor(id)
    if (sub && !heroIds.has(sub)) return []
    const list = (entriesOf.get(id) ?? []).sort((a, b) => a.index - b.index).map(({ entry: row }) => entry(row)).filter((value): value is TalentEntry => !!value)
    if (!list.length) return []
    // Nodes every specialization sees make up the class tree; the rest are this specialization's own
    const section: TalentSection = num(node.Type) === 3 ? 'selection' : sub ? 'hero' : conditions.some(cond => num(cond.CondType) === 1 && num(cond.SpecSetID)) ? 'spec' : 'class'
    const granted = conditions.some(cond => num(cond.CondType) === 2 && (!num(cond.SpecSetID) || forSpec(cond)))
    const currency = (groupsOf.get(id) ?? []).map(group => currencyOfGroup.get(group)).find(value => value != null) ?? null
    return [{ id, x: num(node.PosX), y: num(node.PosY), type: num(node.Type), section, subTreeId: sub, entries: list, granted, currency }]
  })
  const kept = new Set(nodes.map(node => node.id))
  const used = new Set(nodes.flatMap(node => node.currency != null ? [node.currency] : []))
  const caps: Record<number, number> = {}
  for (const row of currencySources.values()) {
    const currency = num(row.TraitCurrencyID)
    if (used.has(currency) && num(row.PlayerLevel) <= maxLevel && !num(row.QuestID) && !num(row.AchievementID)) caps[currency] = (caps[currency] ?? 0) + num(row.Amount)
  }
  // Gates: a node group opens once this many points of a currency are spent
  const gates: TalentTree['gates'] = []
  for (const [group, list] of condsOfGroup) {
    for (const cond of list) {
      if (num(cond.CondType) !== 0 || !num(cond.SpentAmountRequired) || (num(cond.SpecSetID) && !forSpec(cond))) continue
      const members = [...groupNodes.values()].filter(row => num(row.TraitNodeGroupID) === group && kept.has(num(row.TraitNodeID))).map(row => num(row.TraitNodeID))
      if (members.length) gates.push({ currency: num(cond.TraitCurrencyID), required: num(cond.SpentAmountRequired), nodes: members })
    }
  }
  const spells = await talentSpells(table, nodes.flatMap(node => node.entries.map(entry => entry.spellId)).filter(Boolean))
  const edgeList = [...edges.values()].filter(row => kept.has(num(row.LeftTraitNodeID)) && kept.has(num(row.RightTraitNodeID))).map(row => [num(row.LeftTraitNodeID), num(row.RightTraitNodeID)] as [number, number])
  // Hero tree icons come from the selection node's entry for that tree
  const heroIcon = (sub: number) => selection.flatMap(node => (entriesOf.get(num(node.ID)) ?? []).map(({ entry: row }) => row)).map(row => num(row.TraitSubTreeID) === sub ? num(definitions.get(num(row.TraitDefinitionID))?.OverrideIcon) : 0).find(Boolean) || null
  return {
    treeId, specId, build,
    order: allNodes.map(node => num(node.ID)).sort((a, b) => a - b),
    nodes, edges: edgeList, caps, gates, spells,
    subTrees: subTreeRows.filter(row => heroIds.has(num(row.ID))).map(row => {
      // Without an icon of its own, a hero tree shows its top talent's
      const top = nodes.filter(node => node.subTreeId === num(row.ID)).sort((a, b) => a.y - b.y || a.x - b.x)[0]
      return { id: num(row.ID), name: String(row.Name_lang ?? ''), description: String(row.Description_lang ?? ''), icon: heroIcon(num(row.ID)) ?? top?.entries[0]?.icon ?? null }
    }),
  }
}

/** Talent spells with what their descriptions need: text, effect values, durations, and stacks, two references deep */
export async function talentSpells(table: Tables, ids: number[]): Promise<Record<number, SpellData>> {
  const [names, texts, effects, misc, durations, auras] = await Promise.all([table('SpellName'), table('Spell'), table('SpellEffect'), table('SpellMisc'), table('SpellDuration'), table('SpellAuraOptions')])
  const wanted = new Set(ids)
  let frontier = [...wanted]
  for (let depth = 0; depth < 2 && frontier.length; depth++) {
    const next: number[] = []
    for (const id of frontier) for (const match of String(texts.get(id)?.Description_lang ?? '').matchAll(/\$(?:@spelldesc)?(\d{3,})/g)) { const ref = Number(match[1]); if (!wanted.has(ref)) { wanted.add(ref); next.push(ref) } }
    frontier = next
  }
  const spells: Record<number, SpellData> = {}
  for (const id of wanted) { const name = names.get(id); if (name) spells[id] = { id, name: String(name.Name_lang ?? ''), description: String(texts.get(id)?.Description_lang ?? ''), durationMs: null, maxStacks: null, effects: [] } }
  for (const row of effects.values()) { const spell = spells[num(row.SpellID)]; if (spell && !num(row.DifficultyID)) spell.effects.push({ index: num(row.EffectIndex), coefficient: num(row.Coefficient), scalingClass: num(row.ScalingClass), basePoints: num(row.EffectBasePointsF), periodMs: num(row.EffectAuraPeriod) }) }
  for (const row of misc.values()) { const spell = spells[num(row.SpellID)]; const duration = durations.get(num(row.DurationIndex)); if (spell && !num(row.DifficultyID) && duration && num(duration.Duration) > 0) spell.durationMs = num(duration.Duration) }
  for (const row of auras.values()) { const spell = spells[num(row.SpellID)]; if (spell && !num(row.DifficultyID) && num(row.CumulativeAura) > 0) spell.maxStacks = num(row.CumulativeAura) }
  return spells
}
