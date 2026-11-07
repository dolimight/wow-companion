/**
 * Item stats and effect values at any item level, worked out from the game's own scaling tables
 * (RandPropPoints, CombatRatingsMultByILvl, StaminaMultByILvl, and the armour tables). The formulas follow
 * SimulationCraft's item database and are checked against Blizzard's equipment data and Wowhead tooltips
 */

export type RatingColumns = { armor: number; weapon: number; trinket: number; jewelry: number }
export type ScalingLevel = {
  itemLevel: number
  /** Stat budget per slot group, by quality band: epic, rare, uncommon */
  epic: number[]; superior: number[]; good: number[]
  damageReplace: number; damageSecondary: number
  rating: RatingColumns | null
  stamina: RatingColumns | null
  armorTotal: { cloth: number; leather: number; mail: number; plate: number } | null
  armorQuality: number[] | null
  shield: number[] | null
  socketCost: number | null
}
export type ArmorLocationRow = { cloth: number; leather: number; mail: number; plate: number }
export type ItemStatBlock = { statTypes: number[]; alloc: number[]; socketShare: number[]; inventoryType: number; classId: number; subclassId: number; quality: number }
export type ScaledStat = { type: number; name: string; value: number; secondary: boolean }

export const statNames: Record<number, string> = {
  3: 'Agility', 4: 'Strength', 5: 'Intellect', 6: 'Spirit', 7: 'Stamina', 13: 'Dodge', 14: 'Parry', 15: 'Block', 31: 'Hit', 32: 'Critical Strike', 35: 'Resilience', 36: 'Haste', 37: 'Expertise',
  40: 'Versatility', 49: 'Mastery', 57: 'PvP Power', 59: 'Multistrike', 61: 'Speed', 62: 'Leech', 63: 'Avoidance', 64: 'Indestructible',
  71: 'Agility or Strength or Intellect', 72: 'Agility or Strength', 73: 'Agility or Intellect', 74: 'Strength or Intellect',
}
const PRIMARY = new Set([3, 4, 5, 71, 72, 73, 74])
const RATINGS = new Set([13, 14, 15, 31, 32, 35, 36, 37, 40, 49, 57, 59, 61, 62, 63, 64])

/** Which of the five budget columns an inventory type draws from */
export function budgetColumn(inventoryType: number, classId = 0, subclassId = 0) {
  switch (inventoryType) {
    case 1: case 5: case 7: case 20: case 17: return 0
    case 3: case 6: case 8: case 10: case 12: return 1
    case 2: case 9: case 11: case 16: case 14: case 23: return 2
    case 13: case 21: case 22: return 3
    case 15: case 25: case 26: return classId === 2 && subclassId === 19 ? 3 : 0
    default: return -1
  }
}
function ratingColumn(inventoryType: number): keyof RatingColumns {
  if (inventoryType === 2 || inventoryType === 11) return 'jewelry'
  if (inventoryType === 12) return 'trinket'
  if ([13, 15, 17, 21, 22, 25, 26].includes(inventoryType)) return 'weapon'
  return 'armor'
}
/** The budget row an item's quality uses; epic and above share the epic band */
function band(level: ScalingLevel, quality: number) { return quality >= 4 ? level.epic : quality === 3 ? level.superior : level.good }

/** Primary, stamina, and rating values an item has at this level; null when a needed table is missing */
export function scaledStats(item: ItemStatBlock, level: ScalingLevel): ScaledStat[] | null {
  const column = budgetColumn(item.inventoryType, item.classId, item.subclassId)
  if (column < 0) return []
  const budget = band(level, item.quality)[column]
  if (budget == null) return null
  const stats: ScaledStat[] = []
  for (let index = 0; index < item.statTypes.length; index++) {
    const type = item.statTypes[index]!, alloc = item.alloc[index] ?? 0
    if (type < 0 || !alloc || !statNames[type]) continue
    // Rounded once at the end; rounding the raw budget share first drifts stamina by several points
    let value = alloc * budget / 10_000 - (item.socketShare[index] ?? 0) * (level.socketCost ?? 0)
    if (type === 7) { if (!level.stamina) return null; value *= level.stamina[ratingColumn(item.inventoryType)] }
    else if (RATINGS.has(type)) { if (!level.rating) return null; value *= level.rating[ratingColumn(item.inventoryType)] }
    value = Math.round(value)
    if (value > 0) stats.push({ type, name: statNames[type]!, value, secondary: !PRIMARY.has(type) && type !== 7 })
  }
  return stats
}

/** Armour on cloth, leather, mail, and plate pieces, cloaks, and shields */
export function scaledArmor(item: ItemStatBlock, level: ScalingLevel, location: ArmorLocationRow | null): number | null {
  if (item.classId !== 4) return null
  const quality = Math.min(item.quality, 6)
  if (item.subclassId === 6) { const value = level.shield?.[quality]; return value ? Math.round(value) : null }
  const kind = (['cloth', 'leather', 'mail', 'plate'] as const)[item.subclassId - 1]
  if (!kind || !location || !level.armorTotal || !level.armorQuality) return null
  const value = level.armorTotal[kind] * location[kind] * (level.armorQuality[quality] ?? 1)
  return value > 0 ? Math.round(value) : null
}

