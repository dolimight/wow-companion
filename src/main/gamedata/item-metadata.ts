import type { ItemPrimaryStat } from '../../shared/gamedata'
import type { Row } from './wdc'

// Blizzard item modifier IDs, mirrored by TrinityCore ItemTemplate.h
// https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Entities/Item/ItemTemplate.h
// 71/72/73/74 are adaptive primary-stat combinations
const primaryModifiers: Record<number, ItemPrimaryStat[]> = {
  3:['agility'],4:['strength'],5:['intellect'],
  71:['strength','agility','intellect'],72:['strength','agility'],73:['agility','intellect'],74:['strength','intellect'],
}

export function compatibilityMetadata(row: Row, specIds: number[] | null) {
  const rawMask = row.AllowableClass
  const allowableClassMask = typeof rawMask==='number' && Number.isSafeInteger(rawMask) ? rawMask : null
  const modifiers = row.StatModifier_bonusStat
  const primaryStats = Array.isArray(modifiers) && modifiers.every(value=>typeof value==='number'&&Number.isInteger(value))
    ? [...new Set(modifiers.flatMap(value=>primaryModifiers[value as number]??[]))]
    : null
  return {allowableClassMask,specIds,primaryStats}
}
