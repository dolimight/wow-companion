import { describe, expect, it } from 'vite-plus/test'
import { parseBlizzardExtras, parseBlizzardProfile } from './blizzard'

const now = Date.parse('2026-10-22T12:00:00Z')
const thisWeek = Date.parse('2026-10-20T15:00:00Z')

describe('Blizzard specialization identity', () => {
  const base={summary:{id:7,name:'Astra',realm:{name:'One',slug:'one'},active_spec:{id:0,name:'Blood'}},equipment:null,appearance:null,media:null,keystone:null,pvp:[]}
  it('uses the active specialization endpoint when the summary has a zero placeholder', () => {
    const result=parseBlizzardProfile({...base,specializations:{active_specialization:{id:250,name:'Blood'}}},'us',now)
    expect(result.specId).toBe(250);expect(result.specName).toBe('Blood')
  })
  it('leaves an unavailable specialization unknown instead of inventing an ID', () => {
    expect(parseBlizzardProfile(base,'us',now).specId).toBeNull()
    expect(parseBlizzardProfile({...base,summary:{...base.summary,active_spec:{id:62,name:'Arcane'}},specializations:{active_specialization:{id:250,name:'Blood'}}},'us',now).specId).toBe(62)
  })
})

describe('Blizzard character extras', () => {
  it('counts newest-expansion kills toward the Vault while keeping all this week\'s raid lockouts', () => {
    const raids = { expansions: [
      { expansion: { id: 10, name: 'Old' }, instances: [{ instance: { id: 1, name: 'Old Raid' }, modes: [{ difficulty: { type: 'MYTHIC' }, progress: { total_count: 1, encounters: [{ encounter: { id: 1, name: 'Ancient' }, last_kill_timestamp: thisWeek + 1000 }] } }] }] },
      { expansion: { id: 11, name: 'New' }, instances: [{ instance: { id: 2, name: 'New Raid' }, modes: [
        { difficulty: { type: 'NORMAL', name: 'Normal' }, progress: { total_count: 8, encounters: [{ encounter: { id: 10, name: 'A' }, last_kill_timestamp: thisWeek + 10 }, { encounter: { id: 11, name: 'B' }, last_kill_timestamp: thisWeek + 20 }] } },
        { difficulty: { type: 'HEROIC', name: 'Heroic' }, progress: { total_count: 8, encounters: [{ encounter: { id: 10, name: 'A' }, last_kill_timestamp: thisWeek + 30 }, { encounter: { id: 12, name: 'C' }, last_kill_timestamp: thisWeek - 1000 }] } },
      ] }] },
    ] }
    const { weekly } = parseBlizzardExtras({ statistics: null, specializations: null, raids }, 'us', now)
    expect(weekly?.weekStart).toBe(new Date(thisWeek).toISOString())
    expect(weekly?.raidKills.map(kill => `${kill.boss}:${kill.difficulty}`).sort()).toEqual(['A:Heroic', 'B:Normal'])
    expect(weekly?.lockouts).toEqual([
      { name: 'Old Raid', difficulty: 'Mythic', killed: 1, total: 1, raid: true },
      { name: 'New Raid', difficulty: 'Normal', killed: 2, total: 8, raid: true },
      { name: 'New Raid', difficulty: 'Heroic', killed: 1, total: 8, raid: true },
    ])
  })

  it('does not promote older raid kills to Vault progress when the known current expansion has no history', () => {
    const raids = { expansions: [{ expansion: { id: 10, name: 'Old' }, instances: [{
      instance: { id: 1, name: 'Old Raid' }, modes: [{ difficulty: { type: 'MYTHIC' }, progress: { total_count: 2, encounters: [
        { encounter: { id: 1, name: 'Ancient' }, last_kill_timestamp: thisWeek + 1000 },
        { encounter: { id: 2, name: 'Earlier' }, last_kill_timestamp: thisWeek - 1000 },
      ] } }],
    }] }] }
    const { weekly } = parseBlizzardExtras({ statistics: null, specializations: null, raids, currentExpansionId: 11 }, 'us', now)
    expect(weekly?.raidKills).toEqual([])
    expect(weekly?.lockouts).toEqual([{ name: 'Old Raid', difficulty: 'Mythic', killed: 1, total: 2, raid: true }])
  })

  it('reads secondary stats as percentages and the active talent string', () => {
    const extras = parseBlizzardExtras({
      statistics: { health: 900000, strength: { effective: 1200 }, agility: { effective: 30000 }, intellect: { effective: 900 }, stamina: { effective: 45000 }, melee_crit: { value: 21.456 }, spell_crit: { value: 18 }, melee_haste: { value: 14.2 }, mastery: { value: 40.1 }, versatility_damage_done_bonus: 6.5 },
      specializations: { active_specialization: { id: 260 }, specializations: [{ specialization: { id: 260 }, loadouts: [{ is_active: false, talent_loadout_code: 'OLD' }, { is_active: true, talent_loadout_code: 'ACTIVE' }] }] },
      raids: null,
    }, 'us', now)
    expect(extras.stats).toMatchObject({ primary: { name: 'Agility', value: 30000 }, crit: 21.46, haste: 14.2, mastery: 40.1, versatility: 6.5, source: 'Blizzard' })
    expect(extras.talents).toMatchObject({ loadout: 'ACTIVE', specId: 260 })
    expect(extras.weekly).toBeNull()
  })
})