export type SpellEffectData = { index: number; coefficient: number; scalingClass: number; basePoints: number; periodMs: number }
export type SpellData = { id: number; name: string; description: string; durationMs: number | null; maxStacks: number | null; effects: SpellEffectData[] }
export type ItemEffectData = { spellId: number; trigger: number; cooldownMs: number; charges: number }
export type ScaledEffect = { label: string; text: string; complete: boolean; cooldown: string | null }

/** One spell effect's value on an item of this level */
export function effectValue(effect: SpellEffectData, item: ItemStatBlock, level: ScalingLevel): number | null {
  switch (effect.scalingClass) {
    // Primary stats from effects scale with the budget alone; ratings also take the rating multiplier
    case -1: {
      const budget = band(level, item.quality)[0]
      return budget == null ? null : Math.round(effect.coefficient * budget)
    }
    case -7: {
      const budget = band(level, item.quality)[0]
      if (budget == null || !level.rating) return null
      return Math.round(effect.coefficient * budget * level.rating[ratingColumn(item.inventoryType)])
    }
    case -8: return Math.round(effect.coefficient * level.damageReplace)
    case -9: return Math.round(effect.coefficient * level.damageSecondary)
    case 0: return Math.round(effect.basePoints)
    default: return null
  }
}

const triggers: Record<number, string> = { 0: 'Use', 1: 'Equip', 2: 'Chance on hit', 5: 'Use' }
const seconds = (ms: number) => { const s = ms / 1000; return s >= 60 && s % 60 === 0 ? `${s / 60} min` : `${Number(s.toFixed(1))} sec` }
const number = (value: number) => Math.abs(value).toLocaleString('en-US')

/**
 * Fills a spell description's tokens ($s1, $12345d, $u, $t1, ${…}, $?…[…][…], $@spelldesc…) with values for this item level.
 * Anything the game files can't answer leaves the effect marked incomplete rather than guessed
 */
export function effectText(spellId: number, spells: Map<number, SpellData>, item: ItemStatBlock, level: ScalingLevel, depth = 0): { text: string; complete: boolean } {
  const spell = spells.get(spellId)
  if (!spell) return { text: '', complete: false }
  let complete = true
  const value = (id: number, kind: string, index: number): string | null => {
    const target = spells.get(id || spellId)
    if (!target) return null
    const effect = target.effects.find(entry => entry.index === index - 1)
    switch (kind) {
      case 's': case 'm': case 'M': case 'w': case 'W': case 'o': {
        if (!effect) return null
        const amount = effectValue(effect, item, level)
        if (amount == null) return null
        if (kind === 'o' && effect.periodMs && target.durationMs) return number(amount * Math.round(target.durationMs / effect.periodMs))
        return number(amount)
      }
      case 'd': return target.durationMs ? seconds(target.durationMs) : null
      case 'u': return target.maxStacks ? String(target.maxStacks) : null
      case 't': return effect?.periodMs ? String(Number((effect.periodMs / 1000).toFixed(1))) : null
      default: return null
    }
  }
  let text = spell.description
  if (depth < 2) text = text.replace(/\$@spelldesc(\d+)/g, (_match, id: string) => { const inner = effectText(Number(id), spells, item, level, depth + 1); complete &&= inner.complete; return inner.text })
  // Conditions test the player's talents or auras; the plain branch is the one most players see
  for (let pass = 0; pass < 4 && /\$\?/.test(text); pass++) text = text.replace(/\$\?[^[]*\[([^[\]]*)\]\[([^[\]]*)\]/g, (_match, _when: string, otherwise: string) => otherwise)
  text = text.replace(/\$\{([^}]*)\}(\.\d)?/g, (_match, expression: string) => {
    const filled = expression.replace(/\$(\d*)([smMwWodut])(\d?)/g, (_token, id: string, kind: string, index: string) => (value(Number(id), kind, Number(index || 1)) ?? 'NaN').replace(/,/g, ''))
    if (!/^[\d.+\-*/() ]+$/.test(filled)) { complete = false; return '?' }
    const result = Function(`"use strict";return (${filled})`)() as number
    return Number.isFinite(result) ? number(Math.round(result)) : (complete = false, '?')
  })
  text = text.replace(/\$(\d*)([smMwWodut])(\d?)/g, (_match, id: string, kind: string, index: string) => {
    const resolved = value(Number(id), kind, Number(index || 1))
    if (resolved == null) { complete = false; return '?' }
    return resolved
  })
  text = text.replace(/\$[lg]([^:;]+):([^;]+);/g, (_match, _one: string, many: string) => many)
  if (/\$[<a-zA-Z@]/.test(text)) { complete = false; text = text.replace(/\$<[^>]*>|\$[a-zA-Z@]\w*/g, '?') }
  return { text: text.replace(/\s+/g, ' ').trim(), complete }
}

export function scaledEffects(effects: ItemEffectData[], spells: Map<number, SpellData>, item: ItemStatBlock, level: ScalingLevel): ScaledEffect[] {
  return effects.flatMap(effect => {
    const label = triggers[effect.trigger]
    if (!label) return []
    const { text, complete } = effectText(effect.spellId, spells, item, level)
    if (!text) return []
    return [{ label, text, complete, cooldown: effect.cooldownMs > 0 ? seconds(effect.cooldownMs) : null }]
  })
}
