import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gem, WandSparkles } from 'lucide-react'
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from '../../components/ui/combobox'
import type { GearSlot } from '../../../shared/domain'
import type { EnhancementOption } from '../../../shared/gamedata'
import { socketLabel, type ItemSockets } from '../../../shared/sockets'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { ItemIcon, useGameData } from './items'
import { ItemHoverCard } from './ItemHoverCard'
import './enhancement-select.css'

/** One searchable enhancement; typed names are kept as planned even when the library doesn't list them */
function EnhancementPicker({ id, kind, slot, label, value, placeholder, disabled, runeforging = false, onChange, onCommit }: {
  id?: string; kind: 'enchant' | 'gem'; slot: GearSlot; label: string; value: string; placeholder: string; disabled?: boolean; runeforging?: boolean
  onChange: (value: string, selected?: boolean) => void; onCommit: () => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const [keyboardPreview, setKeyboardPreview] = useState<number | null>(null)
  const status = useGameData()
  const ready = status.data?.state === 'ready'
  const options = useQuery({ queryKey: ['enhancements', kind, kind === 'enchant' ? slot : null, runeforging], queryFn: () => api.enhancements({ kind, slot: kind === 'enchant' ? slot : null, runeforging }), enabled: open && ready })
  const choices = (options.data ?? []).filter(option => option.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  return <Combobox<EnhancementOption | string> items={choices} filter={null} value={value} inputValue={value}
    open={open} onOpenChange={(next, details) => { setOpen(next); if (!next) setKeyboardPreview(null); if (next && details.reason !== 'input-change') setSearch('') }}
    onItemHighlighted={(option, details) => setKeyboardPreview(details.reason === 'keyboard' && option && typeof option !== 'string' ? option.itemId : null)}
    itemToStringLabel={option => typeof option === 'string' ? option : option.name}
    onInputValueChange={(next, details) => {
      // Planned names are allowed; library selection/blur resets must not erase them
      if (details.reason === 'input-change') { onChange(next); setSearch(next) } else details.cancel()
    }}
    onValueChange={option => { if (option && typeof option !== 'string') onChange(option.name, true) }}>
    <ComboboxInput id={id} aria-label={label} disabled={disabled} maxLength={200} placeholder={placeholder} onBlur={() => { if (!open) onCommit() }} />
    <ComboboxContent className="enhancement-popup">
      {!ready ? <p className="enhancement-status">{status.isError ? 'Could not load game data — type a name or try again' : 'Prepare local game data to search, or type a name'}</p>
        : options.isError ? <p className="enhancement-status" role="alert">{errorMessage(options.error)}</p>
          : options.isPending ? <p className="enhancement-status" role="status">Loading choices…</p>
            : !choices.length ? <p className="enhancement-status">No matching {kind === 'enchant' ? 'enchants for this slot' : 'gems'} — you can type a name</p> : null}
      <ComboboxList>{choices.map(option => <ItemHoverCard key={option.itemId} enhancement={{ ...option, kind }} active={open && keyboardPreview === option.itemId} onDismiss={() => setKeyboardPreview(null)}><ComboboxItem value={option}>
        <ItemIcon icon={option.icon} quality={option.quality} size="small" /><span>{option.name}</span>
      </ComboboxItem></ItemHoverCard>)}</ComboboxList>
    </ComboboxContent>
  </Combobox>
}

export function EnhancementSelect({ kind, slot, value, onChange, onCommit, sockets = null, enchantable = null, runeforging = false }: {
  kind: 'enchant' | 'gem'; slot: GearSlot; value: string; onChange: (value: string, selected?: boolean) => void; onCommit: () => void
  /** The planned item's sockets; without them up to 10 gems can be planned */
  sockets?: ItemSockets | null
  /** False when this season has no enchant for the slot */
  enchantable?: boolean | null
  /** A Death Knight, whose weapons also take runeforges */
  runeforging?: boolean
}) {
  const id = useId()
  const LabelIcon = kind === 'enchant' ? WandSparkles : Gem
  if (kind === 'enchant') {
    const noEnchant = enchantable === false && !value.trim()
    return <div className="field enhancement-field">
      <label htmlFor={id}><LabelIcon size={14} aria-hidden="true" />Enchant</label>
      <EnhancementPicker id={id} kind="enchant" slot={slot} label="Enchant" value={value} disabled={noEnchant} runeforging={runeforging} placeholder={noEnchant ? "Can't be enchanted" : 'Search enchants'} onChange={onChange} onCommit={onCommit} />
      {enchantable === false && <small>This season has no enchant for this slot</small>}
    </div>
  }
  // Each socket gets its own picker; planned gems keep their order and the value stays a comma-separated list
  const parts = value.split(',').map(part => part.trim())
  const filled = parts.filter(Boolean)
  const limit = sockets ? sockets.sockets + sockets.addable : 10
  // Without known sockets, one empty picker waits for the next gem
  const count = sockets ? Math.max(limit, filled.length) : Math.min(10, filled.length + 1)
  const pickers = Array.from({ length: count }, (_, index) => parts[index] ?? '')
  const write = (index: number, next: string, selected?: boolean) => {
    const values = [...pickers]
    values[index] = next.replace(/,/g, ' ').trim() ? next.replace(/,/g, ' ') : ''
    // Trailing empty sockets are dropped; empties in between keep later gems in their socket
    while (values.length && !values.at(-1)!.trim()) values.pop()
    onChange(values.join(', '), selected)
  }
  return <div className="field enhancement-field">
    <label htmlFor={`${id}-0`}><LabelIcon size={14} aria-hidden="true" />Gems</label>
    {count === 0
      ? <EnhancementPicker id={`${id}-0`} kind="gem" slot={slot} label="Gems" value="" disabled placeholder="No sockets" onChange={() => {}} onCommit={onCommit} />
      : <div className="enhancement-sockets">{pickers.map((part, index) => {
        const added = !!sockets && index >= sockets.sockets && index < limit
        const label = count === 1 ? 'Gem' : `Gem ${index + 1}`
        return <EnhancementPicker key={index} id={`${id}-${index}`} kind="gem" slot={slot} label={added ? `${label}, added socket` : label} value={part}
          placeholder={added ? 'Added socket' : 'Search gems'} onChange={(next, selected) => write(index, next, selected)} onCommit={onCommit} />
      })}</div>}
    {sockets ? <small>{socketLabel(sockets)}{sockets.exact ? '' : ' · as this item usually drops'}</small> : <small>Sockets unknown · pick a gem to add another</small>}
  </div>
}
