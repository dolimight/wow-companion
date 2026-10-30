import { useEffect, useState } from 'react'
import { useBlocker } from '@tanstack/react-router'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Save, Search, Shirt, Trash2, X } from 'lucide-react'
import { outfitSchema, type AppearanceSlot, type Character, type Outfit } from '../../../shared/domain'
import { armorForClass } from '../../../shared/gamedata'
import { AppSelect } from '../../components/AppSelect'
import { Badge, Button, EmptyState, Field, Sheet } from '../../components/ui/primitives'
import { ItemIcon } from '../items/ItemIcon'
import { api } from '../../lib/client'
import { assetUrl } from '../../lib/assets'
import { errorMessage, notify } from '../../lib/notify'
import { OutfitTools } from './OutfitTools'
import {ModelStage} from '../model-stage/ModelStage'
import { useUpdateBlocker } from '../../lib/update-safety'
import './outfits.css'

const editableSlots: Array<{ value: AppearanceSlot; label: string }> = [{ value: 'head', label: 'Head' }, { value: 'shoulder', label: 'Shoulders' }, { value: 'shoulderLeft', label: 'Left shoulder' }, { value: 'shoulderRight', label: 'Right shoulder' }, { value: 'back', label: 'Cloak' }, { value: 'chest', label: 'Chest' }, { value: 'shirt', label: 'Shirt' }, { value: 'wrist', label: 'Wrists' }, { value: 'hands', label: 'Hands' }, { value: 'waist', label: 'Waist' }, { value: 'legs', label: 'Legs' }, { value: 'feet', label: 'Feet' }, { value: 'tabard', label: 'Tabard' }, { value: 'mainHand', label: 'Main hand' }, { value: 'offHand', label: 'Off hand' }]
function newOutfit(character: Character): Outfit { return outfitSchema.parse({ id: crypto.randomUUID(), characterId: character.id, name: 'Untitled outfit', slots: {}, updatedAt: new Date().toISOString() }) }

