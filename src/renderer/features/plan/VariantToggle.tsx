import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import type { Character, GearItem } from '../../../shared/domain'
import type { TopPlayers } from '../../../shared/top-players'
import { api } from '../../lib/client'
import { Toggle } from '../../components/ui/toggle'
import { ItemIcon, useGameData } from '../items/items'
import './variant-toggle.css'

/**
 * Named variants of the planned item, such as Venomcursed, that add an effect of their own. Only variants seen on a
 * real copy of this item (yours or a top player's) are offered, since the game files don't say which items can roll one
 */
export function VariantToggle({ item, character, top, value, onChange }: { item: GearItem; character: Character; top: TopPlayers | undefined; value: number[]; onChange: (next: number[]) => void }) {
  const ready = useGameData().data?.state === 'ready'
  const seen = [...new Set([
    ...character.gear.filter(gear => gear.itemId === item.itemId).flatMap(gear => gear.bonusIds ?? []),
    ...(top?.players ?? []).flatMap(player => (player.gear ?? []).filter(gear => gear.itemId === item.itemId).flatMap(gear => gear.bonusIds)),
  ])].sort((a, b) => a - b)
  const info = useQuery({ queryKey: ['bonus-info', seen], queryFn: () => api.bonusInfo(seen), enabled: ready && !!item.itemId && seen.length > 0, staleTime: Infinity })
  const variants = seen.flatMap(id => { const variant = info.data?.[id]?.variant; return variant ? [{ id, ...variant }] : [] })
  if (!variants.length) return null
  return <div className="field variant-field">
    <span><Sparkles size={14} aria-hidden="true" />Variant</span>
    {variants.map(variant => {
      const on = value.includes(variant.id)
      return <Toggle key={variant.id} type="button" variant="outline" className="variant-toggle" pressed={on} aria-label={`${variant.name} ${item.name}`}
        onPressedChange={pressed => onChange(pressed ? [...value.filter(id => id !== variant.id), variant.id] : value.filter(id => id !== variant.id))}>
        <ItemIcon icon={variant.icon} size="small" fallback={<Sparkles />} />
        <span><strong>{variant.name}</strong><small>{variant.effect}</small></span>
      </Toggle>
    })}
    <small>Seen on a copy of this item · the simulation adds its effect</small>
  </div>
}
