import { createHash } from 'node:crypto'
import type { Character, GearItem, GearSlot } from '../../shared/domain'
import { itemLinkVariant } from '../../shared/item-link'
import type { SimulationProfile } from '../../shared/simulation'

export const PROFILE_LIMIT = 1_048_576
export const slots: Record<GearSlot, string> = { head: 'head', neck: 'neck', shoulder: 'shoulder', back: 'back', chest: 'chest', wrist: 'wrist', hands: 'hands', waist: 'waist', legs: 'legs', feet: 'feet', finger1: 'finger1', finger2: 'finger2', trinket1: 'trinket1', trinket2: 'trinket2', mainHand: 'main_hand', offHand: 'off_hand' }
export const classes = ['death_knight', 'demon_hunter', 'druid', 'evoker', 'hunter', 'mage', 'monk', 'paladin', 'priest', 'rogue', 'shaman', 'warlock', 'warrior']
const specNames: Record<number, string> = { 250: 'blood', 251: 'frost', 252: 'unholy', 577: 'havoc', 581: 'vengeance', 102: 'balance', 103: 'feral', 104: 'guardian', 105: 'restoration', 1467: 'devastation', 1468: 'preservation', 1473: 'augmentation', 253: 'beast_mastery', 254: 'marksmanship', 255: 'survival', 62: 'arcane', 63: 'fire', 64: 'frost', 268: 'brewmaster', 269: 'windwalker', 270: 'mistweaver', 65: 'holy', 66: 'protection', 70: 'retribution', 256: 'discipline', 257: 'holy', 258: 'shadow', 259: 'assassination', 260: 'outlaw', 261: 'subtlety', 262: 'elemental', 263: 'enhancement', 264: 'restoration', 265: 'affliction', 266: 'demonology', 267: 'destruction', 71: 'arms', 72: 'fury', 73: 'protection' }
export const healerSpecs = new Set([105, 1468, 270, 65, 256, 257, 264])
const tankSpecs = new Set([250, 581, 104, 268, 66, 73])
export function hash(value: unknown): string { return createHash('sha256').update(Buffer.isBuffer(value) ? value : typeof value === 'string' ? value : stable(value)).digest('hex') }
function stable(value: unknown): string { if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null'; if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`; return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stable((value as Record<string, unknown>)[key])}`).join(',')}}` }
export function characterBaselineHash(character: Character): string { return hash({ characterId: character.id, className: character.className, specId: character.specId, level: character.level, raceName: character.raceName, gameBuild: character.gameBuild, gear: [...character.gear].sort((a, b) => a.slot.localeCompare(b.slot)), talents: character.talents ? { loadout: character.talents.loadout, specId: character.talents.specId } : null }) }
export function token(value: string): string { return value.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') }
export function classToken(character: Character): string { return token(character.className) }
export function itemLine(item: GearItem): { text: string | null; reasons: string[] } {
  if (!item.itemId) return { text: null, reasons: [`Item identity is unknown for ${item.slot}`] }
  const raw = itemLinkVariant(item.itemLink)
  const bonuses = item.bonusIds ?? raw.bonusIds
  const enchantId = item.enchantId ?? raw.enchantId
  const gems = item.gemIds ?? raw.gemIds
  const reasons: string[] = []
  if (bonuses === null) reasons.push(`Bonus IDs are unknown for ${item.slot}`)
  if (enchantId === null) reasons.push(`The enchant identifier is unknown for ${item.slot}`)
  if (gems === null) reasons.push(`Gem identifiers are unknown for ${item.slot}`)
  if (!item.itemLink && item.variantCoverage !== 'complete') reasons.push(`Exact variant coverage is incomplete for ${item.slot}`)
  const fields = [`id=${item.itemId}`]
  if (item.itemLevel !== null) fields.push(`ilevel=${item.itemLevel}`)
  else reasons.push(`Item level is unknown for ${item.slot}`)
  if (bonuses?.length) fields.push(`bonus_id=${bonuses.join('/')}`)
  if (enchantId) fields.push(`enchant_id=${enchantId}`)
  if (gems?.some(Boolean)) fields.push(`gem_id=${gems.join('/')}`)
  return { text: `${slots[item.slot]}=,${fields.join(',')}`, reasons }
}
export function exportCharacterProfile(character: Character, now = new Date().toISOString(), gear = character.gear): SimulationProfile {
  const className = classToken(character)
  const spec = character.specId ? specNames[character.specId] : null
  const reasons: string[] = []
  if (!classes.includes(className)) reasons.push('The character class is unsupported')
  if (!spec) reasons.push('The specialization is unknown or unsupported')
  if (!character.level) reasons.push('The character level is unknown')
  if (!character.gameBuild) reasons.push('The observed game build is unknown')
  if (!character.talents || !/^[A-Za-z0-9+/=]+$/.test(character.talents.loadout)) reasons.push('A supported talent export is missing')
  if (character.talents?.specId !== character.specId) reasons.push('The talent specialization does not match the character')
  const lines = [`# WOW Companion profile v1`, `# Character baseline ${characterBaselineHash(character)}`, `# Game build ${character.gameBuild ?? 'unknown'}`]
  if (classes.includes(className)) lines.push(`${className}=companion_baseline`)
  else lines.push('# The recorded character class is unavailable')
  if (character.level) lines.push(`level=${character.level}`)
  if (character.raceName !== 'Unknown') lines.push(`race=${token(character.raceName)}`)
  else reasons.push('The character race is unknown')
  if (spec) lines.push(`spec=${spec}`)
  lines.push(`role=${tankSpecs.has(character.specId ?? 0) ? 'tank' : healerSpecs.has(character.specId ?? 0) ? 'heal' : 'attack'}`)
  if (character.talents && /^[A-Za-z0-9+/=]+$/.test(character.talents.loadout)) lines.push(`talents=${character.talents.loadout}`)
  for (const item of [...gear].sort((a, b) => a.slot.localeCompare(b.slot))) { const value = itemLine(item); if (value.text) lines.push(value.text); reasons.push(...value.reasons) }
  const required = Object.keys(slots).filter(slot => slot !== 'offHand')
  for (const slot of required) if (!gear.some(item => item.slot === slot)) reasons.push(`No observed item for ${slot}`)
  const text = `${lines.join('\n')}\n`
  return { schemaVersion: 1, text, source: 'companion', createdAt: now, baselineHash: characterBaselineHash(character), profileHash: hash(text), coverage: reasons.length ? 'partial' : 'complete', reasons: [...new Set(reasons)], matchesCurrent: true }
}

export type ParsedProfile = { text: string; fields: Record<string, string>; className: string }
/** Parse a deliberately small data-only subset; never execute or forward arbitrary SimC commands */
export function parseSimulationProfile(text: string): ParsedProfile {
  if (Buffer.byteLength(text, 'utf8') > PROFILE_LIMIT) throw new Error('Simulation profiles must be smaller than 1 MiB')
  if (text.includes('\0')) throw new Error('Simulation profiles cannot contain null bytes')
  const fields: Record<string, string> = Object.create(null)
  let className = ''
  const lines: string[] = []
  const permitted = new Set(['level', 'race', 'spec', 'role', 'position', 'talents', 'region', 'server', 'professions', 'zandalari_loa', 'omnium_talents', ...Object.values(slots)])
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const match = /^([a-z_0-9]+)=(.*)$/.exec(line)
    if (!match) throw new Error('Unsupported profile syntax — import a single data-only character profile')
    const rawKey = match[1]!, key = rawKey === 'deathknight' ? 'death_knight' : rawKey === 'demonhunter' ? 'demon_hunter' : rawKey, value = match[2]!
    if (fields[key] !== undefined) throw new Error(`Duplicate profile field: ${key}`)
    if (classes.includes(key)) {
      if (className) throw new Error('Import exactly one character profile')
      if (!/^"?[A-Za-z0-9_ -]{1,100}"?$/.test(value)) throw new Error('The character label contains unsupported characters')
      className = key; fields[key] = 'companion_baseline'; lines.push(`${key}=companion_baseline`); continue
    }
    if (!permitted.has(key)) throw new Error(`Unsupported profile directive: ${key}`)
    if (Object.values(slots).includes(key)) {
      if (!/^[a-zA-Z0-9_]*,id=[1-9]\d*(?:,(?:ilevel|bonus_id|enchant_id|gem_id|crafted_stats|crafting_quality|drop_level|content_tuning|redirected_base_stats|gem_bonus_id|titan_disc_id)=\d+(?:[/.]\d+)*)*$/.test(value)) throw new Error(`Unsupported item fields for ${key}`)
      const optionNames = value.split(',').slice(1).map(option => option.split('=')[0])
      if (new Set(optionNames).size !== optionNames.length) throw new Error(`Duplicate item options for ${key}`)
    } else if (key === 'talents' || key === 'omnium_talents') {
      if (!/^[A-Za-z0-9+/=]{1,400}$/.test(value)) throw new Error('The talent string is not supported')
    } else if (key === 'professions') {
      if (!/^[a-z_]+=\d{1,4}(?:\/[a-z_]+=\d{1,4})*$/.test(value)) throw new Error('The profession data is unsupported')
    } else if (key === 'level') {
      if (!/^\d{1,3}$/.test(value) || Number(value) < 1) throw new Error('The character level is invalid')
    } else if (!/^[a-z0-9_]{1,80}$/.test(value)) throw new Error(`Unsupported value for ${key}`)
    fields[key] = value; lines.push(`${key}=${value}`)
  }
  if (!className || !fields.spec) throw new Error('The profile must include one class and specialization')
  return { text: `${lines.join('\n')}\n`, fields, className }
}
function comparableFields(parsed: ParsedProfile) { const fields = { ...parsed.fields }; delete fields[parsed.className]; return fields }
export function importCharacterProfile(character: Character, text: string, now = new Date().toISOString()): SimulationProfile {
  const parsed = parseSimulationProfile(text)
  const generated = exportCharacterProfile(character, now)
  const expected = parseSimulationProfile(generated.text)
  const matchesCurrent = parsed.className === expected.className && stable(comparableFields(parsed)) === stable(comparableFields(expected))
  return { schemaVersion: 1, text: parsed.text, source: 'manual', createdAt: now, baselineHash: characterBaselineHash(character), profileHash: hash(parsed.text), coverage: matchesCurrent ? generated.coverage : 'partial', reasons: matchesCurrent ? generated.reasons : ['The imported profile does not exactly match the recorded character baseline'], matchesCurrent }
}
