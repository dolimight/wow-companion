import { lazy, Suspense, useDeferredValue, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Box, Cat, Rabbit, Search, Shirt, Sword } from 'lucide-react'
import type { Character, GearItem } from '../../../shared/domain'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { ownModelTypes, wearableTypes } from '../../../shared/model'
import { api } from '../../lib/client'
import { Card } from '../../components/ui/card'
import { Badge, EmptyState } from '../../components/ui/primitives'
import { Input } from '../../components/ui/input'
import { AppSelect } from '../../components/AppSelect'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { ItemIcon } from '../items/ItemIcon'
import { useGameData } from '../items/items'
import './model-viewer.css'

const ItemModelViewer = lazy(() => import('./ItemModelViewer').then(module => ({ default: module.ItemModelViewer })))

export type ViewerTab = 'items' | 'mounts' | 'pets'
/** What the page shows, kept in its address: an item, or a creature with the name and icon it was picked by */
export type ViewerSelection = { tab: ViewerTab; item?: number; creature?: number; label?: string; icon?: number }

/** Item categories: every gear slot that has a look, jewelry left out */
const categories = (['head', 'shoulder', 'back', 'chest', 'wrist', 'hands', 'waist', 'legs', 'feet', 'mainHand', 'offHand'] as const)
type Category = (typeof categories)[number] | 'any'

/**
 * Items, mounts, and battle pets from the player's game files in 3D, in one place: pick a category, search it, and
 * turn the model, zoom in, and play its animations. Any wearable item can also be shown on a stand-in character
 */
