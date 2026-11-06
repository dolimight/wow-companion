import { readFile, rename, writeFile } from 'node:fs/promises'
import { z } from 'zod'
import type { DatabaseClient } from './database'
import type { Character } from '../shared/domain'
import { newSeasonBests, vaultReadyAlerts, type Alert } from '../shared/alerts'
import { appendTimeline, timelinePoint, timelineSchema, TIMELINE_NAMESPACE } from '../shared/timeline'
import { weekStart } from '../shared/weekly'

const VAULT_WINDOW = 48 * 3_600_000
const seenSchema = z.array(z.string().max(400)).max(2000)

/**
 * Watches the roster after every change: records each character's score and item level over time, and raises a
 * desktop alert for a new season best or a Great Vault waiting after the reset. Alerts are remembered so a
 * restart never repeats one
 */
export function createSeasonWatch(options: { db: DatabaseClient; seenFile: string; deliver(alert: Alert): void; timelineChanged(characterId: string): void }) {
  let previous: Map<string, Character> | null = null
  let seen: Set<string> | null = null
  let queue: Promise<void> = Promise.resolve()

  async function seenKeys() {
    if (seen) return seen
    try { seen = new Set(seenSchema.parse(JSON.parse(await readFile(options.seenFile, 'utf8')))) } catch { seen = new Set() }
    return seen
  }
  async function raise(alerts: Alert[]) {
    if (!alerts.length) return
    const keys = await seenKeys()
    const fresh = alerts.filter(alert => !keys.has(alert.key))
    if (!fresh.length) return
    for (const alert of fresh) { keys.add(alert.key); options.deliver(alert) }
    const temporary = `${options.seenFile}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify([...keys].slice(-2000)))
    await rename(temporary, options.seenFile)
  }

  async function pass() {
    const characters = (await options.db.call('listCharacters', false)).filter(character => !character.demo)
    const alerts: Alert[] = []
    for (const character of characters) {
      const before = previous?.get(character.id)
      if (before) alerts.push(...newSeasonBests(before, character))
      const stored = timelineSchema.safeParse((await options.db.call('getFeatureState', character.id, TIMELINE_NAMESPACE)) ?? {})
      const next = appendTimeline(stored.success ? stored.data : null, timelinePoint(character, new Date().toISOString()))
      if (next) { await options.db.call('saveFeatureState', character.id, TIMELINE_NAMESPACE, next); options.timelineChanged(character.id) }
    }
    // The first pass only sets the baseline, so nothing already known is announced as new
    previous = new Map(characters.map(character => [character.id, character]))
    alerts.push(...vaultAlerts(characters))
    await raise(alerts)
  }
  function vaultAlerts(characters: Character[], now = Date.now()) {
    return vaultReadyAlerts(characters, now).filter(alert => {
      const character = characters.find(entry => entry.id === alert.characterId)
      const start = character ? weekStart(character.region, now) : null
      return start != null && now - start < VAULT_WINDOW
    })
  }

  return {
    /** Runs after every roster change; passes are serialized so two changes never race */
    observe() {
      queue = queue.then(pass).catch(error => console.warn('Season watch:', error instanceof Error ? error.message : error))
      return queue
    },
  }
}
export type SeasonWatch = ReturnType<typeof createSeasonWatch>
