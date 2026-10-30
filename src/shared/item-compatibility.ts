import type { AppearanceSlot } from './domain'
import { armorForClass, slotInventoryTypes, type ItemPrimaryStat, type ItemSearchCharacter, type ItemSummary } from './gamedata'

export type ItemCompatibility = { compatible: boolean; verified: boolean; reason: string | null }

// IDs and spec identities checked against installed Retail 12.1.5.70448 ChrSpecialization
// These are equipment suitability rules, not personal-loot eligibility or a gear ranking
const classes: Record<string, { id: number; weapons: number[] }> = {
  warrior: { id: 1, weapons: [0, 1, 2, 3, 4, 5, 6, 7, 8, 10, 13, 15, 18] },
  paladin: { id: 2, weapons: [0, 1, 4, 5, 6, 7, 8] },
  hunter: { id: 3, weapons: [0, 1, 2, 3, 6, 7, 8, 10, 13, 15, 18] },
  rogue: { id: 4, weapons: [0, 2, 3, 4, 7, 13, 15, 18] },
  priest: { id: 5, weapons: [4, 10, 15, 19] },
  'death knight': { id: 6, weapons: [0, 1, 4, 5, 6, 7, 8] },
  shaman: { id: 7, weapons: [0, 1, 4, 5, 10, 13, 15] },
  mage: { id: 8, weapons: [7, 10, 15, 19] },
  warlock: { id: 9, weapons: [7, 10, 15, 19] },
  monk: { id: 10, weapons: [0, 4, 6, 7, 10, 13] },
  druid: { id: 11, weapons: [4, 5, 6, 10, 13, 15] },
  'demon hunter': { id: 12, weapons: [0, 7, 9, 13, 15] },
  evoker: { id: 13, weapons: [0, 4, 7, 10, 13, 15] },
}
type Spec = { classId: number; stat: ItemPrimaryStat; weapons: number[]; dual?: boolean; shield?: boolean; holdable?: boolean }
const specs: Record<number, Spec> = {}
function add(ids: number[], classId: number, stat: ItemPrimaryStat, weapons: number[], extra: Partial<Spec> = {}) {
  for (const id of ids) specs[id] = { classId, stat, weapons, ...extra }
}
add([71], 1, 'strength', [1, 5, 6, 8])
add([72], 1, 'strength', [0, 1, 4, 5, 6, 7, 8], { dual: true })
add([73], 1, 'strength', [0, 4, 7, 13, 15], { shield: true })
add([65], 2, 'intellect', [0, 1, 4, 5, 6, 7, 8], { shield: true, holdable: true })
add([66], 2, 'strength', [0, 4, 7], { shield: true })
add([70], 2, 'strength', [1, 5, 6, 8])
add([253, 254], 3, 'agility', [2, 3, 18])
add([255], 3, 'agility', [0, 1, 6, 7, 8, 10, 13, 15], { dual: true })
add([259, 261], 4, 'agility', [15], { dual: true })
add([260], 4, 'agility', [0, 4, 7, 13, 15], { dual: true })
add([256, 257, 258], 5, 'intellect', [4, 10, 15, 19], { holdable: true })
add([250, 252], 6, 'strength', [1, 5, 6, 8])
add([251], 6, 'strength', [0, 1, 4, 5, 6, 7, 8], { dual: true })
add([262, 264], 7, 'intellect', [0, 4, 5, 10, 13, 15], { shield: true, holdable: true })
add([263], 7, 'agility', [0, 4, 13], { dual: true })
add([62, 63, 64], 8, 'intellect', [7, 10, 15, 19], { holdable: true })
add([265, 266, 267], 9, 'intellect', [7, 10, 15, 19], { holdable: true })
add([268, 269], 10, 'agility', [0, 4, 6, 7, 10, 13], { dual: true })
add([270], 10, 'intellect', [0, 4, 6, 7, 10, 13], { holdable: true })
add([102, 105], 11, 'intellect', [4, 5, 6, 10, 13, 15], { holdable: true })
add([103, 104], 11, 'agility', [5, 6, 10])
add([577, 581], 12, 'agility', [0, 7, 9, 13], { dual: true })
add([1480], 12, 'intellect', [0, 7, 9, 13, 15], { dual: true })
add([1467, 1468, 1473], 13, 'intellect', [0, 4, 7, 10, 13, 15], { holdable: true })

const armorInventoryTypes = new Set([1, 3, 5, 6, 7, 8, 9, 10, 20])
const weaponInventoryTypes = new Set([13, 15, 17, 21, 22, 26])
const normalizeClass = (name: string) => name.trim().toLowerCase().replace(/\s+/g, ' ')
const reject = (reason: string): ItemCompatibility => ({ compatible: false, verified: true, reason })