export function WardrobePage({ character }: { character: Character }) {
  const queryClient = useQueryClient()
  const query = useQuery({ queryKey: ['outfits', character.id], queryFn: () => api.listOutfits({ characterId: character.id }) })
  const [draft, setDraft] = useState<Outfit | null>(null)
  const [dirty, setDirty] = useState(false)
  useUpdateBlocker(dirty, 'Save or discard your outfit before restarting')
  const [pending, setPending] = useState<Outfit | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [modelOpen,setModelOpen]=useState(false)
  const [slot, setSlot] = useState<AppearanceSlot>('head')
  const [searchOpen, setSearchOpen] = useState(false)
  const [text, setText] = useState('')
  const [debounced, setDebounced] = useState('')
  const render = assetUrl(character.renders?.main)
  const blocker = useBlocker({ shouldBlockFn: () => dirty, enableBeforeUnload: dirty, withResolver: true })
  const save = useMutation({ mutationFn: (value: Outfit) => api.saveOutfit(value), onSuccess: value => { if (value.characterId === character.id) { setDraft(value); setDirty(false) } void queryClient.invalidateQueries({ queryKey: ['outfits', value.characterId] }); notify('Outfit saved') }, onError: error => notify(errorMessage(error)) })
  const remove = useMutation({ mutationFn: (id: string) => api.deleteOutfit({ id }), onSuccess: (_, id) => { const remaining = (query.data ?? []).filter(outfit => outfit.id !== id); queryClient.setQueryData(['outfits', character.id], remaining); setDraft(remaining[0] ?? null); setDirty(false); setDeleting(false); void queryClient.invalidateQueries({ queryKey: ['outfits', character.id] }); notify('Outfit deleted') }, onError: error => notify(errorMessage(error)) })
  useEffect(() => { setDraft(null); setDirty(false); setPending(null); setDeleting(false); setSearchOpen(false) }, [character.id])
  useEffect(() => { if (!draft && !dirty && query.data?.length) setDraft(query.data[0]!) }, [query.data, draft, dirty])
  useEffect(() => { const timer = setTimeout(() => setDebounced(text), 160); return () => clearTimeout(timer) }, [text])
  const options = useQuery({ queryKey: ['outfit-appearances', character.id, character.className, slot, debounced], queryFn: () => api.appearanceOptions({ slot, text: debounced, armor: armorForClass(character.className) }), enabled: searchOpen })
  function change(value: Outfit) { setDraft(value); setDirty(true); setDeleting(false) }
  function choose(value: Outfit) { if (save.isPending || remove.isPending || draft?.id === value.id) return; if (dirty) { setPending(value); return } setDraft(value); setDeleting(false) }
  function create() { if (save.isPending || remove.isPending) return; const value = newOutfit(character); if (dirty) setPending(value); else change(value) }
  function observedLook() {
    if (!draft) return
    if (!Object.keys(character.observedTransmog).length) { notify('No observed transmog is available for this character'); return }
    change({ ...draft, slots: Object.fromEntries(Object.entries(character.observedTransmog).map(([slot, entry]) => [slot, { appearanceId: null, modifiedAppearanceId: entry!.modifiedAppearanceId, itemId: entry!.itemId, variantKey: null, source: 'Observed transmog' }])), updatedAt: new Date().toISOString() })
  }
  return <section className="wardrobe-page" aria-label={`${character.name} wardrobe`}>
    <div className="wardrobe-page-heading page-heading"><div><h1>Wardrobe</h1><p>Plan appearances for {character.name}, then preview them in WoW</p></div><Button onClick={create}><Plus size={14} />New outfit</Button></div>
    <details className="wardrobe-model-details" onToggle={event=>setModelOpen(event.currentTarget.open)}><summary>Inspect a 3D model</summary>{modelOpen&&<ModelStage key={character.id} characterId={character.id}/>}</details>
    {(pending || blocker.status === 'blocked') && <div className="wardrobe-unsaved" role="alert"><p>This outfit has unsaved changes</p><div className="actions"><Button onClick={() => { setPending(null); if (blocker.status === 'blocked') blocker.reset() }}>Keep editing</Button><Button onClick={() => { setDirty(pending ? !query.data?.some(outfit => outfit.id === pending.id) : false); if (pending) { setDraft(pending); setPending(null) } if (blocker.status === 'blocked') blocker.proceed() }}>Discard changes</Button></div></div>}
    {query.isError ? <div role="alert"><p>{errorMessage(query.error)}</p><Button onClick={() => void query.refetch()}>Try again</Button></div> : query.isPending ? <p className="muted" role="status">Loading outfits…</p> : <div className="wardrobe-workspace">
      <aside className="wardrobe-outfit-list" aria-label="Saved outfits">{query.data.length ? query.data.map(outfit => <button type="button" className={`wardrobe-outfit-choice ${draft?.id === outfit.id ? 'selected' : ''}`} aria-pressed={draft?.id === outfit.id} key={outfit.id} onClick={() => choose(outfit)}><Shirt size={16} /><span>{outfit.name}<small>{Object.keys(outfit.slots).length} planned appearances</small></span></button>) : <p className="muted">No saved outfits yet</p>}{dirty && draft && !query.data.some(outfit => outfit.id === draft.id) && <p className="wardrobe-draft-note">New outfit · Unsaved</p>}</aside>
      {!draft ? <EmptyState icon={Shirt} title="Start an outfit" description="Choose appearances from your local item data and keep an acquisition checklist"><Button variant="primary" onClick={create}>Create outfit</Button></EmptyState> : <fieldset className="wardrobe-editor" aria-label="Outfit editor" disabled={save.isPending || remove.isPending}>
        <div className="wardrobe-editor-heading"><Field label="Outfit name"><input value={draft.name} maxLength={100} onChange={event => change({ ...draft, name: event.currentTarget.value, updatedAt: new Date().toISOString() })} /></Field><div className="actions">{dirty && <Badge tone="amber">Unsaved</Badge>}<Button variant="primary" disabled={save.isPending || !draft.name.trim() || !dirty} onClick={() => save.mutate(outfitSchema.parse(draft))}><Save size={14} />{save.isPending ? 'Saving…' : 'Save outfit'}</Button><Button variant="icon" aria-label="Delete outfit" disabled={remove.isPending || !query.data.some(outfit => outfit.id === draft.id)} onClick={() => setDeleting(value => !value)}><Trash2 size={16} /></Button></div></div>
        {deleting && <div className="wardrobe-delete-confirm" role="alert"><p>Delete “{draft.name}” from your saved outfits?</p><div className="actions"><Button onClick={() => setDeleting(false)}>Keep outfit</Button><Button disabled={remove.isPending} onClick={() => remove.mutate(draft.id)}>{remove.isPending ? 'Deleting…' : 'Delete outfit'}</Button></div></div>}
        <div className="wardrobe-editor-body"><div className="wardrobe-slot-editor"><div className="wardrobe-slot-toolbar"><AppSelect aria-label="Appearance slot" value={slot} options={editableSlots} onValueChange={value => setSlot(value as AppearanceSlot)} /><Button onClick={() => { setText(''); setSearchOpen(true) }}><Search size={14} />Find appearance</Button><Button variant="quiet" disabled={!Object.keys(character.observedTransmog).length} onClick={observedLook}>Use observed look</Button></div>
          <ul className="wardrobe-planned-slots">{editableSlots.filter(entry => draft.slots[entry.value] || draft.hiddenSlots.includes(entry.value)).map(entry => <li key={entry.value}><div><strong>{entry.label}</strong><span>{draft.hiddenSlots.includes(entry.value) ? 'Hidden' : draft.slots[entry.value]?.source ?? 'Planned appearance'}</span><small>{draft.slots[entry.value]?.modifiedAppearanceId ? `Appearance source ${draft.slots[entry.value]?.modifiedAppearanceId}` : 'Exact appearance source unknown'}</small></div><Button variant="quiet" onClick={() => { setSlot(entry.value); setText(''); setSearchOpen(true) }}>Change</Button><Button variant="icon" aria-label={`Remove ${entry.label}`} onClick={() => { const slots = { ...draft.slots }; delete slots[entry.value]; change({ ...draft, slots, hiddenSlots: draft.hiddenSlots.filter(slot => slot !== entry.value), acquisitionTargets: draft.acquisitionTargets.filter(target => target.slot !== entry.value), updatedAt: new Date().toISOString() }) }}><X size={14} /></Button></li>)}</ul>
          {!Object.keys(draft.slots).length && !draft.hiddenSlots.length && <p className="wardrobe-appearance-empty">Choose a slot and find an appearance to begin</p>}
        </div><aside className="wardrobe-character-preview">{render ? <img src={render} alt={`${character.name} official character render`} /> : <div className="wardrobe-no-render"><Shirt size={38} strokeWidth={1.4} /><p>No character render is available</p></div>}<p>Observed character render</p><small>This image does not change with your outfit plan<br />Use the in-game preview for planned pieces</small></aside></div>
        <OutfitTools key={draft.id} character={character} outfit={draft} onChange={change} />
      </fieldset>}
    </div>}
    <Sheet open={searchOpen} onOpenChange={setSearchOpen} title={`Choose ${editableSlots.find(entry => entry.value === slot)?.label.toLowerCase() ?? 'appearance'}`} description="Appearances from your installed item data, filtered to the selected slot and armor type">
      <Field label="Search appearances"><input autoFocus value={text} maxLength={100} onChange={event => setText(event.currentTarget.value)} placeholder="Search by item name" /></Field><p className="muted small">Race, body, and character requirements are checked by the in-game preview</p>
      {options.isError ? <div role="alert"><p>{errorMessage(options.error)}</p><Button onClick={() => void options.refetch()}>Try again</Button></div> : options.isFetching ? <p role="status">Searching appearances…</p> : !options.data?.length ? <p className="muted">No appearances found — check that local game data is ready or try another name</p> : <ul className="wardrobe-appearance-results">{options.data.map(appearance => <li key={`${appearance.modifiedAppearanceId}:${appearance.itemId}`}><button type="button" onClick={() => { if (!draft) return; change({ ...draft, slots: { ...draft.slots, [slot]: { appearanceId: appearance.appearanceId, modifiedAppearanceId: appearance.modifiedAppearanceId, itemId: appearance.itemId, variantKey: null, source: appearance.itemName } }, hiddenSlots: draft.hiddenSlots.filter(value => value !== slot), updatedAt: new Date().toISOString() }); setSearchOpen(false) }}><ItemIcon icon={appearance.icon} quality={appearance.quality} /><span><strong>{appearance.itemName}</strong><small>Appearance source {appearance.modifiedAppearanceId} · Ownership checked separately</small></span></button></li>)}</ul>}
    </Sheet>
  </section>
}
