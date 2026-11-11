import type { Character, GearItem, GearSlot } from '../../../shared/domain'
import type { EnhancementOption } from '../../../shared/gamedata'
import { flatEnhancement, statKeys, statNames, zeroRatings, type Ratings } from '../../../shared/enhancement-recommendations'
import { api } from '../../lib/client'

export type Enhancement = EnhancementOption & { kind: 'gem' | 'enchant'; stats: Ratings | null }
const tooltipCache = new Map<number, Promise<Awaited<ReturnType<typeof api.itemTooltip>>>>()
async function tooltip(id: number) {
  let pending = tooltipCache.get(id)
  if (!pending) { pending = api.itemTooltip(id); tooltipCache.set(id, pending); pending.catch(() => tooltipCache.delete(id)) }
  return pending
}
/** Only the permanent numeric clause is parsed; any conditional/proc clause makes the option unranked */
export function enchantText(text: string) {
  const match = text.match(/^Permanently enchants? .+? to (?:increase|grant|add) (?:your )?(.+?)(?:\.(?:\s+Requires .*)?)?$/i)
  if (!match) return text
  return match[1]!.replace(/(Critical Strike|Haste|Mastery|Versatility) by ([\d,]+)/gi, '$2 $1')
}
async function readEnhancement(option: EnhancementOption, kind: 'gem' | 'enchant'): Promise<Enhancement> {
  try {
    const detail = await tooltip(option.itemId)
    const preview = detail.preview
    const lines = kind === 'gem' ? preview?.stats.map(line => line.text) : preview?.effects.map(enchantText)
    return { ...option, kind, stats: lines?.length ? flatEnhancement(lines.join(' and ')) : null }
  } catch { return { ...option, kind, stats: null } }
}
async function boundedMap<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]> {
  let index = 0
  const result: R[] = []
  await Promise.all(Array.from({ length: Math.min(4, items.length) }, async () => {
    while (index < items.length) { const i = index++; result[i] = await fn(items[i]!) }
  }))
  return result
}
export async function enhancementChoices(slot: GearSlot): Promise<Enhancement[]> {
  const [enchants, gems] = await Promise.all([api.enhancements({ kind: 'enchant', slot }), api.enhancements({ kind: 'gem', slot: null })])
  return boundedMap([...enchants.map(option => ({ option, kind: 'enchant' as const })), ...gems.map(option => ({ option, kind: 'gem' as const }))], entry => readEnhancement(entry.option, entry.kind))
}
export type PlanRatings = { delta: Ratings; primary: number; stamina: number; skipped: string[]; resolve: (name: string, kind: 'enchant' | 'gem') => Ratings | null }
/** With `lenient`, enhancements without known flat stats are left out and listed in `skipped` instead of failing the plan */
export async function plannedRatings(character: Character, items: GearItem[], choices: Enhancement[], lenient = false): Promise<PlanRatings> {
  const skipped: string[] = []
  const delta = zeroRatings()
  const primaryName = character.stats?.primary?.name
  let primary = 0, stamina = 0
  const names = new Map(choices.map(choice => [`${choice.kind}:${choice.name}`, choice.stats]))
  const enchantIds = [...new Set(character.gear.flatMap(item => item.enchantId ? [item.enchantId] : []))]
  if (enchantIds.length) {
    const resolved = await api.enchantNames(enchantIds)
    for (const item of character.gear) if (item.enchantId && item.enchant) names.set(`enchant:${item.enchant}`, flatEnhancement(resolved[item.enchantId] ?? ''))
  }
  // Resolve older or other-slot enhancements only if a changed slot actually needs them
  const resolve = (name: string, kind: 'enchant' | 'gem') => !name ? zeroRatings() : names.get(`${kind}:${name}`) ?? flatEnhancement(name)
  const add = (stats: Ratings, factor: number) => { for (const key of statKeys) delta[key] += stats[key] * factor }
  const power = async (item: GearItem, factor: number) => {
    if (!item.itemId || !item.itemLevel) throw Error(`Choose a known item and level for ${item.slot} to calculate the whole plan`)
    const result = await api.itemPower({ id: item.itemId, itemLevel: item.itemLevel })
    if (!result.power?.stats) throw Error(`Stat data is unavailable for ${item.name} at level ${item.itemLevel}`)
    const stats = zeroRatings()
    for (const line of result.power.stats) {
      const key = statKeys.find(key => statNames[key] === line.name)
      if (key) stats[key] += line.value
      else if (line.name === 'Stamina') stamina += line.value * factor
      // Hybrid lines such as Agility or Intellect give whichever main stat the specialization uses
      else if (primaryName && line.name.split(' or ').includes(primaryName)) primary += line.value * factor
    }
    add(stats, factor)
  }
  for (const slot of new Set([...character.gear, ...items].map(item => item.slot))) {
    const before = character.gear.find(item => item.slot === slot), after = items.find(item => item.slot === slot)
    if (before?.itemId !== after?.itemId || before?.itemLevel !== after?.itemLevel) {
      if (before) await power(before, -1)
      if (after) await power(after, 1)
    }
    for (const kind of ['enchant', 'gem'] as const) {
      const oldNames = kind === 'enchant' ? [before?.enchant ?? ''] : before?.gems ?? []
      const newNames = kind === 'enchant' ? [after?.enchant ?? ''] : after?.gems ?? []
      const counts = new Map<string, number>()
      for (const name of oldNames) if (name) counts.set(name, (counts.get(name) ?? 0) - 1)
      for (const name of newNames) if (name) counts.set(name, (counts.get(name) ?? 0) + 1)
      for (const [name, count] of counts) if (count) {
        let stats = resolve(name, kind)
        if (!stats && kind === 'gem') {
          const index = before?.gems.indexOf(name) ?? -1, id = index >= 0 ? before?.gemIds?.filter(Boolean)[index] : undefined
          if (id) { const entry = await readEnhancement({ itemId: id, name, quality: 0, icon: null }, 'gem'); stats = entry.stats; names.set(`gem:${name}`, stats) }
        }
        if (!stats && lenient) { skipped.push(name); continue }
        if (!stats) throw Error(`Cannot calculate the stat change for ${name}. Keep it unchanged or choose an enhancement with known flat stats`)
        add(stats, count)
      }
    }
  }
  return { delta, primary, stamina, skipped, resolve }
}