export function ModelViewerPage({ character, selection, onSelect }: { character: Character | null; selection: ViewerSelection; onSelect: (next: ViewerSelection) => void }) {
  const ready = useGameData().data?.state === 'ready'
  const tab = selection.tab
  const [text, setText] = useState('')
  const [category, setCategory] = useState<Category>('any')
  const query = useDeferredValue(text.trim())
  const searching = tab === 'items' ? query.length >= 2 || category !== 'any' : true
  const items = useQuery({
    queryKey: ['model-items', query, category],
    queryFn: () => api.searchItemsPage({ text: query, slot: category === 'any' ? null : category, sort: query ? 'relevance' : 'maxLevel', limit: 40, offset: 0 }),
    enabled: ready && tab === 'items' && searching,
    staleTime: 60_000,
  })
  const creatures = useQuery({
    queryKey: ['model-creatures', tab, query],
    queryFn: () => (tab === 'mounts' ? api.mounts(query) : api.pets(query)),
    enabled: ready && tab !== 'items',
    staleTime: 5 * 60_000,
  })
  // Jewelry has no look, so worn rings, necks, and trinkets are left off
  const worn = (character?.gear ?? []).filter((gear): gear is GearItem & { itemId: number } => !!gear.itemId && !/^(neck|finger|trinket)/.test(gear.slot))
  const wornItems = useQuery({ queryKey: ['items', worn.map(gear => gear.itemId)], queryFn: () => api.getItems(worn.map(gear => gear.itemId)), enabled: ready && worn.length > 0, staleTime: 60_000 })
  const summary = (id: number) => wornItems.data?.find(entry => entry.id === id)
  const item = useQuery({ queryKey: ['item', selection.item], queryFn: () => api.getItem(selection.item!), enabled: ready && selection.item != null })

  const rows = tab === 'items'
    ? searching ? (items.data?.items ?? []).map(entry => ({ key: `i${entry.id}`, name: entry.name, icon: entry.icon, quality: entry.quality, detail: entry.slot, active: entry.id === selection.item, pick: () => onSelect({ tab, item: entry.id }) })) : null
    : (creatures.data ?? []).map(entry => ({ key: `c${entry.id}`, name: entry.name, icon: entry.icon, quality: 1, detail: tab === 'mounts' ? 'Mount' : 'Battle pet', active: entry.displayId === selection.creature, pick: () => onSelect({ tab, creature: entry.displayId, label: entry.name, icon: entry.icon ?? undefined }) }))
  const pending = tab === 'items' ? items.isPending && searching : creatures.isPending

  const shownItem = selection.item != null && item.data ? item.data : null
  const title = shownItem?.name ?? (selection.creature != null ? selection.label ?? 'Creature' : null)
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Model viewer</h1>
          <p>Items, mounts, and pets from your game files in 3D · turn them, zoom in, and play their animations</p>
        </div>
      </div>
      {!ready ? <EmptyState icon={Box} title="Game data isn't ready" description="Prepare local game data in Settings to see models" /> : (
        <div className="model-page">
          <Card as="section" className="model-page-picker" aria-label="Choose what to view">
            <ToggleGroup variant="outline" size="sm" value={[tab]} onValueChange={values => { const next = values[0] as ViewerTab | undefined; if (next) { setText(''); onSelect({ tab: next }) } }} aria-label="Category">
              <ToggleGroupItem value="items"><Sword size={13} aria-hidden="true" />Items</ToggleGroupItem>
              <ToggleGroupItem value="mounts"><Rabbit size={13} aria-hidden="true" />Mounts</ToggleGroupItem>
              <ToggleGroupItem value="pets"><Cat size={13} aria-hidden="true" />Pets</ToggleGroupItem>
            </ToggleGroup>
            {tab === 'items' && <AppSelect label="Slot" value={category} options={[{ value: 'any', label: 'Every slot' }, ...categories.map(slot => ({ value: slot, label: gearSlotLabels[slot] }))]} onValueChange={value => setCategory(value as Category)} />}
            <label className="model-page-search">
              <Search size={15} aria-hidden="true" />
              <Input value={text} onChange={event => setText(event.target.value)} placeholder={tab === 'items' ? 'Search items' : tab === 'mounts' ? 'Search mounts' : 'Search pets'} aria-label={`Search ${tab}`} />
            </label>
            {rows ? (
              <ul className="model-page-list" aria-label="Results">
                {pending && <li className="muted small" role="status">Searching…</li>}
                {!pending && !rows.length && <li className="muted small">Nothing matches</li>}
                {rows.map(({ key, ...row }) => <PickRow key={key} {...row} />)}
              </ul>
            ) : (
              <>
                <h2><Shirt size={14} aria-hidden="true" />{character ? `${character.name}'s gear` : 'Your gear'}</h2>
                {worn.length ? (
                  <ul className="model-page-list" aria-label="Worn items">
                    {worn.map(gear => <PickRow key={gear.slot} name={gear.name} icon={summary(gear.itemId)?.icon ?? null} quality={summary(gear.itemId)?.quality ?? 1} detail={gearSlotLabels[gear.slot]} active={gear.itemId === selection.item} pick={() => onSelect({ tab, item: gear.itemId })} />)}
                  </ul>
                ) : <p className="muted small">Pick a slot or search, or sync a character to choose from what it wears</p>}
              </>
            )}
          </Card>
          <Card as="section" className="model-page-stage" aria-label="3D model">
            {!title ? <EmptyState icon={Box} title="Pick something to view" description="Choose a category, then an item, mount, or pet" /> : (
              <>
                <div className="model-page-title">
                  <ItemIcon icon={shownItem?.icon ?? selection.icon ?? null} quality={shownItem?.quality ?? 1} />
                  <div>
                    <h2 className={shownItem ? `quality-text-${shownItem.quality}` : undefined}>{title}</h2>
                    <p>Drag to turn · scroll to zoom · right-drag to move</p>
                  </div>
                  {shownItem?.itemLevel ? <Badge>Item level {shownItem.itemLevel}</Badge> : selection.creature != null ? <Badge>{tab === 'pets' ? 'Battle pet' : 'Mount'}</Badge> : null}
                </div>
                <Suspense fallback={<p className="muted small" role="status">Loading the 3D viewer…</p>}>
                  {shownItem ? <ItemModelViewer key={`item-${shownItem.id}`} target={{ kind: 'item', itemId: shownItem.id, wearable: wearableTypes.has(shownItem.inventoryType), ownModel: ownModelTypes.has(shownItem.inventoryType) }} name={shownItem.name} />
                    : selection.creature != null ? <ItemModelViewer key={`creature-${selection.creature}`} target={{ kind: 'creature', displayId: selection.creature }} name={title} />
                      : <p className="muted small" role="status">Loading…</p>}
                </Suspense>
              </>
            )}
          </Card>
        </div>
      )}
    </>
  )
}

function PickRow({ name, icon, quality, detail, active, pick }: { name: string; icon: number | null; quality: number; detail: string; active: boolean; pick: () => void }) {
  return (
    <li>
      <button type="button" className="model-page-item" aria-current={active || undefined} onClick={pick}>
        <ItemIcon icon={icon} quality={quality} size="small" />
        <span><b className={`quality-text-${quality}`}>{name}</b><small>{detail}</small></span>
      </button>
    </li>
  )
}
