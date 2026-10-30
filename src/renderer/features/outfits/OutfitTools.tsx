import { useMemo, useState } from 'react'
import { Check, Copy, ExternalLink, EyeOff, Import, Info } from 'lucide-react'
import type { AppearanceSlot, Character, Outfit } from '../../../shared/domain'
import { appearanceObservationFromCharacter, applyOutfitTransport, decodeOutfitTransport, encodeOutfitTransport, evaluateOutfitOwnership } from '../../../shared/outfits'
import { Badge, Button, Field } from '../../components/ui/primitives'
import { Toggle } from '../../components/ui/toggle'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import './outfits.css'

const slotNames: Partial<Record<AppearanceSlot, string>> = { head: 'Head', shoulder: 'Shoulders', shoulderLeft: 'Left shoulder', shoulderRight: 'Right shoulder', back: 'Cloak', chest: 'Chest', shirt: 'Shirt', wrist: 'Wrists', hands: 'Hands', waist: 'Waist', legs: 'Legs', feet: 'Feet', tabard: 'Tabard', mainHand: 'Main hand', offHand: 'Off hand' }
const hiddenOptions: AppearanceSlot[] = ['head', 'shoulder', 'back', 'chest', 'shirt', 'wrist', 'hands', 'waist', 'legs', 'feet', 'tabard', 'mainHand', 'offHand']
const statuses = { collected: 'Collected', missing: 'To collect', unknown: 'Ownership unknown', hidden: 'Hidden' } as const

