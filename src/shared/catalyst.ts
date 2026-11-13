import type { CatalystSource, ItemPower } from './gamedata'

const engineStat: Record<string, string> = { Strength: 'str', Agility: 'agi', Intellect: 'int', Stamina: 'sta', 'Critical Strike': 'crit', Haste: 'haste', Mastery: 'mastery', Versatility: 'vers' }

/**
 * An item's stats as SimulationCraft's `stats=` item option, which replaces the item's own stats and armor. A catalyzed
 * tier piece keeps its base item's stats, so it runs with these. A hybrid line such as "Strength or Intellect" counts
 * as the character's primary stat; tertiary stats are left out. Null without a known primary stat or any stats
 */
export function engineStats(power: Pick<ItemPower, 'armor' | 'stats'> | null, primary: 'Strength' | 'Agility' | 'Intellect' | null | undefined): string | null {
  if (!power?.stats?.length || !primary) return null
  const parts: string[] = []
  if (power.armor) parts.push(`${Math.round(power.armor)}armor`)
  for (const stat of power.stats) {
    const name = stat.name.includes(' or ') ? (stat.name.split(' or ').includes(primary) ? primary : null) : stat.name
    const token = name ? engineStat[name] : undefined
    if (token && stat.value > 0) parts.push(`${Math.round(stat.value)}${token}`)
  }
  return parts.length ? parts.join('_') : null
}

/**
 * The base a catalyzed tier piece came from, read from the cantrip it carries: only one base of that slot and armor
 * type drops with it. Null when the piece has no cantrip or more than one base could have given it
 */
export function catalyzedBase(sources: CatalystSource[], bonusIds: readonly number[] | null | undefined): CatalystSource | null {
  if (!bonusIds?.length) return null
  const matches = sources.filter(source => source.variants.some(variant => bonusIds.includes(variant.bonusId)))
  return matches.length === 1 ? matches[0]! : null
}

const strength = new Set(['Death Knight', 'Warrior']), agility = new Set(['Rogue', 'Hunter', 'Demon Hunter']), intellect = new Set(['Mage', 'Warlock', 'Priest', 'Evoker'])
const specPrimary: Record<number, 'Strength' | 'Agility' | 'Intellect'> = { 65: 'Intellect', 66: 'Strength', 70: 'Strength', 102: 'Intellect', 103: 'Agility', 104: 'Agility', 105: 'Intellect', 268: 'Agility', 269: 'Agility', 270: 'Intellect', 262: 'Intellect', 263: 'Agility', 264: 'Intellect' }
/** The character's primary stat: as recorded, else from its class, or its specialization for hybrid classes */
export function primaryStatOf(character: { className: string; specId?: number | null; stats?: { primary?: { name: 'Strength' | 'Agility' | 'Intellect' } | null } | null }): 'Strength' | 'Agility' | 'Intellect' | null {
  if (character.stats?.primary?.name) return character.stats.primary.name
  if (strength.has(character.className)) return 'Strength'
  if (agility.has(character.className)) return 'Agility'
  if (intellect.has(character.className)) return 'Intellect'
  return character.specId ? specPrimary[character.specId] ?? null : null
}
