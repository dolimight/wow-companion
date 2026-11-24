import { useDeferredValue, useMemo, useRef, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { Search, Shirt } from 'lucide-react'
import type { AppearanceSlot, Character } from '../../../shared/domain'
import { armorForClass, qualityNames, type AppearanceOption, type ItemSearch } from '../../../shared/gamedata'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { AppSelect } from '../../components/AppSelect'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../../components/ui/dialog'
import { Input } from '../../components/ui/input'
import { Button, EmptyState } from '../../components/ui/primitives'
import { useGameData } from '../items/items'
import { expansionNames } from '../model-viewer/ModelFilters'
import type { Tile } from '../model-viewer/ModelTile'
import { TileGrid } from '../model-viewer/TileGrid'

const sources = [{ value: 'any', label: 'Any source' }, { value: 'raid', label: 'Raid' }, { value: 'dungeon', label: 'Dungeon' }, { value: 'crafted', label: 'Crafted' }] as const

export function AppearancePicker({ slot, label, character, onClose, onPick }: {
  slot: AppearanceSlot
  label: string
  character: Character
  onClose: () => void
  onPick: (appearance: AppearanceOption) => void
}) {
  const [text, setText] = useState('')
  const term = useDeferredValue(text.trim())
  const [quality, setQuality] = useState('any')
  const [source, setSource] = useState<NonNullable<ItemSearch['source']>>('any')
  const [expansion, setExpansion] = useState('any')
  const host = useRef<HTMLDivElement>(null)
  const { data: gameData } = useGameData()
  const ready = gameData?.state === 'ready'
  const filters = { slot, text: term, armor: armorForClass(character.className), source, quality: quality === 'any' ? null : Number(quality), expansion: expansion === 'any' ? null : Number(expansion) }
  const appearances = useInfiniteQuery({
    queryKey: ['outfit-appearances', gameData?.indexedVersion, filters],
    queryFn: ({ pageParam }) => api.appearanceOptions({ ...filters, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: page => page.nextOffset ?? undefined,
    enabled: ready,
  })
  const lookKey = JSON.stringify([gameData?.indexedVersion, character.raceId, character.sex, character.customization])
  const tiles = useMemo(() => {
    const seen = new Set<number>()
    return (appearances.data?.pages ?? []).flatMap(page => page.items.flatMap((appearance): Tile[] => {
      if (seen.has(appearance.appearanceId)) return []
      seen.add(appearance.appearanceId)
      return [{
        key: String(appearance.modifiedAppearanceId),
        name: appearance.itemName,
        quality: appearance.quality,
        icon: appearance.icon,
        detail: qualityNames[appearance.quality] ?? '',
        target: { kind: 'appearance', characterId: character.id, lookKey, piece: { slot, itemId: appearance.itemId, appearanceId: appearance.appearanceId, modifiedAppearanceId: appearance.modifiedAppearanceId } },
        open: () => onPick(appearance),
        actionLabel: `Choose ${appearance.itemName}`,
      }]
    }))
  }, [appearances.data, character.id, lookKey, onPick, slot])
  const more = () => { if (appearances.hasNextPage && !appearances.isFetchingNextPage) void appearances.fetchNextPage() }
  return <Dialog open onOpenChange={open => { if (!open) onClose() }}>
    <DialogContent className="appearance-picker sm:max-w-[min(960px,calc(100vw-2rem))]">
      <DialogHeader>
        <DialogTitle>Choose {label.toLowerCase()} appearance</DialogTitle>
        <DialogDescription>Select a tile to add the appearance to your outfit</DialogDescription>
      </DialogHeader>
      <div className="appearance-picker-filters">
        <label className="model-page-search"><Search size={15} aria-hidden="true" />
          <Input autoFocus aria-label="Search appearances" placeholder="Search by item name" maxLength={100} value={text} onChange={event => setText(event.currentTarget.value)} />
        </label>
        <AppSelect label="Expansion" value={expansion} onValueChange={setExpansion} options={[{ value: 'any', label: 'Any expansion' }, ...expansionNames.map((name, i) => ({ value: String(i), label: name })).reverse()]} />
        <AppSelect label="Quality" value={quality} onValueChange={setQuality} options={[{ value: 'any', label: 'Any quality' }, ...qualityNames.map((name, i) => ({ value: String(i), label: name }))]} />
        <AppSelect label="Source" value={source} onValueChange={value => setSource(value as typeof source)} options={sources} />
      </div>
      <div className="appearance-picker-stage" ref={host}>
        <div className="appearance-picker-results" key={JSON.stringify(filters)}>
          {!ready ? <EmptyState icon={Shirt} title="Game data isn’t ready" description="Prepare local game data in Settings to browse appearances" />
            : appearances.isPending ? <p className="muted small" role="status">Searching appearances…</p>
              : appearances.isError && !tiles.length ? <div role="alert"><p>{errorMessage(appearances.error)}</p><Button onClick={() => void appearances.refetch()}>Try again</Button></div>
                : !tiles.length && !appearances.hasNextPage ? <EmptyState icon={Shirt} title="No matching appearances" description="Try a different item name or filter" />
                  : <>
                    <TileGrid tiles={tiles} host={host} more={false} onMore={more} />
                    {appearances.hasNextPage && <Button disabled={appearances.isFetchingNextPage} onClick={more}>{appearances.isFetchingNextPage ? 'Loading…' : appearances.isFetchNextPageError ? 'Retry loading more' : 'Load more appearances'}</Button>}
                  </>}
        </div>
      </div>
    </DialogContent>
  </Dialog>
}
