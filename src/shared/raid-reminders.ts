import { z } from 'zod'
import type { Character } from './domain'
import type { Alert } from './alerts'
import { dungeonKey } from './dungeons'
import { weekStart, weeklyLockouts } from './weekly'

/**
 * Planned raids: lockouts a player marks to run again. Each one is kept per character until removed, and every reset
 * week it reads as open, started, or done from that week's lockouts, so the list doubles as a weekly checklist
 */
export const RAID_REMINDERS_NAMESPACE = 'raid-reminders'
export const raidReminderSchema = z.object({ name: z.string().min(1).max(120), difficulty: z.string().max(60).default(''), addedAt: z.string().datetime() })
export const raidRemindersSchema = z.object({ reminders: z.array(raidReminderSchema).max(60).default([]) })
export type RaidReminder = z.infer<typeof raidReminderSchema>

/** One planned raid per instance and difficulty, compared loosely since sources differ in punctuation */
export const reminderKey = (reminder: { name: string; difficulty: string }) => `${dungeonKey(reminder.name)}:${reminder.difficulty.trim().toLowerCase()}`

export type ReminderStatus = { state: 'open' | 'started' | 'done'; killed: number; total: number }

/** Where a planned raid stands this reset week, from the lockouts the addon or Blizzard reported */
export function reminderStatus(reminder: { name: string; difficulty: string }, lockouts: Array<{ name: string; difficulty: string; killed: number; total: number }>): ReminderStatus {
  const lockout = lockouts.find(entry => reminderKey(entry) === reminderKey(reminder))
  if (!lockout) return { state: 'open', killed: 0, total: 0 }
  return { state: lockout.total > 0 && lockout.killed >= lockout.total ? 'done' : 'started', killed: lockout.killed, total: lockout.total }
}

/** Adds a raid to the plan, or removes it when it is already there */
export function toggleReminder(reminders: RaidReminder[], lockout: { name: string; difficulty: string }, now = new Date()): RaidReminder[] {
  const key = reminderKey(lockout)
  return reminders.some(reminder => reminderKey(reminder) === key)
    ? reminders.filter(reminder => reminderKey(reminder) !== key)
    : [...reminders, { name: lockout.name, difficulty: lockout.difficulty, addedAt: now.toISOString() }].slice(-60)
}

const ALERT_WINDOW = 48 * 3_600_000

/** Once each reset week, in its first two days, a desktop alert per character listing the planned raids still open */
export function raidReminderAlerts(characters: Character[], plans: Map<string, RaidReminder[]>, now = Date.now()): Alert[] {
  return characters.flatMap(character => {
    const reminders = plans.get(character.id) ?? []
    const start = weekStart(character.region, now)
    if (!reminders.length || start == null || now - start >= ALERT_WINDOW || character.archived || character.demo) return []
    const lockouts = weeklyLockouts(character.weekly, character.region, now).lockouts
    const open = reminders.filter(reminder => reminderStatus(reminder, lockouts).state === 'open')
    if (!open.length) return []
    const names = open.map(reminder => `${reminder.name}${reminder.difficulty ? ` (${reminder.difficulty})` : ''}`)
    return [{ key: `raids:${character.id}:${new Date(start).toISOString()}`, characterId: character.id, title: `${character.name}'s planned raids are open`, body: names.length > 3 ? `${names.slice(0, 3).join(', ')} and ${names.length - 3} more` : names.join(', ') }]
  })
}
