import { CircleDot, Columns2, Crown, Footprints, Gem, Hand, Layers, RectangleHorizontal, Shield, Shirt, Sparkles, Sword, Watch, Wind } from 'lucide-react'
import type { GearSlot } from '../../shared/domain'

const icons = {
  head: Crown, neck: Gem, shoulder: Layers, back: Wind, chest: Shirt,
  wrist: Watch, hands: Hand, waist: RectangleHorizontal, legs: Columns2, feet: Footprints,
  finger1: CircleDot, finger2: CircleDot, trinket1: Sparkles, trinket2: Sparkles,
  mainHand: Sword, offHand: Shield,
} satisfies Record<GearSlot, typeof Shield>

export function GearSlotIcon({ slot, size = 18 }: { slot: GearSlot; size?: number }) {
  const Icon = icons[slot]
  return <Icon className="gear-slot-glyph" size={size} aria-hidden="true" />
}
