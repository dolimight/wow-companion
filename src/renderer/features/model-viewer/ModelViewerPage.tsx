import { lazy, Suspense, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Box, ChevronLeft, ChevronRight, ExternalLink, Search, Shirt } from 'lucide-react'
import type { Character, GearItem } from '../../../shared/domain'
import type { ItemSearchPage } from '../../../shared/gamedata'
import { gearSlotLabels } from '../../../shared/simulation-benchmark'
import { ownModelTypes, wearableTypes } from '../../../shared/model'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button, EmptyState } from '../../components/ui/primitives'
import { Input } from '../../components/ui/input'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { ItemIcon } from '../items/ItemIcon'
import { wowheadItemUrl } from '../items/ItemPower'
import { useGameData } from '../items/items'
import { categories, mountSources, petFamilies, trail, type CategoryFilter, type CategoryNode } from './categories'
import { ModelTile, TileStageContext, type Tile } from './ModelTile'
import { ModelFilters, noFilters, type ModelFilterValues } from './ModelFilters'
import { parseQuery } from './query'
import { TileStage } from './tile-stage'
import './model-viewer.css'

const ItemModelViewer = lazy(() => import('./ItemModelViewer').then(module => ({ default: module.ItemModelViewer })))

/**
 * What the page shows, kept in its address: the category being browsed, and the item or creature open in the large
 * viewer with the name, icon, and kind it was picked by
 */
export type ViewerSelection = { cat?: string; item?: number; creature?: number; label?: string; icon?: number; kind?: 'mount' | 'pet'; note?: string }

/** Creature lists come whole, so the grid shows them a page at a time as you scroll */
const pageSize = 48

/**
 * Items, mounts, and battle pets from the player's game files, as a grid of 3D tiles. Browse the categories the game
 * files them under or search; tiles render as they scroll into view, turn when hovered, and open a large viewer
 */
