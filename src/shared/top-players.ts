import type { GearSlot } from './domain'

export type TopRegion = 'us' | 'eu' | 'world'
export const topRegionNames: Record<TopRegion, string> = { us: 'North America', eu: 'Europe', world: 'All regions' }
export type TopSlotGroup = Exclude<GearSlot, 'finger1' | 'finger2' | 'trinket1' | 'trinket2'> | 'rings' | 'trinkets'
export const topSlotGroups: Array<{ group: TopSlotGroup; label: string; slots: GearSlot[] }> = [
  { group: 'head', label: 'Head', slots: ['head'] },
  { group: 'neck', label: 'Neck', slots: ['neck'] },
  { group: 'shoulder', label: 'Shoulder', slots: ['shoulder'] },
  { group: 'back', label: 'Cloak', slots: ['back'] },
  { group: 'chest', label: 'Chest', slots: ['chest'] },
  { group: 'wrist', label: 'Wrist', slots: ['wrist'] },
  { group: 'hands', label: 'Hands', slots: ['hands'] },
  { group: 'waist', label: 'Waist', slots: ['waist'] },
  { group: 'legs', label: 'Legs', slots: ['legs'] },
  { group: 'feet', label: 'Feet', slots: ['feet'] },
  { group: 'rings', label: 'Rings', slots: ['finger1', 'finger2'] },
  { group: 'trinkets', label: 'Trinkets', slots: ['trinket1', 'trinket2'] },
  { group: 'mainHand', label: 'Main hand', slots: ['mainHand'] },
  { group: 'offHand', label: 'Off hand', slots: ['offHand'] },
]
export type TopCount = { id: number; name: string; count: number; /** Average item level the sampled players wear it at, for items */ level?: number | null }
export type TopPlayers = {
  season: { slug: string; name: string }
  specId: number; specName: string; className: string; region: TopRegion
  observedAt: string
  runsScanned: number
  source: string
  /** Plain-language description of who was counted, shown with every number */
  population: string
  players: Array<{ name: string; realm: string; region: string; score: number | null; keyLevel: number | null; dungeon: string | null; url: string; loadout: string | null }>
  builds: Array<{ loadout: string; count: number; players: string[] }>
  gearPlayers: number
  averageItemLevel: number | null
  slots: Partial<Record<TopSlotGroup, { items: TopCount[]; enchants: TopCount[]; gems: TopCount[] }>>
}
