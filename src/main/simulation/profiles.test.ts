import { describe, expect, it } from 'vite-plus/test'
import { exportCharacterProfile, importCharacterProfile, parseSimulationProfile, characterBaselineHash, hash } from './profiles'
import { simulationCharacter } from './fixtures'

describe('bounded SimulationCraft profiles', () => {
  it('exports exact item identifiers, talents and attribution with an immutable baseline hash', () => {
    const character = simulationCharacter()
    character.gear[0]!.bonusIds = [123, 456]
    character.gear[0]!.gemIds = [111, 0, 222]
    character.gear[0]!.enchantId = 789
    const profile = exportCharacterProfile(character, '2026-10-29T12:00:00.000Z')
    expect(profile.coverage).toBe('complete')
    expect(profile.text).toContain('bonus_id=123/456')
    expect(profile.text).toContain('gem_id=111/0/222')
    expect(profile.text).toContain('enchant_id=789')
    expect(profile.text).toContain('talents=ABC123/def+XYZ==')
    expect(profile.text).toContain(`# Character baseline ${profile.baselineHash}`)
    expect(importCharacterProfile(character, profile.text)).toMatchObject({ coverage: 'complete', matchesCurrent: true })
  })
  it('preserves unknown coverage instead of exporting missing data as observed zero', () => {
    const character = simulationCharacter()
    character.gear[0]!.gemIds = null
    character.gear[0]!.enchantId = null
    character.gear[0]!.itemLink = null
    character.talents = null
    const profile = exportCharacterProfile(character)
    expect(profile.coverage).toBe('partial')
    expect(profile.reasons).toContain('A supported talent export is missing')
    expect(profile.reasons.some(reason => reason.includes('Gem identifiers are unknown'))).toBe(true)
    expect(profile.text).not.toContain('gem_id=0')
  })
  it.each(['input=other.simc', 'armory=us,realm,name', 'output=C:\\private\\secret', 'json2=other.json', 'profileset.x=output=foo', 'actions+=/run_action_list,name=x', 'mage=x\nwarrior=y', 'head=,id=1,source=wowhead', 'head=,id=1\tinput=other.simc'])('rejects unsafe or unsupported directives (%s)', directive => {
    expect(() => parseSimulationProfile(`death_knight=x\nspec=blood\n${directive}\n`)).toThrow()
  })
  it('bounds profile bytes and rejects duplicate slots and null bytes', () => {
    expect(() => parseSimulationProfile('#' + 'x'.repeat(1_048_576))).toThrow('1 MiB')
    expect(() => parseSimulationProfile('death_knight=x\nspec=blood\nhead=,id=1\nhead=,id=2')).toThrow('Duplicate')
    expect(() => parseSimulationProfile('death_knight=x\nspec=blood\0')).toThrow('null bytes')
    expect(() => parseSimulationProfile('death_knight=x\nspec=blood\nhead=,id=1,bonus_id=2,bonus_id=3')).toThrow('Duplicate item')
    expect(() => parseSimulationProfile('death_knight=x\nspec=blood\nhead=,id=0')).toThrow('Unsupported item')
  })
  it('accepts the Retail addon class alias and safe header fields without allowing executable directives', () => {
    const profile = parseSimulationProfile('deathknight="Synthetic"\nlevel=90\nrace=blood_elf\nregion=us\nserver=fixture\nrole=tank\nprofessions=alchemy=100/blacksmithing=100\nspec=blood\ntalents=ABC123==\nhead=,id=123,content_tuning=456,crafted_stats=32/40')
    expect(profile.className).toBe('death_knight')
    expect(profile.text).toContain('death_knight=companion_baseline')
    expect(profile.fields.professions).toBe('alchemy=100/blacksmithing=100')
  })
  it('retains a different manual profile without pretending it matches the character', () => {
    const character = simulationCharacter()
    const exported = exportCharacterProfile(character)
    const changed = exported.text.replace('talents=ABC123/def+XYZ==', 'talents=OTHER')
    const imported = importCharacterProfile(character, changed)
    expect(imported.matchesCurrent).toBe(false)
    expect(imported.coverage).toBe('partial')
  })
  it('invalidates identity for changes to variants, enhancements, talents, spec and build', () => {
    const original = simulationCharacter()
    const baseline = characterBaselineHash(original)
    for (const mutate of [(c: typeof original) => { c.gear[0]!.bonusIds = [9] }, (c: typeof original) => { c.gear[0]!.gemIds = [2] }, (c: typeof original) => { c.gear[0]!.enchantId = 5 }, (c: typeof original) => { c.talents!.loadout = 'OTHER' }, (c: typeof original) => { c.specId = 251 }, (c: typeof original) => { c.gameBuild = '12.1.5.99999' }]) { const changed = structuredClone(original); mutate(changed); expect(characterBaselineHash(changed)).not.toBe(baseline) }
    expect(hash(Buffer.from('abc'))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