/** Extends the existing wardrobe editor; its parent retains save/dirty-state ownership */
export function OutfitTools({ character, outfit, onChange }: { character: Character; outfit: Outfit | null; onChange: (outfit: Outfit) => void }) {
  const [paste, setPaste] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ownership = useMemo(() => outfit ? evaluateOutfitOwnership(outfit, [appearanceObservationFromCharacter(character)]) : [], [character, outfit])
  const encoded = useMemo(() => {
    if (!outfit) return { code: '', error: null }
    try { return { code: encodeOutfitTransport(outfit), error: null } } catch (error) { return { code: '', error: errorMessage(error) } }
  }, [outfit])
  if (!outfit) return null
  const hidden = new Set(outfit.hiddenSlots)
  const collected = ownership.filter(slot => slot.state === 'collected').length
  const wanted = ownership.filter(slot => slot.state !== 'hidden').length
  function importCode() {
    try {
      onChange(applyOutfitTransport(decodeOutfitTransport(paste), outfit!, new Date().toISOString()))
      setError(null); setPaste(''); notify('Outfit code applied to this draft — save when ready')
    } catch (error) { setError(errorMessage(error)) }
  }
  return <section className="outfit-tools" aria-label="Outfit collection and preview">
    <div className="outfit-tools-heading"><div><h3>Collection checklist</h3><p>{wanted ? `${collected} of ${wanted} planned appearances observed as collected` : 'Choose appearances to start your collection checklist'}</p></div><Badge tone={character.collectionCoverage === 'complete' ? 'green' : 'amber'}>{character.collectionCoverage === 'complete' ? 'Complete observation' : 'Partial collection'}</Badge></div>
    {ownership.length > 0 && <ul className="outfit-checklist">{ownership.map(entry => <li key={entry.slot}>
      <span className="outfit-checklist-state" aria-hidden="true">{entry.state === 'collected' ? <Check size={16} /> : entry.state === 'hidden' ? <EyeOff size={16} /> : <Info size={16} />}</span>
      <div><strong>{slotNames[entry.slot] ?? entry.slot}</strong><span>{statuses[entry.state]}</span><small>{entry.reason}</small>{entry.state !== 'collected' && entry.state !== 'hidden' && <Field label={`${slotNames[entry.slot] ?? entry.slot} acquisition note`}><input maxLength={500} placeholder="Where you plan to find this appearance" value={outfit.acquisitionTargets.find(target => target.slot === entry.slot)?.note ?? ''} onChange={event => { const previous = outfit.acquisitionTargets.find(target => target.slot === entry.slot); onChange({ ...outfit, acquisitionTargets: [...outfit.acquisitionTargets.filter(target => target.slot !== entry.slot), { slot: entry.slot, note: event.currentTarget.value, sourceUrl: previous?.sourceUrl ?? null }], updatedAt: new Date().toISOString() }) }} /></Field>}</div>
      {entry.state !== 'collected' && entry.state !== 'hidden' && outfit.slots[entry.slot]?.itemId && <Button variant="quiet" aria-label={`Look up ${slotNames[entry.slot] ?? entry.slot} acquisition`} onClick={() => void api.openExternal(`https://www.wowhead.com/item=${outfit.slots[entry.slot]!.itemId}`).catch(error => notify(errorMessage(error)))}>Find source <ExternalLink size={14} /></Button>}
    </li>)}</ul>}
    <p className="outfit-observation-note">Collection state comes from the selected character’s observed collection{character.collectionObservedAt ? ` · ${new Date(character.collectionObservedAt).toLocaleString()}` : ' · Observation time unknown'}<br />A source lookup opens the item reference; an acquisition method is not verified by this checklist</p>
    <details className="outfit-options"><summary>Hidden slots and weapon illusions</summary>
      <p className="muted">Hidden slots remain part of this outfit plan and are omitted from the in-game preview</p>
      <div className="outfit-hidden-toggles">{hiddenOptions.map(slot => <Toggle key={slot} className="outfit-slot-toggle" pressed={hidden.has(slot)} onPressedChange={pressed => onChange({ ...outfit, hiddenSlots: pressed ? [...outfit.hiddenSlots, slot] : outfit.hiddenSlots.filter(value => value !== slot), updatedAt: new Date().toISOString() })} aria-label={`Hide ${slotNames[slot]}`}><EyeOff size={14} />{slotNames[slot]}</Toggle>)}</div>
      <div className="outfit-illusions">{(['mainHand', 'offHand'] as const).map(hand => <Field key={hand} label={`${slotNames[hand]} illusion ID`} hint="Optional saved illusion reference; client support is checked during preview"><input type="number" min={1} max={2147483647} step={1} value={outfit.illusionIds[hand] ?? ''} onChange={event => { const value = event.currentTarget.valueAsNumber; if (event.currentTarget.value && (!Number.isInteger(value) || value < 1 || value > 2147483647)) return; const illusionIds = { ...outfit.illusionIds }; if (Number.isNaN(value)) delete illusionIds[hand]; else illusionIds[hand] = value; onChange({ ...outfit, illusionIds, updatedAt: new Date().toISOString() }) }} /></Field>)}</div>
    </details>
    <details className="outfit-transfer"><summary>Preview this outfit in WoW</summary><p>Copy the outfit code, type <code>/wowoutfit</code> in WoW, paste it, then choose Import and Preview</p><p className="muted">The preview starts without your current gear and tries on only this plan, using the logged-in character’s body and customization</p>
      <Field label="Outfit code"><textarea rows={3} readOnly value={encoded.code} onFocus={event => event.currentTarget.select()} spellCheck={false} /></Field>
      {encoded.error && <p role="alert" className="outfit-error">{encoded.error}</p>}
      <Button disabled={!encoded.code} onClick={() => void navigator.clipboard.writeText(encoded.code).then(() => notify('Outfit code copied'), () => notify('Select the outfit code and copy it manually'))}><Copy size={14} />Copy outfit code</Button>
      <p className="outfit-preview-boundary">Desktop model inspection shows an attached export; changing this plan does not rebuild that model<br />The in-game preview reports unsupported pieces and does not apply or purchase transmog</p>
    </details>
    <details className="outfit-transfer"><summary>Import an outfit code</summary><Field label="Paste a WOW Companion outfit code"><textarea rows={3} value={paste} maxLength={87400} onChange={event => { setPaste(event.currentTarget.value); setError(null) }} spellCheck={false} /></Field>{error && <p role="alert" className="outfit-error">{error}</p>}<Button disabled={!paste.trim()} onClick={importCode}><Import size={14} />Apply to this draft</Button></details>
  </section>
}
