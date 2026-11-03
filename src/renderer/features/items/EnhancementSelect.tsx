import { useId, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Gem, WandSparkles } from 'lucide-react'
import { Combobox, ComboboxContent, ComboboxInput, ComboboxItem, ComboboxList } from '../../components/ui/combobox'
import type { GearSlot } from '../../../shared/domain'
import type { EnhancementOption } from '../../../shared/gamedata'
import { api } from '../../lib/client'
import { errorMessage } from '../../lib/notify'
import { ItemIcon, useGameData } from './items'
import './enhancement-select.css'

export function EnhancementSelect({ kind, slot, value, onChange, onCommit }: {
  kind: 'enchant' | 'gem'; slot: GearSlot; value: string; onChange: (value: string, selected?: boolean) => void; onCommit: () => void
}) {
  const id = useId()
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const status = useGameData()
  const ready = status.data?.state === 'ready'
  const options = useQuery({ queryKey: ['enhancements', kind, kind === 'enchant' ? slot : null], queryFn: () => api.enhancements({ kind, slot: kind === 'enchant' ? slot : null }), enabled: open && ready })
  const choices = (options.data ?? []).filter(option => option.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))
  const label = kind === 'enchant' ? 'Enchant' : 'Gems'
  const LabelIcon = kind === 'enchant' ? WandSparkles : Gem
  const parts = value.split(',').map(part => part.trim()).filter(Boolean)
  const hasUnfinishedGem = !!search && parts.at(-1)?.toLocaleLowerCase() === search.toLocaleLowerCase()
  const gemLimitReached = parts.length - (hasUnfinishedGem ? 1 : 0) >= 10
  return <div className="field enhancement-field">
    <label htmlFor={id}><LabelIcon size={14} aria-hidden="true" />{label}</label>
    <Combobox<EnhancementOption | string> items={choices} filter={null} value={value} inputValue={value}
      open={open} onOpenChange={(next, details) => { setOpen(next); if (next && details.reason !== 'input-change') setSearch('') }}
      itemToStringLabel={option => typeof option === 'string' ? option : option.name}
      onInputValueChange={(next, details) => {
        // Planned names are allowed; library selection/blur resets must not erase them
        if (details.reason === 'input-change') {
          onChange(next)
          setSearch(kind === 'gem' ? next.split(',').at(-1)?.trim() ?? '' : next)
        } else details.cancel()
      }}
      onValueChange={option => {
        if (!option || typeof option === 'string') return
        if (kind === 'enchant') onChange(option.name, true)
        else {
          const existing = value.split(',').map(part => part.trim()).filter(Boolean)
          // Typing after a comma searches the next gem; replace that unfinished search text
          if (search && existing.at(-1)?.toLocaleLowerCase() === search.toLocaleLowerCase()) existing.pop()
          if (existing.length < 10) onChange([...existing, option.name].join(', '), true)
        }
      }}>
      <ComboboxInput id={id} aria-label={label} maxLength={kind === 'enchant' ? 200 : 2000} placeholder={kind === 'enchant' ? 'Search enchants' : 'Search or add gems'} onBlur={() => { if (!open) onCommit() }} />
      <ComboboxContent className="enhancement-popup">
        {!ready ? <p className="enhancement-status">{status.isError ? 'Could not load game data — type a name or try again' : 'Prepare local game data to search, or type a name'}</p>
          : options.isError ? <p className="enhancement-status" role="alert">{errorMessage(options.error)}</p>
            : options.isPending ? <p className="enhancement-status" role="status">Loading choices…</p>
              : !choices.length ? <p className="enhancement-status">No matching {kind === 'enchant' ? 'enchants for this slot' : 'gems'} — you can type a name</p> : null}
        <ComboboxList>{choices.map(option => <ComboboxItem key={option.itemId} value={option} disabled={kind === 'gem' && gemLimitReached}>
          <ItemIcon icon={option.icon} quality={option.quality} size="small" /><span>{option.name}</span>
        </ComboboxItem>)}</ComboboxList>
      </ComboboxContent>
    </Combobox>
    {kind === 'gem' && <small>Add another gem from the list, or separate typed names with commas</small>}
  </div>
}
