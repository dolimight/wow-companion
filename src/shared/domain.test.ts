import { describe, expect, it } from 'vite-plus/test'
import { appSettingsPatchSchema, characterPatchSchema, characterSchema, addonRecordSchema, specializationIdSchema } from './domain'

describe('specialization IDs', () => {
  it('treats zero, null and omitted specialization IDs as unknown', () => {
    expect(specializationIdSchema.parse(0)).toBeNull()
    expect(specializationIdSchema.parse(null)).toBeNull()
    for (const specId of [0,null,undefined]) {
      expect(characterSchema.parse({id:'legacy',name:'Astra',region:'us',realm:'One',specId}).specId).toBeNull()
      expect(addonRecordSchema.parse({guid:'Player-1',name:'Astra',region:'us',realm:'One',className:'Mage',raceName:'Human',specId,observedAt:'2026-10-21T10:00:00Z',sessionId:'session',sequence:1,gear:[]}).specId).toBeNull()
    }
  })
  it('preserves positive IDs and rejects malformed IDs', () => {
    expect(specializationIdSchema.parse(250)).toBe(250)
    for (const value of [-1,1.5,'250']) expect(specializationIdSchema.safeParse(value).success).toBe(false)
  })
})

describe('partial update contracts', () => {
  it('does not inject defaults when saving one preference', () => {
    expect(appSettingsPatchSchema.parse({ activity: 'pvp' })).toEqual({ activity: 'pvp' })
    expect(appSettingsPatchSchema.parse({ sidebarWidth: 300 })).toEqual({ sidebarWidth: 300 })
  })
  it('does not clear main status, archive state or gear target when toggling a favorite', () => {
    expect(characterPatchSchema.parse({ favorite: true })).toEqual({ favorite: true })
  })
})
