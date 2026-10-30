import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Archive, Backpack, Check, ChevronLeft, ChevronRight, Copy, Gift, Search, Shield } from 'lucide-react'
import type { Character, GearItem, GearSlot, InventoryObservation } from '../../../shared/domain'
import { gearSlotSchema } from '../../../shared/domain'
import { toItemVariant, type CurrencyCost } from '../../../shared/gear-variants'
import { quoteUpgradeVariants } from '../../../shared/observed-upgrades'
import { api } from '../../lib/client'
import { Badge, Button, Field, Sheet } from '../../components/ui/primitives'
import { AppSelect } from '../../components/AppSelect'
import { Toggle } from '../../components/ui/toggle'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { ItemIcon } from '../items/ItemIcon'
import { useGameData } from '../items/items'
import { errorMessage, notify } from '../../lib/notify'
import './inventory.css'

const locations: Array<{ value: InventoryObservation['location']; label: string; icon: typeof Shield; unavailable: string }> = [
  { value: 'equipped', label: 'Equipped', icon: Shield, unavailable: 'Equipped gear has not been observed yet' },
  { value: 'bags', label: 'Bags', icon: Backpack, unavailable: 'Bag equipment has not been observed yet · Sync a fresh addon capture' },
  { value: 'bank', label: 'Observed bank', icon: Archive, unavailable: 'Bank equipment is unknown · Open your bank in game, then sync an addon capture' },
  { value: 'vault', label: 'Vault choices', icon: Gift, unavailable: 'Vault choices are unknown · Open the Great Vault in game, then sync an addon capture' },
]
const slotNames: Record<GearSlot, string> = { head: 'Head', neck: 'Neck', shoulder: 'Shoulder', back: 'Cloak', chest: 'Chest', wrist: 'Wrist', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', finger1: 'Ring 1', finger2: 'Ring 2', trinket1: 'Trinket 1', trinket2: 'Trinket 2', mainHand: 'Main hand', offHand: 'Off hand' }
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Observation time unknown'
const readable = (value: string) => value.replace(/\.+$/, '')
function money(copper: number) { return `${Math.floor(copper / 10000).toLocaleString()}g ${Math.floor(copper % 10000 / 100)}s ${copper % 100}c` }
function cost(cost: CurrencyCost) { return cost.currencyId === 'money' ? money(cost.amount) : `${cost.amount.toLocaleString()} × ${cost.currencyId.startsWith('item:') ? `Item #${cost.currencyId.slice(5)}` : `Currency #${cost.currencyId}`}` }
async function copy(value: string, message: string) { try { await navigator.clipboard.writeText(value); notify(message) } catch (error) { notify(errorMessage(error)) } }

export function InventoryPage({ character }: { character: Character }) { return <InventoryContent key={character.id} character={character} /> }
function InventoryContent({ character }: { character: Character }) {
  const [location, setLocation] = useState<InventoryObservation['location']>('equipped')
  const [search, setSearch] = useState('')
  const [slot, setSlot] = useState('all')
  const [page, setPage] = useState(0)
  const [selected, setSelected] = useState<{ item: GearItem; observedAt: string | null; gameBuild: string | null } | null>(null)
  const observations = useMemo(() => {
    const values = new Map((character.inventoryObservations ?? []).map(observation => [observation.location, observation]))
    // The equipped snapshot retains its original provenance when no location observations were imported
    if (!values.has('equipped')) values.set('equipped', { schemaVersion: 1, location: 'equipped', observedAt: character.gearObservedAt, coverage: character.gearCoverage, items: character.gear, choiceGroup: null })
    return values
  }, [character])
  const observation = observations.get(location)
  const filtered = useMemo(() => (observation?.items ?? []).map((item, index) => ({ item, index })).filter(({ item }) => (slot === 'all' || item.slot === slot) && (!search.trim() || `${item.name} ${slotNames[item.slot]} ${item.itemId ?? ''}`.toLowerCase().includes(search.trim().toLowerCase()))), [observation, slot, search])
  const pages = Math.max(1, Math.ceil(filtered.length / 40))
  const currentPage = Math.min(page, pages - 1)
  const visible = filtered.slice(currentPage * 40, (currentPage + 1) * 40)
  const ids = [...new Set(visible.flatMap(({ item }) => item.itemId ? [item.itemId] : []))]
  const gameData = useGameData()
  const metadata = useQuery({ queryKey: ['inventory-item-details', ids], queryFn: () => api.getItems(ids), enabled: gameData.data?.state === 'ready' && ids.length > 0, staleTime: 60_000 })
  const byId = new Map(metadata.data?.map(item => [item.id, item]))
  const descriptor = locations.find(value => value.value === location)!
  const unknown = !observation || observation.coverage === 'unknown'
  return <div className="inventory-page">
    <div className="page-heading"><div><h1>Inventory</h1><p>Recorded equipment and talents for {character.name}</p></div><Badge>{character.gameBuild ? `Build ${character.gameBuild}` : 'Build unknown'}</Badge></div>
    <div className="inventory-locations" aria-label="Inventory locations">{locations.map(({ value, label, icon: Icon }) => { const snapshot = observations.get(value); return <Toggle key={value} pressed={location === value} onPressedChange={() => { setLocation(value); setPage(0); setSelected(null) }} className="inventory-location" aria-label={label}><Icon size={17} /><span>{label}</span><strong>{snapshot && snapshot.coverage !== 'unknown' ? snapshot.items.length : '—'}</strong><small>{snapshot?.coverage === 'complete' ? 'Observed scan' : snapshot?.coverage === 'partial' ? 'Partial scan' : 'Not observed'}</small></Toggle> })}</div>
    <section className="surface inventory-section" aria-label={`${descriptor.label} equipment`}>
      <div className="inventory-section-heading"><div><h2>{descriptor.label}</h2><p className="muted">{date(observation?.observedAt)}</p></div><Badge tone={observation?.coverage === 'complete' ? 'green' : 'amber'}>{observation?.coverage === 'complete' ? 'Complete equipment scan' : observation?.coverage === 'partial' ? 'Partial equipment scan' : 'Coverage unknown'}</Badge></div>
      {location === 'vault' && <p className="inventory-notice"><Gift size={16} />These rewards are alternatives from one weekly claim · They are not owned items and cannot be combined</p>}
      {location === 'bank' && <p className="muted">This is the last observed bank equipment scan · Unavailable bank access never means an empty bank</p>}
      <div className="inventory-filters"><label className="inventory-search"><Search size={15} /><input type="search" aria-label="Search recorded inventory" placeholder="Search equipment by name, slot, or item ID" value={search} onChange={event => { setSearch(event.target.value); setPage(0) }} maxLength={100} /></label><AppSelect label="Inventory slot" value={slot} onValueChange={value => { setSlot(value); setPage(0) }} options={[{ value: 'all', label: 'All slots' }, ...gearSlotSchema.options.map(value => ({ value, label: slotNames[value] }))]} /></div>
      {unknown && !observation?.items.length ? <p className="inventory-unavailable">{descriptor.unavailable}</p> : !filtered.length ? <p className="inventory-unavailable">{search || slot !== 'all' ? 'No recorded equipment matches these filters' : observation?.coverage === 'complete' ? 'No equipment items were found in this observed scan' : 'No equipment items are available in this partial scan'}</p> : <>
        <div className="inventory-list" aria-label="Recorded equipment">{visible.map(({ item, index }) => { const details = item.itemId ? byId.get(item.itemId) : undefined; return <ItemHoverCard key={`${location}:${index}:${item.instanceId ?? item.locationKey ?? 'unresolved'}`} gear={item}><button type="button" className="inventory-item inventory-item-trigger" onClick={() => setSelected({ item, observedAt: observation?.observedAt ?? null, gameBuild: character.gameBuild })} aria-label={`Inspect ${item.name}, ${slotNames[item.slot]}, item level ${item.itemLevel ?? 'unknown'}`}><ItemIcon icon={details?.icon} quality={details?.quality} /><span className="inventory-item-name"><strong>{item.name}</strong><small>{slotNames[item.slot]}{item.locationKey ? ` · ${item.locationKey}` : ''}{location === 'vault' ? ' · Unclaimed alternative' : ''}</small>{item.observedUpgrade && <small>Vendor quote · {date(item.observedUpgrade.observedAt)}</small>}</span><span className="inventory-item-level">{item.itemLevel ?? '—'}<small>item level</small></span></button></ItemHoverCard> })}</div>
        <div className="inventory-pagination"><span className="muted">{filtered.length} recorded equipment {filtered.length === 1 ? 'instance' : 'instances'} · Page {currentPage + 1} of {pages}</span><Button variant="quiet" disabled={currentPage === 0} aria-label="Previous inventory page" onClick={() => setPage(currentPage - 1)}><ChevronLeft size={16} /></Button><Button variant="quiet" disabled={currentPage + 1 >= pages} aria-label="Next inventory page" onClick={() => setPage(currentPage + 1)}><ChevronRight size={16} /></Button></div>
      </>}
      <p className="muted inventory-footnote">Each physical copy stays separate · This view lists equippable items, not a full consumables or materials inventory</p>
    </section>
    <section className="surface inventory-section" aria-label="Observed talents"><div className="inventory-section-heading"><div><h2>Talents</h2><p className="muted">{date(character.talents?.observedAt)}</p></div><Badge>{character.talents?.specId === character.specId && character.specId ? 'Matching specialization' : 'Specialization unverified'}</Badge></div>{character.talents ? <><p className="muted">Source: {character.talents.source} · Spec {character.talents.specId ?? 'unknown'}</p><Field label="Recorded talent loadout"><textarea readOnly aria-label="Recorded talent loadout" className="inventory-raw" value={character.talents.loadout} rows={3} /></Field><Button onClick={() => void copy(character.talents!.loadout, 'Talent loadout copied')}><Copy size={14} />Copy talents</Button></> : <p className="muted">No talent loadout has been observed · Sync a fresh addon capture after selecting your specialization</p>}</section>
    <Sheet open={selected !== null} onOpenChange={open => { if (!open) setSelected(null) }} title={selected?.item.name ?? 'Recorded item'} description={selected ? `${slotNames[selected.item.slot]} · ${location === 'vault' ? 'Unclaimed Vault alternative' : descriptor.label}` : undefined}>{selected && <InventoryItem item={selected.item} gameBuild={selected.gameBuild} observedAt={selected.observedAt} />}</Sheet>
  </div>
}
function InventoryItem({ item, gameBuild, observedAt }: { item: GearItem; gameBuild: string | null; observedAt: string | null }) {
  const quoted = quoteUpgradeVariants(toItemVariant(item), { now: new Date().toISOString(), gameBuild, seasonId: null, rulesetId: null })
  const quote = item.observedUpgrade
  return <div className="inventory-detail"><dl><dt>Observed item level</dt><dd>{item.itemLevel ?? 'Unknown'}</dd><dt>Observation</dt><dd>{date(observedAt)}</dd><dt>Item ID</dt><dd>{item.itemId ?? 'Unknown'}</dd><dt>Instance</dt><dd>{item.instanceId ?? 'Not recorded'}</dd><dt>Location key</dt><dd>{item.locationKey ?? 'Not recorded'}</dd><dt>Bonus IDs</dt><dd>{item.bonusIds == null ? 'Unknown' : item.bonusIds.join(', ') || 'None observed'}</dd><dt>Enchant</dt><dd>{item.enchant ?? (item.enchantCoverage === 'complete' ? 'None observed' : 'Unknown')}</dd><dt>Gems</dt><dd>{item.gems.length ? item.gems.join(' · ') : item.gemsCoverage === 'complete' ? 'None observed' : 'Unknown'}</dd></dl>
    {item.itemLink ? <><Field label="Original item link"><textarea readOnly className="inventory-raw" aria-label="Original item link" value={item.itemLink} rows={3} /></Field><Button onClick={() => void copy(item.itemLink!, 'Item link copied')}><Copy size={14} />Copy item link</Button></> : <p className="muted">The exact item link was not recorded</p>}
    <section className="inventory-quotes"><h3>Observed upgrade quote</h3>{!quote ? <p className="muted">No vendor quote has been captured for this exact item · Inspect it at an upgrade vendor in game, then sync</p> : <><p className="muted">{date(quote.observedAt)} · Build {quote.gameBuild} · Rank {quote.currentRank}/{quote.maxRank}</p><p className="muted">These are recorded vendor costs, including any discount already applied when observed · They do not establish that you can afford the upgrade now</p>{quoted.items.length ? quoted.items.map(target => <div className="inventory-quote" key={target.variantKey}><strong><Check size={14} />Rank {target.upgradeRank} · Item level {target.itemLevel}</strong><span>{target.currencyCost?.length ? target.currencyCost.map(cost).join(' · ') : 'Quoted zero cost'}</span><small className="muted">Total from the observed current rank</small></div>) : null}{quoted.reasons.map(reason => <p className="muted" key={reason}>{readable(reason)}</p>)}{!quote.upgradeable && <p className="muted">The vendor reported that this item could not be upgraded</p>}{quote.currentRank === quote.maxRank && <p className="muted">The item was already at its quoted maximum rank</p>}{quote.levels.filter(level => level.rank > quote.currentRank && (level.failureMessage || level.moneyCost === null)).map(level => <p className="muted" key={level.rank}>Rank {level.rank}: {readable(level.failureMessage ?? 'Gold cost unknown')}</p>)}</>}</section>
  </div>
}
