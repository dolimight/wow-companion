import { Shirt } from 'lucide-react'
import type { AppearanceSlot } from '../../../shared/domain'
import { GearSlotIcon } from '../../components/GearSlotIcon'

export function AppearanceSlotIcon({ slot, size = 18 }: { slot: AppearanceSlot; size?: number }) {
  if (slot === 'shirt' || slot === 'tabard') return <Shirt size={size} aria-hidden="true" />
  return <GearSlotIcon slot={slot === 'shoulderLeft' || slot === 'shoulderRight' ? 'shoulder' : slot} size={size} />
}