export function ModelViewerPage({ character, selection, onSelect }: { character: Character | null; selection: ViewerSelection; onSelect: (next: ViewerSelection) => void }) {
  const ready = useGameData().data?.state === 'ready'
  const path = trail(selection.cat)
  const node = path[path.length - 1] ?? null
  const [text, setText] = useState('')
  const typed = useDeferredValue(text.trim())
  const [filters, setFilters] = useState<ModelFilterValues>(noFilters)
  const browse = (next: CategoryNode[]) => { setText(''); onSelect({ cat: next.map(entry => entry.id).join('/') || undefined }) }
  // The looks index behind colour, theme, and effect filters builds in the background the first time the page opens
  const looks = useQuery({ queryKey: ['looks-status'], queryFn: () => api.looksStatus(), enabled: ready, refetchInterval: query => (query.state.data?.ready ? false : 1500) })
  // Typed colours, themes, and effect words join the side filters; the rest searches names
  const parsed = useMemo(() => parseQuery(typed), [typed])
  const query = parsed.text
  const tags = [...new Set([...filters.colors, ...filters.themes, ...parsed.colors, ...parsed.themes])]
  const effect = parsed.effect !== 'any' ? parsed.effect : filters.effect
  const lookReady = !!looks.data?.ready
  const look = { effect, tags }
  const narrowed = tags.length > 0 || effect !== 'any' || JSON.stringify({ ...filters, colors: [], themes: [], effect: 'any' }) !== JSON.stringify({ ...noFilters, colors: [], themes: [] })
  // Searching or filtering at the top looks through every item; inside a category it narrows that category
  const filter: CategoryFilter | null = node?.filter ?? (query.length >= 2 || narrowed ? { kind: 'items', search: {} } : null)
  const itemFilters = { tags, effect, quality: filters.quality, source: filters.source, expansion: filters.expansion, minLevel: filters.minLevel, maxLevel: filters.maxLevel, levelBasis: 'base' as const, currentOnly: filters.currentOnly }

  const items = useInfiniteQuery({
    queryKey: ['model-items', filter?.kind === 'items' ? filter.search : null, query, itemFilters, lookReady],
    queryFn: ({ pageParam }) => api.searchItemsPage({ ...(filter?.kind === 'items' ? filter.search : {}), ...itemFilters, text: query, sort: query ? 'relevance' : 'maxLevel', limit: pageSize, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: last => last.nextOffset ?? undefined,
    enabled: ready && filter?.kind === 'items',
    staleTime: 60_000,
  })
  const creatures = useQuery({
    queryKey: ['model-creatures', filter?.kind, filter?.kind === 'mounts' ? filter.source : filter?.kind === 'pets' ? filter.family : null, query, look, lookReady],
    queryFn: async () => filter?.kind === 'mounts'
      ? (await api.mounts(query, filter.source, look)).map(entry => ({ ...entry, note: mountSources[entry.source] ?? 'Mount', kind: 'mount' as const }))
      : filter?.kind === 'pets' ? (await api.pets(query, filter.family, look)).map(entry => ({ ...entry, note: petFamilies[entry.family] ?? 'Battle pet', kind: 'pet' as const })) : [],
    enabled: ready && (filter?.kind === 'mounts' || filter?.kind === 'pets'),
    staleTime: 5 * 60_000,
  })
  const [shownCreatures, setShownCreatures] = useState(pageSize)
  useEffect(() => setShownCreatures(pageSize), [creatures.data])

  // Jewelry has no look, so worn rings, necks, and trinkets are left off
  const worn = (character?.gear ?? []).filter((gear): gear is GearItem & { itemId: number } => !!gear.itemId && !/^(neck|finger|trinket)/.test(gear.slot))
  const wornItems = useQuery({ queryKey: ['items', worn.map(gear => gear.itemId)], queryFn: () => api.getItems(worn.map(gear => gear.itemId)), enabled: ready && worn.length > 0, staleTime: 60_000 })

  const itemTile = (entry: { id: number; name: string; quality: number; icon: number | null; inventoryType: number }, detail: string): Tile => ({
    key: `i${entry.id}`, name: entry.name, quality: entry.quality, icon: entry.icon, detail,
    target: { kind: 'item', itemId: entry.id, worn: wearableTypes.has(entry.inventoryType) && !ownModelTypes.has(entry.inventoryType) },
    open: () => onSelect({ cat: selection.cat, item: entry.id }),
  })
  const tiles: Tile[] = useMemo(() => {
    if (filter?.kind === 'items') {
      // The same item at several qualities shares one look, so it shows once, at its best quality
      const best = new Map<string, ItemSearchPage['items'][number]>()
      for (const entry of items.data?.pages.flatMap(page => page.items) ?? []) { const found = best.get(entry.name); if (!found || entry.quality > found.quality) best.set(entry.name, entry) }
      return [...best.values()].map(entry => itemTile(entry, `${entry.slot}${entry.itemLevel ? ` · ${entry.itemLevel}` : ''}`))
    }
    if (filter) return (creatures.data ?? []).slice(0, shownCreatures).map(entry => ({
      key: `c${entry.kind}${entry.id}`, name: entry.name, quality: 1, icon: entry.icon, detail: entry.note,
      target: { kind: 'creature' as const, displayId: entry.displayId },
      open: () => onSelect({ cat: selection.cat, creature: entry.displayId, label: entry.name, icon: entry.icon ?? undefined, kind: entry.kind, note: entry.note }),
    }))
    return worn.flatMap(gear => { const found = wornItems.data?.find(entry => entry.id === gear.itemId); return found ? [itemTile(found, gearSlotLabels[gear.slot])] : [] })
  }, [filter, items.data, creatures.data, shownCreatures, wornItems.data, selection.cat]) // eslint-disable-line react-hooks/exhaustive-deps
  const more = filter?.kind === 'items' ? items.hasNextPage : filter ? (creatures.data?.length ?? 0) > shownCreatures : false
  const loadMore = () => { if (filter?.kind === 'items') { if (!items.isFetchingNextPage) void items.fetchNextPage() } else setShownCreatures(count => count + pageSize) }
  const pending = filter?.kind === 'items' ? items.isPending : filter ? creatures.isPending : wornItems.isPending && worn.length > 0
  const failure = filter?.kind === 'items' ? items.error : creatures.error
  const total = filter && filter.kind !== 'items' ? creatures.data?.length : undefined

  const placeholder = node ? `Search ${node.label.toLowerCase()}` : 'Search every item'
  const heading = query ? `Matching “${query}”` : node ? path.map(entry => entry.label).join(' › ') : narrowed ? 'Every item' : character ? `${character.name}'s gear` : 'Your gear'
  return (
    <>
      <div className="page-heading">
        <div>
          <h1>Model viewer</h1>
          <p>Items, mounts, and battle pets from your game files in 3D · hover a tile to turn it, click to open it</p>
        </div>
      </div>
      {!ready ? <EmptyState icon={Box} title="Game data isn't ready" description="Prepare local game data in Settings to see models" /> : (
        <div className="model-page">
          <div className="model-page-side">
          <Card as="nav" className="model-page-picker" aria-label="Browse models">
            <label className="model-page-search">
              <Search size={15} aria-hidden="true" />
              <Input value={text} onChange={event => setText(event.target.value)} placeholder={placeholder} aria-label={placeholder} />
            </label>
            {node && (
              <div className="model-page-trail">
                <Button variant="icon" aria-label={path.length > 1 ? `Back to ${path[path.length - 2]!.label}` : 'Back to every category'} onClick={() => browse(path.slice(0, -1))}><ChevronLeft size={16} aria-hidden="true" /></Button>
                <span>{node.label}</span>
              </div>
            )}
            <ul className="model-page-menu" aria-label={node ? `${node.label} categories` : 'Categories'}>
              {(node?.children ?? (node ? [] : categories)).map(child => {
                const Icon = child.icon
                return (
                  <li key={child.id}>
                    <button type="button" className="model-page-category" onClick={() => browse([...path, child])}>
                      <span className="model-page-category-icon" aria-hidden="true"><Icon size={15} /></span>
                      <span>{child.label}</span>
                      {child.children && <ChevronRight size={14} aria-hidden="true" />}
                    </button>
                  </li>
                )
              })}
              {node && !node.children && <li className="muted small model-page-leaf">Showing every {node.label.toLowerCase()}</li>}
            </ul>
          </Card>
          <ModelFilters value={filters} onChange={setFilters} items={filter?.kind !== 'mounts' && filter?.kind !== 'pets'} looks={looks.data} />
          </div>
          <section className="model-page-grid-wrap" aria-label="Models">
            <header className="model-page-grid-head">
              <h2>{!filter && !query ? <Shirt size={15} aria-hidden="true" /> : null}{heading}</h2>
              {total != null && <Badge>{total} {filter?.kind === 'pets' ? 'pets' : 'mounts'}</Badge>}
              {parsed.terms.map(({ word, term }) => <Badge key={word} tone="blue">{term.kind === 'effect' ? 'With effects' : term.kind === 'plain' ? 'Without effects' : term.value[0]!.toUpperCase() + term.value.slice(1)}</Badge>)}
            </header>
            {failure ? <p className="muted small" role="alert">{errorMessage(failure)}</p>
              : pending ? <p className="muted small" role="status">Loading…</p>
                : !tiles.length ? <EmptyState icon={Box} title={filter ? 'Nothing matches' : 'Pick a category'} description={filter ? 'Try another category or search' : 'Browse weapons, armor, mounts, or pets, or sync a character to see what it wears'} />
                  : <TileGrid tiles={tiles} more={!!more} onMore={loadMore} paused={selection.item != null || selection.creature != null} />}
          </section>
        </div>
      )}
      <ModelDialog selection={selection} onClose={() => onSelect({ cat: selection.cat })} />
    </>
  )
}

/** The tiles, asking for the next page when the end of the grid comes into view */
function TileGrid({ tiles, more, onMore, paused }: { tiles: Tile[]; more: boolean; onMore: () => void; paused: boolean }) {
  const end = useRef<HTMLDivElement>(null)
  const grid = useRef<HTMLUListElement>(null)
  // The stage draws only inside the scrolling page area, so tiles never paint over the title bar or sidebar
  const [stage, setStage] = useState<TileStage | null>(null)
  useEffect(() => {
    const made = new TileStage(() => {
      const scroller = grid.current?.closest('.workspace-scroll') ?? document.documentElement
      const rect = scroller.getBoundingClientRect()
      return { left: Math.max(0, rect.left), top: Math.max(0, rect.top), right: Math.min(window.innerWidth, rect.right), bottom: Math.min(window.innerHeight, rect.bottom) }
    })
    setStage(made)
    return () => made.dispose()
  }, [])
  // A dialog covers the grid, so the stage rests while one is open
  useEffect(() => { if (stage) stage.paused = paused }, [stage, paused])
  const latest = useRef(onMore)
  latest.current = onMore
  useEffect(() => {
    const element = end.current
    if (!element || !more) return
    const observer = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) latest.current() }, { rootMargin: '600px' })
    observer.observe(element)
    return () => observer.disconnect()
  }, [more, tiles.length])
  return (
    <TileStageContext.Provider value={stage}>
      <ul ref={grid} className="model-grid">
        {tiles.map(tile => <ModelTile key={tile.key} tile={tile} />)}
      </ul>
      {more && <div ref={end} className="model-grid-end muted small" role="status">Loading more…</div>}
    </TileStageContext.Provider>
  )
}