/** A completed check covers known equipment rules only, not loot access, effects, or best-in-slot */
export function getItemCompatibility(item: ItemSummary, character: ItemSearchCharacter | null, options: { slot?: AppearanceSlot | null } = {}): ItemCompatibility {
  const className = character ? normalizeClass(character.className) : ''
  const playerClass = classes[className]
  const candidateSpec = character?.specId ? specs[character.specId] : undefined
  const spec = candidateSpec?.classId === playerClass?.id ? candidateSpec : undefined
  const titansGrip = playerClass?.id === 1 && character?.specId === 72 && item.inventoryType === 17 && item.classId === 2 && [1, 5, 6, 8].includes(item.subclassId ?? -1)
  const { slot } = options
  if (slot && !slotInventoryTypes[slot].includes(item.inventoryType) && !(slot === 'offHand' && titansGrip)) return reject('This item does not fit the selected slot')
  if (!character) return { compatible: true, verified: false, reason: 'Select a character to check compatibility' }

  const unknown: string[] = []
  if (!playerClass) unknown.push('class is unknown')
  if (!spec) unknown.push('specialization is unknown')
  if (character.level == null && item.requiredLevel > 0) unknown.push('character level is unknown')
  if (character.level != null && item.requiredLevel > character.level) return reject(`Requires level ${item.requiredLevel}`)
  if (item.allowableClassMask == null) unknown.push('item class restrictions are unavailable')
  else if (playerClass && (item.allowableClassMask & (1 << (playerClass.id - 1))) === 0) return reject('This item is restricted to other classes')

  if (armorInventoryTypes.has(item.inventoryType)) {
    const armor = item.armor ?? (item.classId === 4 ? [null, 'cloth', 'leather', 'mail', 'plate'][item.subclassId ?? -1] : null)
    if (armor && playerClass && armor !== armorForClass(className)) return reject(`This character uses ${armorForClass(className)} armor`)
    if (!armor && !(item.classId === 4 && item.subclassId === 0)) unknown.push('armor type is unavailable')
  }
  if (item.inventoryType === 14) {
    if (playerClass && ![1, 2, 7].includes(playerClass.id)) return reject('This class cannot use shields')
    if (spec && !spec.shield) return reject('This specialization does not use shields')
  }
  if (item.inventoryType === 23) {
    if (playerClass && ![2, 5, 7, 8, 9, 10, 11, 13].includes(playerClass.id)) return reject('This class cannot use held off-hand items')
    if (spec && !spec.holdable) return reject('This specialization does not use held off-hand items')
  }
  if (weaponInventoryTypes.has(item.inventoryType)) {
    if (item.classId !== 2 || item.subclassId == null) unknown.push('weapon type is unavailable')
    else {
      if (playerClass && !playerClass.weapons.includes(item.subclassId)) return reject('This class cannot use this weapon type')
      if (spec && !spec.weapons.includes(item.subclassId)) return reject('This weapon type does not match the specialization')
      if (spec && character.specId === 260 && item.subclassId === 15 && (slot === 'mainHand' || item.inventoryType === 21)) return reject('Outlaw uses a non-dagger main-hand weapon')
    }
    const offhand = slot === 'offHand' || item.inventoryType === 22
    if (offhand && spec && !spec.dual) return reject('This specialization cannot dual wield')
    if (offhand && !spec && playerClass && ![1, 3, 4, 6, 7, 10, 12].includes(playerClass.id)) return reject('This class cannot dual wield')
    if (offhand && item.inventoryType === 17 && !titansGrip) return reject('Only Fury can use this two-hand weapon in the off hand')
  }

  // ItemSpecOverride is authoritative over inferred primary-stat suitability
  if (item.specIds == null) unknown.push('item specialization restrictions are unavailable')
  else if (item.specIds.length) {
    if (spec && !item.specIds.includes(character.specId!)) return reject('This item is intended for other specializations')
    if (!spec && playerClass && item.specIds.every(id => specs[id] && specs[id]!.classId !== playerClass.id)) return reject('This item is intended for other classes')
  }
  if (item.primaryStats == null) unknown.push('item primary stats are unavailable')
  else if (!item.specIds?.length && item.primaryStats.length && spec && !item.primaryStats.includes(spec.stat)) return reject(`This specialization uses ${spec.stat}`)

  return { compatible: true, verified: unknown.length === 0, reason: unknown.length ? `Partial check: ${unknown.join('; ')}` : null }
}
