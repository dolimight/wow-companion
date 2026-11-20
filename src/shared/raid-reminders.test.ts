import { describe, expect, it } from 'vite-plus/test'
import { characterSchema } from './domain'
import { raidReminderAlerts, reminderStatus, toggleReminder, type RaidReminder } from './raid-reminders'
import { weekStart } from './weekly'

const plan: RaidReminder = { name: 'Sepulcher of the First Ones', difficulty: 'Heroic', addedAt: '2026-11-10T00:00:00.000Z' }

describe('planned raids', () => {
  it('reads each planned raid as open, started, or done from this week\'s lockouts', () => {
    expect(reminderStatus(plan, [])).toEqual({ state: 'open', killed: 0, total: 0 })
    expect(reminderStatus(plan, [{ name: 'Sepulcher of the First Ones', difficulty: 'Heroic', killed: 4, total: 11 }])).toEqual({ state: 'started', killed: 4, total: 11 })
    expect(reminderStatus(plan, [{ name: 'Sepulcher of the First Ones', difficulty: 'heroic', killed: 11, total: 11 }]).state).toBe('done')
    // Another difficulty of the same raid is a different plan
    expect(reminderStatus(plan, [{ name: 'Sepulcher of the First Ones', difficulty: 'Mythic', killed: 11, total: 11 }]).state).toBe('open')
  })

  it('adds a lockout to the plan, and removes it on a second click', () => {
    const added = toggleReminder([], { name: 'Sepulcher of the First Ones', difficulty: 'Heroic' }, new Date('2026-11-20T00:00:00.000Z'))
    expect(added).toEqual([{ name: 'Sepulcher of the First Ones', difficulty: 'Heroic', addedAt: '2026-11-20T00:00:00.000Z' }])
    expect(toggleReminder(added, { name: 'Sepulcher of the First Ones', difficulty: 'Heroic' })).toEqual([])
  })

  it('alerts once per character in the first two days after the reset, listing what is still open', () => {
    const character = characterSchema.parse({ id: 'c1', region: 'us', realm: 'Gurubashi', name: 'Dol', className: 'Death Knight' })
    const start = weekStart('us', Date.parse('2026-11-20T00:00:00.000Z'))!
    const alerts = raidReminderAlerts([character], new Map([['c1', [plan]]]), start + 3_600_000)
    expect(alerts).toEqual([{ key: `raids:c1:${new Date(start).toISOString()}`, characterId: 'c1', title: "Dol's planned raids are open", body: 'Sepulcher of the First Ones (Heroic)' }])
    expect(raidReminderAlerts([character], new Map([['c1', [plan]]]), start + 3 * 86_400_000)).toEqual([])
    expect(raidReminderAlerts([character], new Map(), start + 3_600_000)).toEqual([])
  })
})
