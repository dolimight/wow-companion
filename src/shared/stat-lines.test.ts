import { describe, expect, it } from 'vite-plus/test'
import { compareStats, parseStat } from './stat-lines'

describe('stat lines', () => {
  it('reads signed, comma-separated and percent lines', () => {
    expect(parseStat('+1,152 Agility')).toEqual({ name: 'Agility', value: 1152 })
    expect(parseStat('3,402 Armor')).toEqual({ name: 'Armor', value: 3402 })
    expect(parseStat('+185 Critical Strike (3.4% at max level)')).toEqual({ name: 'Critical Strike', value: 185 })
    expect(parseStat('Equip: does something')).toBeNull()
  })
  it('treats a stat only one item has as zero on the other', () => {
    const rows = compareStats(
      [{ text: '+500 Strength', secondary: false }, { text: '+200 Haste', secondary: true }],
      [{ text: '+520 Strength', secondary: false }, { text: '+150 Haste', secondary: true }, { text: '+90 Mastery', secondary: true }],
    )
    expect(rows.find(row => row.name === 'Strength')).toMatchObject({ mine: 500, top: 520, delta: 20 })
    expect(rows.find(row => row.name === 'Haste')?.delta).toBe(-50)
    expect(rows.find(row => row.name === 'Mastery')).toMatchObject({ mine: 0, top: 90, delta: 90 })
    expect(rows[0]!.secondary).toBe(false)
  })
})
