import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { FlaskConical, Sparkles, X } from 'lucide-react'
import type { Character, GearItem, GearSlot } from '../../../shared/domain'
import { api } from '../../lib/client'
import { Button } from '../../components/ui/primitives'
import { ItemIcon, ItemSearchDialog, useGameData } from '../items/items'
import './variant-toggle.css'

type Choice = { catalyzedFrom: GearItem['catalyzedFrom']; variantBonusIds: number[] }

/**
 * Which item a tier piece is catalyzed from, picked in the item search limited to the bases the Catalyst accepts. The
 * tier piece keeps that base's secondary stats and any cantrip its drop carries (such as Void Eruption), and the plan
 * simulation uses both
 */
export function CatalystSelect({ item, slot, character, onChange }: { item: GearItem; slot: GearSlot; character: Character; onChange: (choice: Choice) => void }) {
  const [open, setOpen] = useState(false)
  const ready = useGameData().data?.state === 'ready'
  const sources = useQuery({ queryKey: ['catalyst-sources', item.itemId], queryFn: () => api.catalystSources(item.itemId!), enabled: ready && !!item.itemId, staleTime: Infinity })
  const allow = useMemo(() => new Set((sources.data ?? []).map(source => source.itemId)), [sources.data])
  if (!sources.data?.length) return null
  const byId = new Map(sources.data.map(source => [source.itemId, source]))
  // A variant planned before bases could be chosen points at the base whose cantrip it is
  const chosen = (item.catalyzedFrom ? byId.get(item.catalyzedFrom.itemId) : undefined) ?? sources.data.find(source => source.variants.some(variant => item.variantBonusIds?.includes(variant.bonusId)))
  return <div className="field variant-field">
    <span><FlaskConical size={14} aria-hidden="true" />Catalyzed from</span>
    <div className="catalyst-choice">
      <Button variant="secondary" className="catalyst-pick" onClick={() => setOpen(true)} aria-label={chosen ? `Catalyzed from ${chosen.name}, change base item` : 'Choose the item this is catalyzed from'}>
        {chosen ? <><ItemIcon icon={chosen.icon} quality={chosen.quality} size="small" /><span>{chosen.name}</span></> : <><FlaskConical size={14} aria-hidden="true" /><span>Not catalyzed · choose a base item</span></>}
      </Button>
      {chosen && <Button variant="icon" aria-label="Not catalyzed" onClick={() => onChange({ catalyzedFrom: null, variantBonusIds: [] })}><X size={16} /></Button>}
    </div>
    <small>{chosen ? [chosen.stats.length ? `Keeps its ${chosen.stats.join(' and ')}` : null, ...chosen.variants.map(variant => `${variant.name}: ${variant.effect}`)].filter(Boolean).join(' · ') : "A catalyzed tier piece keeps its base item's secondary stats and cantrip"}</small>
    <ItemSearchDialog open={open} onOpenChange={setOpen} character={character} slot={slot} title={`Catalyze into ${item.name}`} addLabel="Catalyze from this" allow={allow}
      emptyText="No base matches · the Catalyst takes this season's items of the same slot and armor type, not crafted ones"
      annotate={result => { const source = byId.get(result.id); return source ? <>
        {source.stats.length > 0 && <small>Keeps {source.stats.join(' and ')}</small>}
        {source.variants.map(variant => <small key={variant.bonusId} className="item-result-effect"><Sparkles aria-hidden="true" /><span><strong>{variant.name}:</strong> {variant.effect}</span></small>)}
      </> : null }}
      onPick={picked => { const source = byId.get(picked.id); if (source) onChange({ catalyzedFrom: { itemId: source.itemId, name: source.name }, variantBonusIds: source.variants.map(variant => variant.bonusId) }) }} />
  </div>
}
