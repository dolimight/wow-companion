import { Axe, Bird, Cat, Crosshair, Gem, Hammer, PawPrint, Rabbit, Shield, Shirt, Sparkles, Swords, Wand, type LucideIcon } from 'lucide-react'
import type { ItemSearch } from '../../../shared/gamedata'

/** What a category lists: items by search filters, mounts by source, or battle pets by family */
export type CategoryFilter = { kind: 'items'; search: Partial<ItemSearch> } | { kind: 'mounts'; source: number | null } | { kind: 'pets'; family: number | null }
export type CategoryNode = { id: string; label: string; icon: LucideIcon; filter?: CategoryFilter; children?: CategoryNode[] }

const weapon = (id: string, label: string, subclass: number, icon: LucideIcon): CategoryNode => ({ id, label, icon, filter: { kind: 'items', search: { itemClass: 2, itemSubclass: subclass } } })

/** The armor slots each material comes in */
const armorSlots = [['head', 'Head'], ['shoulder', 'Shoulders'], ['chest', 'Chest'], ['wrist', 'Wrists'], ['hands', 'Hands'], ['waist', 'Waist'], ['legs', 'Legs'], ['feet', 'Feet']] as const
const material = (id: string, label: string, subclass: number): CategoryNode => ({
  id, label, icon: Shirt,
  filter: { kind: 'items', search: { itemClass: 4, itemSubclass: subclass } },
  children: armorSlots.map(([slot, name]) => ({ id: slot, label: name, icon: Shirt, filter: { kind: 'items', search: { itemClass: 4, itemSubclass: subclass, slot } } })),
})

/** Where mounts come from, as the game files them */
export const mountSources = ['Drop', 'Quest', 'Vendor', 'Profession', 'Pet battle', 'Achievement', 'World event', 'Promotion', 'Trading card game', 'Shop', 'Discovery', 'Trading post']
/** Battle pet families, in the game's order */
export const petFamilies = ['Humanoid', 'Dragonkin', 'Flying', 'Undead', 'Critter', 'Magic', 'Elemental', 'Beast', 'Aquatic', 'Mechanical']

/**
 * The viewer's categories, laid out like the game's item classes: weapons by type, armor by material and slot with
 * the other wearables beside them, mounts by where they come from, and battle pets by family
 */
export const categories: CategoryNode[] = [
  {
    id: 'weapons', label: 'Weapons', icon: Swords, filter: { kind: 'items', search: { itemClass: 2 } },
    children: [
      weapon('one-handed-axes', 'One-handed axes', 0, Axe), weapon('one-handed-maces', 'One-handed maces', 4, Hammer), weapon('one-handed-swords', 'One-handed swords', 7, Swords),
      weapon('daggers', 'Daggers', 15, Swords), weapon('fist-weapons', 'Fist weapons', 13, Swords), weapon('warglaives', 'Warglaives', 9, Swords),
      weapon('two-handed-axes', 'Two-handed axes', 1, Axe), weapon('two-handed-maces', 'Two-handed maces', 5, Hammer), weapon('two-handed-swords', 'Two-handed swords', 8, Swords),
      weapon('polearms', 'Polearms', 6, Swords), weapon('staves', 'Staves', 10, Wand),
      weapon('bows', 'Bows', 2, Crosshair), weapon('crossbows', 'Crossbows', 18, Crosshair), weapon('guns', 'Guns', 3, Crosshair), weapon('wands', 'Wands', 19, Wand),
    ],
  },
  {
    id: 'armor', label: 'Armor', icon: Shirt, filter: { kind: 'items', search: { itemClass: 4 } },
    children: [
      material('cloth', 'Cloth', 1), material('leather', 'Leather', 2), material('mail', 'Mail', 3), material('plate', 'Plate', 4),
      { id: 'cloaks', label: 'Cloaks', icon: Shirt, filter: { kind: 'items', search: { inventoryTypes: [16] } } },
      { id: 'shields', label: 'Shields', icon: Shield, filter: { kind: 'items', search: { itemClass: 4, itemSubclass: 6 } } },
      { id: 'off-hands', label: 'Held in off-hand', icon: Gem, filter: { kind: 'items', search: { inventoryTypes: [23] } } },
      { id: 'shirts', label: 'Shirts', icon: Shirt, filter: { kind: 'items', search: { inventoryTypes: [4] } } },
      { id: 'tabards', label: 'Tabards', icon: Shirt, filter: { kind: 'items', search: { inventoryTypes: [19] } } },
      { id: 'cosmetic', label: 'Cosmetic', icon: Sparkles, filter: { kind: 'items', search: { itemClass: 4, itemSubclass: 5 } } },
    ],
  },
  {
    id: 'mounts', label: 'Mounts', icon: Rabbit, filter: { kind: 'mounts', source: null },
    children: mountSources.map((label, source) => ({ id: label.toLowerCase().replace(/\s+/g, '-'), label, icon: Rabbit, filter: { kind: 'mounts', source } })),
  },
  {
    id: 'pets', label: 'Battle pets', icon: PawPrint, filter: { kind: 'pets', family: null },
    children: petFamilies.map((label, family) => ({ id: label.toLowerCase(), label, icon: label === 'Flying' ? Bird : label === 'Beast' || label === 'Critter' ? Cat : PawPrint, filter: { kind: 'pets', family } })),
  },
]

/** The nodes along a path such as "armor/plate/head", from the top category down; stops at the first unknown step */
export function trail(path: string | undefined): CategoryNode[] {
  const out: CategoryNode[] = []
  let level = categories
  for (const step of (path ?? '').split('/').filter(Boolean)) {
    const node = level.find(entry => entry.id === step)
    if (!node) break
    out.push(node)
    level = node.children ?? []
  }
  return out
}
