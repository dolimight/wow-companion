import { useQuery } from '@tanstack/react-query'
import { FlaskConical } from 'lucide-react'
import type { GearItem } from '../../../shared/domain'
import { api } from '../../lib/client'
import { iconUrl } from '../../lib/assets'
import { AppSelect } from '../../components/AppSelect'
import { useGameData } from '../items/items'
import './variant-toggle.css'

const NONE = 'none'
type Choice = { catalyzedFrom: GearItem['catalyzedFrom']; variantBonusIds: number[] }

/**
 * Which item a tier piece is catalyzed from. Only this season's items whose drops carry a cantrip (such as Void
 * Eruption) are offered, since catalyzing one keeps its cantrip on the tier piece
 */
export function CatalystSelect({ item, onChange }: { item: GearItem; onChange: (choice: Choice) => void }) {
  const ready = useGameData().data?.state === 'ready'
  const sources = useQuery({ queryKey: ['catalyst-sources', item.itemId], queryFn: () => api.catalystSources(item.itemId!), enabled: ready && !!item.itemId, staleTime: Infinity })
  if (!sources.data?.length) return null
  // A variant planned before sources existed points at the source whose cantrip it is
  const chosen = sources.data.find(source => source.itemId === item.catalyzedFrom?.itemId) ?? sources.data.find(source => source.variants.some(variant => item.variantBonusIds?.includes(variant.bonusId)))
  const options = [
    { value: NONE, label: 'Not catalyzed · no cantrip' },
    ...sources.data.map(source => ({ value: String(source.itemId), label: `${source.name} · ${source.variants.map(variant => variant.name).join(', ')}`, image: source.icon ? iconUrl(source.icon) ?? undefined : undefined })),
  ]
  return <div className="field variant-field">
    <span><FlaskConical size={14} aria-hidden="true" />Catalyzed from</span>
    <AppSelect aria-label="Catalyzed from" value={chosen ? String(chosen.itemId) : NONE} options={options} onValueChange={value => {
      const source = sources.data!.find(entry => String(entry.itemId) === value)
      onChange(source ? { catalyzedFrom: { itemId: source.itemId, name: source.name }, variantBonusIds: source.variants.map(variant => variant.bonusId) } : { catalyzedFrom: null, variantBonusIds: [] })
    }} />
    <small>{chosen ? chosen.variants.map(variant => `${variant.name}: ${variant.effect}`).join(' · ') : 'Catalyzing an item with a cantrip keeps the cantrip on your tier piece'}</small>
  </div>
}
