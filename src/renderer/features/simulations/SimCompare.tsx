import { useMemo, useState, type ReactNode } from 'react'
import { useQueries, useQuery } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Equal, Gem, Layers, Sparkles, Swords, Trophy, WandSparkles } from 'lucide-react'
import type { Character, GearItem, GearSlot } from '../../../shared/domain'
import type { SimulationJob } from '../../../shared/simulation'
import { compareSimulationValues } from '../../../shared/simulation'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { topRegionNames, topSlotGroups, type TopCount, type TopPlayers, type TopRegion } from '../../../shared/top-players'
import { embellishmentOf } from '../../../shared/item-enhancements'
import { itemLinkVariant } from '../../../shared/item-link'
import { talentDifferences, type TalentChoice } from '../../../shared/sim-compare'
import type { TalentTree } from '../../../shared/talents'
import { api } from '../../lib/client'
import { iconUrl } from '../../lib/assets'
import { GearSlotIcon } from '../../components/GearSlotIcon'
import { Popover, PopoverContent, PopoverTrigger } from '../../components/ui/popover'
import { ItemIcon, useGameData } from '../items/items'
import { Card } from '../../components/ui/card'
import { Badge } from '../../components/ui/primitives'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { talentDescription } from '../plan/PlanTalents'
import './sim-compare.css'
import { LatticeLoader } from '../../components/motion/LatticeLoader'