/** The large viewer for the open item or creature, with its details */
function ModelDialog({ selection, onClose }: { selection: ViewerSelection; onClose: () => void }) {
  const open = selection.item != null || selection.creature != null
  const item = useQuery({ queryKey: ['item', selection.item], queryFn: () => api.getItem(selection.item!), enabled: selection.item != null })
  const shown = selection.item != null ? item.data ?? null : null
  const title = shown?.name ?? selection.label ?? (selection.item != null ? 'Loading…' : 'Creature')
  const external = (url: string) => void api.openExternal(url).catch(error => notify(errorMessage(error)))
  return (
    <Dialog open={open} onOpenChange={next => { if (!next) onClose() }}>
      <DialogContent className="model-dialog w-[min(1120px,calc(100vw-2rem))] sm:max-w-[1120px]">
        <header className="model-page-title">
          <ItemIcon icon={shown?.icon ?? selection.icon ?? null} quality={shown?.quality ?? 1} size="large" />
          <div>
            <DialogTitle className={shown ? `quality-text-${shown.quality}` : undefined}>{title}</DialogTitle>
            <DialogDescription>{shown ? [shown.slot, shown.armor ? shown.armor[0]!.toUpperCase() + shown.armor.slice(1) : null, shown.itemLevel ? `Item level ${shown.itemLevel}` : null].filter(Boolean).join(' · ') : [selection.kind === 'pet' ? 'Battle pet' : 'Mount', selection.note].filter(Boolean).join(' · ')}</DialogDescription>
          </div>
          {shown && <Button className="model-dialog-link" onClick={() => external(wowheadItemUrl(shown.id, {}))}><ExternalLink size={14} aria-hidden="true" />Wowhead</Button>}
        </header>
        <Suspense fallback={<p className="muted small" role="status">Loading the 3D viewer…</p>}>
          {shown ? <ItemModelViewer key={`item-${shown.id}`} target={{ kind: 'item', itemId: shown.id, wearable: wearableTypes.has(shown.inventoryType), ownModel: ownModelTypes.has(shown.inventoryType) }} name={shown.name} />
            : selection.creature != null ? <ItemModelViewer key={`creature-${selection.creature}`} target={{ kind: 'creature', displayId: selection.creature }} name={title} />
              : open ? <p className="muted small" role="status">Loading…</p> : null}
        </Suspense>
      </DialogContent>
    </Dialog>
  )
}
