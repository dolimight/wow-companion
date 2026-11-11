import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Sparkles } from 'lucide-react'
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from '../../components/ui/combobox'
import type { GearItem } from '../../../shared/domain'
import type { EmbellishmentOption } from '../../../shared/gamedata'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { ItemIcon, useGameData } from '../items/items'
import '../items/enhancement-select.css'
import './embellishment-select.css'

type Planned = NonNullable<GearItem['embellishment']>
const NONE = '__none__'

/**
 * Whether a reagent's recipe group covers this item, read from the game's wording: armor, weapons and off-hands,
 * accessories, boots, guns, or any equipment. A profession name in the group limits it to that profession's crafts
 */
export function embellishmentFits(applies: string | null, item: { classId?: number; subclassId?: number; inventoryType: number }) {
  if (!applies) return true
  const weaponish = item.classId === 2 || item.inventoryType === 14 || item.inventoryType === 23
  if (/guns/i.test(applies)) return item.classId === 2 && item.subclassId === 3
  if (/boots/i.test(applies)) return item.inventoryType === 8
  if (/accessories/i.test(applies)) return [2, 11, 12].includes(item.inventoryType)
  if (/equipment/i.test(applies)) return true
  return (/armor/i.test(applies) && item.classId === 4 && !weaponish) || (/weapon|off-hand/i.test(applies) && weaponish)
}
/** The profession a reagent is limited to, as in Midnight Engineering Crafted Equipment */
export const embellishmentProfession = (applies: string | null) => applies?.match(/^Midnight (\w+) /)?.[1] ?? null

/** Picks the embellishment for a crafted item, each shown with its effect at the planned level */
export function EmbellishmentSelect({ item, itemLevel, value, onChange }: {
  item: { id: number; classId?: number; subclassId?: number; inventoryType: number }
  itemLevel: number | null
  value: Planned | null | undefined
  onChange: (value: Planned | null) => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const status = useGameData()
  const ready = status.data?.state === 'ready'
  const options = useQuery({ queryKey: ['embellishments', item.id, itemLevel], queryFn: () => api.embellishments({ itemId: item.id, itemLevel }), enabled: ready, staleTime: Infinity })
  const fitting = (options.data ?? []).filter(option => embellishmentFits(option.applies, item))
  const choices = fitting.filter(option => !search || option.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()) || option.effect.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const selected = fitting.find(option => option.name === value?.name)
  return <div className="field enhancement-field embellishment-field">
    <label htmlFor={id}><Sparkles size={14} aria-hidden="true" />Embellishment</label>
    <Combobox<EmbellishmentOption | string> items={[NONE, ...choices]} filter={null} value={selected ?? value?.name ?? ''} inputValue={open ? search : value?.name ?? ''}
      open={open} onOpenChange={next => { setOpen(next); if (next) setSearch('') }}
      itemToStringLabel={option => typeof option === 'string' ? (option === NONE ? '' : option) : option.name}
      onInputValueChange={(next, details) => { if (details.reason === 'input-change') setSearch(next); else details.cancel() }}
      onValueChange={option => {
        if (option === NONE) onChange(null)
        else if (option && typeof option !== 'string') onChange({ name: option.name, itemId: option.itemId, limit: option.limit })
        setOpen(false)
      }}>
      <ComboboxInput id={id} aria-label="Embellishment" placeholder="No embellishment" />
      <ComboboxContent className="enhancement-popup embellishment-popup">
        {!ready ? <p className="enhancement-status">Prepare local game data to see embellishments</p>
          : options.isError ? <p className="enhancement-status" role="alert">{errorMessage(options.error)}</p>
            : options.isPending ? <p className="enhancement-status" role="status">Loading embellishments…</p>
              : !fitting.length ? <p className="enhancement-status">Rebuild local game data in Settings to list this season's embellishments</p>
                : !choices.length ? <p className="enhancement-status">No embellishment matches “{search}”</p> : null}
        <ComboboxList>
          {value && <ComboboxItem value={NONE}><span className="embellishment-none">No embellishment</span></ComboboxItem>}
          {choices.map(option => <ComboboxItem key={option.itemId} value={option}>
            <ItemIcon icon={option.icon} quality={option.quality} size="small" />
            <span className="embellishment-choice">
              <strong>{option.name}</strong>
              <span>{option.effect}</span>
              {(option.limit !== 'Embellished' || !option.complete || embellishmentProfession(option.applies)) && <small>{[embellishmentProfession(option.applies) ? `${embellishmentProfession(option.applies)} crafts only` : null, option.limit !== 'Embellished' ? `${option.limit} · 1 allowed` : null, !option.complete ? 'Some values unknown' : null].filter(Boolean).join(' · ')}</small>}
            </span>
          </ComboboxItem>)}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
    {selected ? <small>{selected.effect}</small> : value ? <small>{value.name}</small> : <small>Crafted gear can carry one · up to 2 embellished items can be worn</small>}
  </div>
}
