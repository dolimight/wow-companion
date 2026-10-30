import type { DatabaseClient } from './database'

export type SyncTrigger = 'startup' | 'manual' | 'focus'
export type SyncResult = { id: string; name: string; ok: boolean; message: string | null }
export type SyncState = {
  running: boolean
  trigger: SyncTrigger | null
  startedAt: string | null
  finishedAt: string | null
  done: number
  total: number
  current: string | null
  results: SyncResult[]
  /** Whether the addon's saved game data is being read automatically */
  addonFile: { watching: boolean; checkedAt: string | null; error: string | null }
}

const STALE_AFTER = 10 * 60_000

type SyncDeps = {
  db: DatabaseClient
  refreshCharacter(id: string): Promise<unknown>
  /** Finds the game folder and the addon's saved data when neither is known yet; never throws */
  discover(): Promise<void>
  /** Re-reads the addon's saved data now */
  checkAddonFile(): Promise<void>
  addonFile(): { path: string | null; lastCheckAt: string | null; error: string | null }
  changed(): Promise<void>
}

/** Plain-language reasons; technical details stay out of the interface */
function friendly(error: unknown) {
  const message = error instanceof Error ? error.message : ''
  if (/rate limit/i.test(message)) return 'Too many requests right now, it will retry next time'
  if (/not found|private|unavailable/i.test(message)) return 'Not found online, the character may be private or recently renamed'
  if (/fetch failed|network|timeout|aborted|ENOTFOUND|ECONN/i.test(message)) return 'No internet connection'
  return message ? message.slice(0, 140) : 'Could not update'
}

/** One pass that brings every tracked character up to date from the game, Blizzard, and Raider.IO */
export function createSync(deps: SyncDeps) {
  let state: SyncState = { running: false, trigger: null, startedAt: null, finishedAt: null, done: 0, total: 0, current: null, results: [], addonFile: { watching: false, checkedAt: null, error: null } }
  let active: Promise<SyncState> | null = null
  const file = () => { const info = deps.addonFile(); return { watching: !!info.path, checkedAt: info.lastCheckAt, error: info.error } }
  const publish = (patch: Partial<SyncState>) => { state = { ...state, ...patch, addonFile: file() }; void deps.changed() }

  async function pass(trigger: SyncTrigger) {
    publish({ running: true, trigger, startedAt: new Date().toISOString(), done: 0, total: 0, current: null, results: [] })
    try {
      await deps.discover()
      await deps.checkAddonFile().catch(() => {})
      const characters = (await deps.db.call('listCharacters', false)).filter(character => !character.demo)
      publish({ total: characters.length })
      const results: SyncResult[] = []
      // One at a time keeps provider rate limits happy and shows steady progress
      for (const character of characters) {
        publish({ current: character.name })
        try { await deps.refreshCharacter(character.id); results.push({ id: character.id, name: character.name, ok: true, message: null }) }
        catch (error) { results.push({ id: character.id, name: character.name, ok: false, message: friendly(error) }) }
        publish({ done: results.length, results: [...results] })
      }
    } finally {
      publish({ running: false, current: null, finishedAt: new Date().toISOString() })
    }
    return state
  }

  return {
    get state() { return { ...state, addonFile: file() } },
    /** Startup and manual runs always happen; a focus run only when the last one is old */
    run(trigger: SyncTrigger) {
      if (active) return active
      if (trigger === 'focus' && state.finishedAt && Date.now() - Date.parse(state.finishedAt) < STALE_AFTER) return Promise.resolve(state)
      active = pass(trigger).finally(() => { active = null })
      return active
    },
  }
}
export type Sync = ReturnType<typeof createSync>