type Result = NonNullable<SimulationJob['result']>
type Variant = SimulationJob['request']['baseline']['items'][number]
const ORDER: GearSlot[] = ['head', 'neck', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'finger1', 'finger2', 'trinket1', 'trinket2', 'mainHand', 'offHand']
const ENCHANTABLE = new Set<GearSlot>(['head', 'shoulder', 'back', 'chest', 'wrist', 'legs', 'feet', 'finger1', 'finger2', 'mainHand', 'offHand'])
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
/** Enchant names from the game, from Raider.IO, and on enchanting recipes differ in prefix, so they are compared by their core */
const core = (name: string | null | undefined) => (name ?? '').toLowerCase().replace(/^enchant (\w+ )+- /, '').replace(/\s*\(.*\)$/, '').replace(/[^a-z0-9 ]/g, '').trim()
const sameEnchant = (a: string | null | undefined, b: string | null | undefined) => !!core(a) && !!core(b) && (core(a) === core(b) || core(a).includes(core(b)) || core(b).includes(core(a)))
/** Gems from the item's own fields, else from its item link, which is all an imported baseline may carry */
const gemIdsOf = (item: Pick<GearItem, 'gemIds' | 'gems' | 'itemLink'> | undefined) => {
  if (!item) return []
  const own = item.gemIds?.filter(id => id > 0) ?? item.gems.flatMap(gem => { const match = gem.match(/^Gem #(\d+)$/); return match ? [Number(match[1])] : [] })
  return own.length ? own : (itemLinkVariant(item.itemLink).gemIds ?? []).filter(id => id > 0)
}
const enchantIdOf = (item: Pick<GearItem, 'enchantId' | 'itemLink'> | undefined) => item ? item.enchantId || itemLinkVariant(item.itemLink).enchantId || null : null
const toneOf = (tone: 'up' | 'down' | undefined) => tone === 'up' ? 'green' as const : tone === 'down' ? 'amber' as const : 'neutral' as const
const regionOf = (population: string): TopRegion => (Object.entries(topRegionNames).find(([, name]) => population.includes(name))?.[0] as TopRegion | undefined) ?? 'us'

type Row = {
  slot: GearSlot
  mine: Variant | undefined
  top: { id: number; name: string; level: number | null; share: TopCount | undefined; enchant: TopCount | undefined; gems: number[]; embellishment: string | null } | null
  /** Who wins the slot: measured from each item simulated alone when the run has them, else read from item level */
  verdict: { winner: 'mine' | 'theirs' | 'even' | null; text: string; detail: string | null; measured: boolean }
  embellishment: string | null
  enchant: string | null
  gain: { difference: number; verdict: string } | null
  notes: Array<{ text: string; tone?: 'up' | 'down'; icon: ReactNode }>
}

/**
 * Why a plan (or your current gear) beats or trails top players: each slot side by side with item level, enchant,
 * gems, and embellishment, then the talent choices that differ, with the reasons gathered at the top
 */
export function SimCompare({ character, job, result }: { character: Character; job: SimulationJob; result: Result }) {
  const request = job.request
  const plan = request.plan, benchmark = request.benchmark
  const status = useGameData()
  const ready = status.data?.state === 'ready'
  const specId = character.specId
  const population = plan?.top?.population ?? benchmark?.population ?? ''
  const cap = plan?.top?.cap ?? benchmark?.cap ?? null
  const top = useQuery({ queryKey: ['top-players', specId, regionOf(population)], queryFn: () => api.topPlayers({ specId: specId!, specName: character.specName, className: character.className, region: regionOf(population) }), enabled: !!specId, staleTime: 30 * 60_000, retry: false })
  const tree = useQuery({ queryKey: ['talent-tree', specId], queryFn: () => api.talentTree(specId!), enabled: !!specId && !!status.data?.install, staleTime: Infinity })
  const rules = useQuery({ queryKey: ['embellishment-rules'], queryFn: () => api.embellishmentRules(), staleTime: Infinity })

  // What was simulated: the plan's items over the gear you wore then, and the top players' items in their own run
  const baseline = new Map(request.baseline.items.map(item => [item.slot, item]))
  const planned = plan ? request.candidates[plan.whole ?? 0] ?? [] : []
  const mine = new Map([...baseline, ...planned.map(item => [item.slot, item] as const)])
  const topIndex = plan?.top?.index ?? (benchmark ? benchmark.kinds.indexOf('gear') : -1)
  const topRun = topIndex >= 0 ? new Map((request.candidates[topIndex] ?? []).map(item => [item.slot, item])) : new Map<GearSlot, Variant>()
  // Rings and trinkets are a pair: when both sides wear the same item in opposite slots, line them up so it reads as a match
  const theirSlot = new Map<GearSlot, GearSlot>()
  for (const [a, b] of [['finger1', 'finger2'], ['trinket1', 'trinket2']] as Array<[GearSlot, GearSlot]>) {
    const id = (slot: GearSlot, side: 'mine' | 'theirs') => (side === 'mine' ? mine.get(slot) : topRun.get(slot) ?? mine.get(slot))?.itemId ?? null
    const crossed = (id(a, 'mine') !== null && id(a, 'mine') === id(b, 'theirs') && id(a, 'mine') !== id(a, 'theirs')) || (id(b, 'mine') !== null && id(b, 'mine') === id(a, 'theirs') && id(b, 'mine') !== id(b, 'theirs'))
    if (crossed) { theirSlot.set(a, b); theirSlot.set(b, a) }
  }
  const theirs = (slot: GearSlot) => theirSlot.get(slot) ?? slot

  const ids = useMemo(() => {
    const all = [...mine.values(), ...topRun.values()].flatMap(item => [item.itemId ?? 0, ...gemIdsOf(item)])
    for (const slot of Object.values(top.data?.slots ?? {})) for (const gem of slot?.gems.slice(0, 2) ?? []) all.push(gem.id)
    return [...new Set(all.filter(id => id > 0))].sort((a, b) => a - b).slice(0, 200)
  }, [job.id, top.data]) // eslint-disable-line react-hooks/exhaustive-deps
  const items = useQuery({ queryKey: ['items', ids], queryFn: () => api.getItems(ids), enabled: ready && ids.length > 0 })
  const itemMap = new Map((items.data ?? []).map(item => [item.id, item]))
  const enchantIds = [...new Set([...mine.values()].flatMap(item => { const id = enchantIdOf(item); return id ? [id] : [] }))].sort((a, b) => a - b)
  const enchantNames = useQuery({ queryKey: ['enchant-names', enchantIds], queryFn: () => api.enchantNames(enchantIds), enabled: ready && enchantIds.length > 0 })
  const enchantOptions = useQueries({ queries: [...ENCHANTABLE].map(slot => ({ queryKey: ['enhancements', 'enchant', slot], queryFn: () => api.enhancements({ kind: 'enchant', slot }), enabled: ready, staleTime: Infinity })) })
  const enchantIcon = (name: string | null | undefined) => {
    if (!name) return null
    for (const query of enchantOptions) for (const option of query.data ?? []) if (sameEnchant(option.name, name)) return option
    return null
  }

  const baselineValue = result.values[0]
  type Value = Result['values'][number]
  const singles = new Map<string, { difference: number; verdict: string; value: Value }>()
  const topSingleIndex = new Map((plan?.top?.singles ?? []).map(entry => [entry.index, entry.slot]))
  const topSingles = new Map<string, Value>()
  if (plan && baselineValue) result.values.slice(1).forEach((value, index) => {
    if (index === plan.whole || index === plan.top?.index) return
    const topSlot = topSingleIndex.get(index)
    if (topSlot) { topSingles.set(topSlot, value); return }
    const label = request.candidateLabels[index] ?? ''
    const slot = (Object.entries(gearSlotLabels) as Array<[GearSlot, string]>).find(([, name]) => label.startsWith(`${name}:`))?.[0]
    if (slot) { const comparison = compareSimulationValues(baselineValue, value); singles.set(slot, { difference: comparison.difference, verdict: comparison.verdict, value }) }
  })

  const data: TopPlayers | undefined = top.data
  const measured = !!plan?.top?.singles?.length && !!baselineValue
  // Each side alone against the same reference: your planned item (or what you wear) and their item (or yours, when they match you)
  function verdictFor(slot: GearSlot, item: Variant | undefined, topRow: Row['top'], gap: number): Row['verdict'] {
    const sameItem = !!item?.itemId && topRow?.id === item.itemId
    if (measured && baselineValue) {
      const mineValue = singles.get(slot)?.value ?? baselineValue, theirsValue = topSingles.get(theirs(slot)) ?? baselineValue
      if (mineValue === baselineValue && theirsValue === baselineValue) return { winner: 'even', text: 'Same as theirs', detail: null, measured: true }
      const comparison = compareSimulationValues(theirsValue, mineValue)
      const detail = `Yours alone ${signed(mineValue.mean - baselineValue.mean)} · theirs alone ${signed(theirsValue.mean - baselineValue.mean)} DPS`
      if (comparison.verdict === 'higher') return { winner: 'mine', text: `Yours by ${Math.round(comparison.difference).toLocaleString()} DPS`, detail, measured: true }
      if (comparison.verdict === 'lower') return { winner: 'theirs', text: `Theirs by ${Math.round(-comparison.difference).toLocaleString()} DPS`, detail, measured: true }
      if (comparison.verdict === 'sidegrade') return { winner: 'even', text: 'Even within the uncertainty', detail, measured: true }
      return { winner: null, text: 'Not measurable', detail, measured: true }
    }
    // Runs from before each item was simulated alone fall back to item level
    if (sameItem && gap === 0) return { winner: 'even', text: 'Same item and level', detail: null, measured: false }
    if (gap > 0) return { winner: 'theirs', text: `Theirs by ${gap} item levels`, detail: null, measured: false }
    if (gap < 0) return { winner: 'mine', text: `Yours by ${-gap} item levels`, detail: null, measured: false }
    return { winner: null, text: 'Different item, same level', detail: null, measured: false }
  }
  const rows: Row[] = ORDER.flatMap(slot => {
    const item = mine.get(slot)
    const group = topSlotGroups.find(entry => entry.slots.includes(slot))
    const tally = group ? data?.slots[group.group] : undefined
    const run = topRun.get(theirs(slot)) ?? (theirSlot.has(slot) ? mine.get(theirs(slot)) : undefined)
    if (!item && !run) return []
    const topItem = run ?? item
    const share = topItem ? tally?.items.find(entry => entry.id === topItem.itemId) : undefined
    const topEmbellishment = share?.copy?.bonusIds ? embellishmentOf(rules.data ?? null, share.copy.bonusIds)?.name ?? null : null
    const myEmbellishment = item ? (item.embellishment?.name ?? embellishmentOf(rules.data ?? null, item.bonusIds)?.name ?? null) : null
    const enchantId = enchantIdOf(item)
    const enchant = enchantId ? enchantNames.data?.[enchantId] ?? item?.enchant ?? `Enchant #${enchantId}` : item?.enchant ?? null
    const topRow: Row['top'] = topItem?.itemId ? { id: topItem.itemId, name: itemMap.get(topItem.itemId)?.name ?? topItem.name, level: topItem.itemLevel, share, enchant: tally?.enchants[0], gems: share?.gems ?? (tally?.gems[0] ? [tally.gems[0].id] : []), embellishment: topEmbellishment } : null
    const notes: Row['notes'] = []
    const gap = topRow?.level != null && item?.itemLevel != null ? Math.round(topRow.level - item.itemLevel) : 0
    if (item?.itemId && topRow && topRow.id !== item.itemId) notes.push({ text: 'Different item', icon: <Swords size={12} /> })
    // Without measured results the verdict already states the level gap
    if (measured && gap > 0) notes.push({ text: `They're ${gap} item levels higher`, tone: 'down', icon: <ArrowDown size={12} /> })
    else if (measured && gap < 0) notes.push({ text: `You're ${-gap} item levels higher`, tone: 'up', icon: <ArrowUp size={12} /> })
    if (ENCHANTABLE.has(slot) && topRow?.enchant && data && topRow.enchant.count / Math.max(1, data.gearPlayers) >= 0.3) {
      // An import that couldn't read enchants says so, which is not the same as having none
      if (!enchant) notes.push(item?.enchantCoverage === 'complete' ? { text: 'No enchant', tone: 'down', icon: <WandSparkles size={12} /> } : { text: 'Enchant unknown', icon: <WandSparkles size={12} /> })
      else if (!/^Enchant #\d+$/.test(enchant) && !sameEnchant(enchant, topRow.enchant.name)) notes.push({ text: 'Other enchant', icon: <WandSparkles size={12} /> })
    }
    const myGems = gemIdsOf(item)
    // Their item's own gem count; older top-player results only know the slot's most used gem
    const theirGems = share?.gems ? share.gems.length : 0
    const fewer = theirGems - myGems.length
    if (fewer > 0) notes.push(item?.gemsCoverage === 'complete' || item?.itemLink ? { text: myGems.length ? `${fewer} fewer ${fewer === 1 ? 'gem' : 'gems'}` : theirGems === 1 ? 'No gem' : `No gems · they have ${theirGems}`, tone: 'down', icon: <Gem size={12} /> } : { text: 'Gems unknown', icon: <Gem size={12} /> })
    if (topEmbellishment && topEmbellishment !== myEmbellishment) notes.push({ text: myEmbellishment ? 'Other embellishment' : 'They embellish it', tone: myEmbellishment ? undefined : 'down', icon: <Sparkles size={12} /> })
    else if (myEmbellishment && !topEmbellishment && data) notes.push({ text: 'Only you embellish it', icon: <Sparkles size={12} /> })
    return [{ slot, mine: item, top: topRow, embellishment: myEmbellishment, enchant, gain: singles.get(slot) ?? null, notes, verdict: verdictFor(slot, item, topRow, gap) }]
  })

  const talents = tree.data && data?.builds[0] ? talentDifferences(tree.data, character.talents?.loadout ?? null, data.builds[0].loadout) : null
  const reasons = summarize(rows, talents, data?.builds[0]?.count ?? null, data?.gearPlayers ?? null)
  const subject = plan ? 'Your plan' : 'Your gear'
  const [show, setShow] = useState<'all' | 'theirs' | 'mine'>('all')
  const shown = rows.filter(row => show === 'all' || row.verdict.winner === show)
  const wins = { mine: rows.filter(row => row.verdict.winner === 'mine').length, theirs: rows.filter(row => row.verdict.winner === 'theirs').length }

  return (
    <section className="sim-compare" aria-label={`${subject} beside top players`}>
      <header className="sim-compare-head">
        <h4>Why {subject.toLowerCase()} {reasons.verdict}</h4>
        <Card size="sm" className="sim-reasons-card">
          <ul className="sim-reasons">
            {reasons.list.map(reason => <li key={reason.text} data-tone={reason.tone}>{reason.icon}<span>{reason.text}</span></li>)}
          </ul>
        </Card>
      </header>
      <div className="sim-compare-filter">
        <div className="segments" aria-label="Which slots to show">
          <button aria-pressed={show === 'all'} onClick={() => setShow('all')}>All slots</button>
          <button aria-pressed={show === 'theirs'} onClick={() => setShow('theirs')}>Theirs better · {wins.theirs}</button>
          <button aria-pressed={show === 'mine'} onClick={() => setShow('mine')}>Yours better · {wins.mine}</button>
        </div>
        <span className="muted small">{measured ? 'Each item simulated alone against your current gear' : 'Read from item level · run the plan again to measure each item alone'}</span>
      </div>
      <Card size="sm" className="sim-compare-grid" role="table" aria-label="Slot by slot">
        <div className="sim-compare-row sim-compare-labels" role="row">
          <span role="columnheader">Slot</span><span role="columnheader">{subject}</span><span role="columnheader">Top players</span><span role="columnheader">Difference</span>
        </div>
        {!shown.length && <p className="muted small sim-compare-empty">No slots here</p>}
        {shown.map(row => (
          <div key={row.slot} className="sim-compare-row" role="row" data-winner={row.verdict.winner ?? undefined}>
            <span role="cell" className="sim-slot"><span className="sim-slot-name"><GearSlotIcon slot={row.slot} size={15} />{gearSlotLabels[row.slot]}</span>
              <Badge tone={row.verdict.winner === 'mine' ? 'green' : row.verdict.winner === 'theirs' ? 'amber' : 'neutral'}>{row.verdict.winner === 'mine' ? <><Trophy size={12} />Yours</> : row.verdict.winner === 'theirs' ? <><ArrowDown size={12} />Theirs</> : row.verdict.winner === 'even' ? <><Equal size={12} />Even</> : <>Unclear</>}</Badge></span>
            <span role="cell">
              {row.mine ? <Side itemId={row.mine.itemId} name={row.mine.name} level={row.mine.itemLevel} items={itemMap}
                enchant={row.enchant} enchantArt={enchantIcon(row.enchant)} gems={gemIdsOf(row.mine)} embellishment={row.embellishment} /> : <span className="muted">Empty</span>}
            </span>
            <span role="cell">
              {row.top ? <Side itemId={row.top.id} name={row.top.name} level={row.top.level} items={itemMap} share={row.top.share && data ? `${row.top.share.count} of ${data.gearPlayers}` : null}
                enchant={row.top.enchant?.name ?? null} enchantArt={enchantIcon(row.top.enchant?.name)} gems={row.top.gems} embellishment={row.top.embellishment} /> : <span className="muted">Unknown</span>}
            </span>
            <span role="cell" className="sim-notes">
              <span className="sim-verdict" data-winner={row.verdict.winner ?? undefined}><strong>{row.verdict.text}</strong>{row.verdict.detail && <small className="muted">{row.verdict.detail}</small>}</span>
              {row.notes.map(note => <Badge key={note.text} tone={toneOf(note.tone)}>{note.icon}{note.text}</Badge>)}
            </span>
          </div>
        ))}
      </Card>
      {top.isPending && <LatticeLoader label="Reading what top players wear" pattern="ripple" showTimer={false} />}
      {tree.data && talents && <TalentCompare tree={tree.data} diff={talents} players={data?.builds[0]?.count ?? null} total={data?.players.length ?? null} />}
      {!character.talents?.loadout && <p className="muted small">Your talents aren't known yet, so they can't be compared · Log in with the addon or sync this character</p>}
      <p className="muted small">{population}{cap ? ` · Their items are capped at item level ${cap}, the top regular upgrade rank` : plan?.top?.beyondCap ? ' · Your plan reaches past the top regular upgrade rank, so their items run at the highest level any of them wears' : ''}{data ? ` · Their enchant is the most used in the slot; their gems and embellishment are what most of them put in that item` : ''} · The simulation runs their items with your enchants and gems, so those differences are not in the damage numbers above</p>
    </section>
  )
}

function Side({ itemId, name, level, items, enchant, enchantArt, gems, embellishment, share }: {
  itemId: number | null; name: string; level: number | null; items: Map<number, import('../../../shared/gamedata').ItemSummary>
  enchant: string | null; enchantArt: { icon: number | null; quality: number } | null; gems: number[]; embellishment: string | null; share?: string | null
}) {
  const info = itemId ? items.get(itemId) : undefined
  return (
    <div className="sim-side">
      <ItemHoverCard itemId={itemId} item={info} name={name}>
        <span className="sim-item">
          <ItemIcon icon={info?.icon} quality={info?.quality ?? 4} size="small" />
          <span className={`quality-text-${info?.quality ?? 4}`}>{info?.name ?? name}</span>
          {level != null && <b>{Math.round(level)}</b>}
          {share && <small className="muted">{share}</small>}
        </span>
      </ItemHoverCard>
      <span className="sim-extras">
        {enchant && <Badge><span className="sim-extra" title={enchant}>{enchantArt?.icon ? <img src={iconUrl(enchantArt.icon) ?? undefined} alt="" width={14} height={14} /> : <WandSparkles size={12} />}{enchant.replace(/^Enchant (\w+ )+- /, '')}</span></Badge>}
        {gems.map((id, index) => { const gem = items.get(id); return <Badge key={`${id}-${index}`}><span className="sim-extra" title={gem?.name}>{gem?.icon ? <img src={iconUrl(gem.icon) ?? undefined} alt="" width={14} height={14} /> : <Gem size={12} />}{gems.length === 1 ? gem?.name ?? 'Gem' : ''}</span></Badge> })}
        {embellishment && <Badge tone="blue"><span className="sim-extra"><Sparkles size={12} />{embellishment}</span></Badge>}
      </span>
    </div>
  )
}

function TalentCompare({ tree, diff, players, total }: { tree: TalentTree; diff: NonNullable<ReturnType<typeof talentDifferences>>; players: number | null; total: number | null }) {
  const heroIcon = (name: string | null) => tree.subTrees.find(entry => entry.name === name)?.icon ?? null
  const sections: Array<[TalentChoice['section'], string]> = [['class', 'Class'], ['spec', 'Specialization'], ['hero', 'Hero']]
  const changes = diff.onlyMine.length + diff.onlyTheirs.length
  return (
    <div className="sim-talents">
      <h4><Layers size={15} aria-hidden="true" />Talents{players != null && total != null ? ` · their most popular build, used by ${players} of ${total}` : ''}</h4>
      <div className="sim-hero-row">
        <HeroBadge label="You" name={diff.hero.mine} icon={heroIcon(diff.hero.mine)} />
        <HeroBadge label="Them" name={diff.hero.theirs} icon={heroIcon(diff.hero.theirs)} />
        <span className="muted small">{diff.hero.mine === diff.hero.theirs ? 'Same hero tree' : 'Different hero trees · their hero talents aren\'t listed one by one'} · {diff.shared} talents in common{changes ? ` · ${changes} differ` : ' · nothing else differs'}</span>
      </div>
      {changes > 0 && <div className="sim-talent-columns">
        {([['Only you take', diff.onlyMine], ['Only they take', diff.onlyTheirs]] as const).map(([title, list]) => (
          <Card size="sm" key={title} className="sim-talent-column">
            <strong>{title}</strong>
            {sections.map(([section, name]) => {
              const entries = list.filter(entry => entry.section === section)
              return entries.length ? <div key={section} className="sim-talent-group"><small>{name}</small>{entries.map(entry => <TalentChip key={`${entry.nodeId}-${entry.name}`} tree={tree} entry={entry} />)}</div> : null
            })}
            {!list.length && <span className="muted small">Nothing</span>}
          </Card>
        ))}
      </div>}
    </div>
  )
}

function HeroBadge({ label, name, icon }: { label: string; name: string | null; icon: number | null }) {
  return <Card size="sm" className="sim-hero-badge"><small>{label}</small><ItemIcon icon={icon} size="small" fallback={<Sparkles />} /><strong>{name ?? 'Unknown'}</strong></Card>
}

function TalentChip({ tree, entry }: { tree: TalentTree; entry: TalentChoice }) {
  const text = talentDescription(tree, entry.spellId)
  return (
    <Popover>
      <PopoverTrigger openOnHover delay={200} closeDelay={120} className="sim-talent" aria-label={entry.name}>
        <ItemIcon icon={entry.icon} size="small" fallback={<Sparkles />} />
        <span>{entry.name}</span>
        {entry.maxRanks > 1 && <small>{entry.ranks}/{entry.maxRanks}</small>}
      </PopoverTrigger>
      <PopoverContent side="top" className="talent-popover">
        <div className="talent-detail-head"><ItemIcon icon={entry.icon} size="medium" fallback={<Sparkles />} /><div><strong>{entry.name}</strong><small>{entry.maxRanks > 1 ? `Rank ${entry.ranks} of ${entry.maxRanks}` : '1 rank'}</small></div></div>
        {text && <p>{text}</p>}
      </PopoverContent>
    </Popover>
  )
}

type Reason = { text: string; tone?: 'up' | 'down'; icon: ReactNode }
function summarize(rows: Row[], talents: ReturnType<typeof talentDifferences>, buildPlayers: number | null, gearPlayers: number | null) {
  const list: Reason[] = []
  const mineWins = rows.filter(row => row.verdict.winner === 'mine').length, theirWins = rows.filter(row => row.verdict.winner === 'theirs').length
  const measuredRows = rows.some(row => row.verdict.measured)
  if (mineWins || theirWins) list.push({ text: `Slot by slot, yours is better in ${mineWins} and theirs in ${theirWins}${measuredRows ? ', measured with each item alone' : ', by item level'}`, tone: theirWins > mineWins ? 'down' : mineWins > theirWins ? 'up' : undefined, icon: <Trophy size={14} /> })
  let behind = 0, ahead = 0
  const higher = rows.filter(row => row.top?.level != null && row.mine?.itemLevel != null && row.top.level > row.mine.itemLevel)
  const lower = rows.filter(row => row.top?.level != null && row.mine?.itemLevel != null && row.top.level < row.mine.itemLevel)
  const levels = (list: Row[]) => list.reduce((sum, row) => sum + Math.abs((row.top!.level ?? 0) - (row.mine!.itemLevel ?? 0)), 0) / Math.max(1, list.length)
  if (higher.length) { behind++; list.push({ text: `Their items are higher in ${higher.length} ${higher.length === 1 ? 'slot' : 'slots'}, by ${Math.round(levels(higher))} item levels on average`, tone: 'down', icon: <ArrowDown size={14} /> }) }
  if (lower.length) { ahead++; list.push({ text: `Yours are higher in ${lower.length} ${lower.length === 1 ? 'slot' : 'slots'}, by ${Math.round(levels(lower))} item levels on average`, tone: 'up', icon: <ArrowUp size={14} /> }) }
  const different = rows.filter(row => row.notes.some(note => note.text === 'Different item')).length
  if (different) list.push({ text: `${different} ${different === 1 ? 'slot uses' : 'slots use'} a different item`, icon: <Swords size={14} /> })
  const missingEnchants = rows.filter(row => row.notes.some(note => note.text === 'No enchant')).length
  const otherEnchants = rows.filter(row => row.notes.some(note => note.text === 'Other enchant')).length
  const unknownEnchants = rows.filter(row => row.notes.some(note => note.text === 'Enchant unknown')).length
  if (missingEnchants || otherEnchants || unknownEnchants) { behind += missingEnchants ? 1 : 0; list.push({ text: [missingEnchants && `${missingEnchants} enchant${missingEnchants === 1 ? '' : 's'} missing`, otherEnchants && `${otherEnchants} different from theirs`, unknownEnchants && `${unknownEnchants} of your enchants weren't recorded in this run's snapshot`].filter(Boolean).join(' · '), tone: missingEnchants ? 'down' : undefined, icon: <WandSparkles size={14} /> }) }
  const missingGems = rows.filter(row => row.notes.some(note => note.text === 'No gem')).length
  if (missingGems) { behind++; list.push({ text: `${missingGems} ${missingGems === 1 ? 'slot has' : 'slots have'} no gem where most of them socket one`, tone: 'down', icon: <Gem size={14} /> }) }
  const mineEmb = rows.flatMap(row => row.embellishment ? [row.embellishment] : []), theirEmb = gearPlayers ? rows.flatMap(row => row.top?.embellishment ? [row.top.embellishment] : []) : []
  if (gearPlayers && (mineEmb.length || theirEmb.length)) list.push({ text: `Embellishments · you have ${mineEmb.length || 'none'} · they have ${theirEmb.length || 'none'}${theirEmb.length ? ` (${rows.filter(row => row.top?.embellishment).map(row => gearSlotLabels[row.slot].toLowerCase()).join(', ')})` : ''}`, tone: theirEmb.length > mineEmb.length ? 'down' : undefined, icon: <Sparkles size={14} /> })
  if (talents) {
    const changes = talents.onlyMine.length + talents.onlyTheirs.length
    const hero = talents.hero.mine !== talents.hero.theirs ? ` · you take ${talents.hero.mine ?? 'no hero tree'} and they take ${talents.hero.theirs ?? 'none'}` : ''
    list.push({ text: changes || hero ? `${changes} talent choices differ from the build ${buildPlayers ?? 'most'} of them use${hero}` : 'Your talents match their most popular build', tone: changes || hero ? undefined : 'up', icon: <Layers size={14} /> })
  }
  if (!list.length) list.push({ text: 'Your setup matches theirs slot for slot', tone: 'up', icon: <Equal size={14} /> })
  const verdict = behind > ahead ? 'trails top players' : ahead > behind ? 'holds up against top players' : 'compares with top players'
  return { list, verdict }
}
