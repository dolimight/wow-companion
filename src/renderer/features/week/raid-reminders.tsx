import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, BellRing, CalendarCheck, Check, Swords, X } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { reminderKey, reminderStatus, toggleReminder, type RaidReminder } from '../../../shared/raid-reminders'
import { weeklyLockouts } from '../../../shared/weekly'
import { api } from '../../lib/client'
import { errorMessage, notify } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'

const queryKey = (characterId: string) => ['raid-reminders', characterId]

function useReminders(characterId: string) {
  const client = useQueryClient()
  const reminders = useQuery({ queryKey: queryKey(characterId), queryFn: () => api.raidReminders(characterId), staleTime: 60_000 })
  const save = useMutation({
    mutationFn: (next: RaidReminder[]) => api.setRaidReminders(characterId, next),
    onSuccess: value => client.setQueryData(queryKey(characterId), value),
    onError: error => notify(errorMessage(error)),
  })
  return { list: reminders.data?.reminders ?? [], save }
}

/** On a lockout row: plan this raid for after the reset, or take it off the plan */
export function ReminderToggle({ character, lockout }: { character: Character; lockout: { name: string; difficulty: string } }) {
  const { list, save } = useReminders(character.id)
  const planned = list.some(reminder => reminderKey(reminder) === reminderKey(lockout))
  const what = `${lockout.name}${lockout.difficulty ? ` ${lockout.difficulty}` : ''}`
  return (
    <Button variant="quiet" className="reminder-toggle" aria-pressed={planned} disabled={save.isPending} onClick={() => save.mutate(toggleReminder(list, lockout))} aria-label={planned ? `Remove ${what} from reminders` : `Add ${what} to reminders`} title={planned ? 'In your planned raids · click to remove' : 'Add to reminders: you\'ll get a list of planned raids when the lockout refreshes'}>
      {planned ? <BellRing size={14} aria-hidden="true" /> : <Bell size={14} aria-hidden="true" />}
      {planned ? 'In reminders' : 'Add to reminders'}
    </Button>
  )
}

const stateLabels = { open: 'Open now', started: 'Started', done: 'Done this week' } as const
const stateTones = { open: 'green', started: 'amber', done: 'neutral' } as const

/**
 * Every character's planned raids, each read against this reset week's lockouts: open after the reset, started, or
 * done. A desktop alert lists the open ones once each week
 */
export function PlannedRaids({ characters }: { characters: Character[] }) {
  const client = useQueryClient()
  const plans = useQueries({ queries: characters.map(character => ({ queryKey: queryKey(character.id), queryFn: () => api.raidReminders(character.id), staleTime: 60_000 })) })
  const remove = useMutation({
    mutationFn: ({ character, reminder }: { character: Character; reminder: RaidReminder }) => api.setRaidReminders(character.id, (client.getQueryData<{ reminders: RaidReminder[] }>(queryKey(character.id))?.reminders ?? []).filter(entry => reminderKey(entry) !== reminderKey(reminder))),
    onSuccess: (value, { character }) => client.setQueryData(queryKey(character.id), value),
    onError: error => notify(errorMessage(error)),
  })
  const rows = characters.flatMap((character, index) => {
    const lockouts = weeklyLockouts(character.weekly, character.region).lockouts
    return (plans[index]?.data?.reminders ?? []).map(reminder => ({ character, reminder, status: reminderStatus(reminder, lockouts) }))
  })
  const order = { open: 0, started: 1, done: 2 }
  rows.sort((a, b) => order[a.status.state] - order[b.status.state] || a.reminder.name.localeCompare(b.reminder.name))
  const open = rows.filter(row => row.status.state === 'open').length
  return (
    <Card as="section" className="planned-raids" aria-labelledby="planned-raids-title">
      <div className="surface-heading">
        <div>
          <h2 id="planned-raids-title"><CalendarCheck size={16} aria-hidden="true" />Planned raids</h2>
          <p>{rows.length ? `${open} open this week · each one resets with the weekly lockout` : 'Use Add to reminders on any lockout below to plan it for after the reset'}</p>
        </div>
      </div>
      {rows.length > 0 && (
        <ul className="planned-raids-list">
          {rows.map(({ character, reminder, status }) => (
            <li key={`${character.id}:${reminderKey(reminder)}`} data-state={status.state}>
              <span className="planned-raid-icon" aria-hidden="true">{status.state === 'done' ? <Check size={15} /> : <Swords size={15} />}</span>
              <span className="planned-raid-name"><b>{reminder.name}{reminder.difficulty ? ` · ${reminder.difficulty}` : ''}</b><small>{character.name} · {character.realm}</small></span>
              <Badge tone={stateTones[status.state]}>{status.state === 'started' ? `${status.killed}/${status.total} bosses` : stateLabels[status.state]}</Badge>
              <Button variant="icon" aria-label={`Remove ${reminder.name} for ${character.name} from reminders`} disabled={remove.isPending} onClick={() => remove.mutate({ character, reminder })}><X size={14} aria-hidden="true" /></Button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
