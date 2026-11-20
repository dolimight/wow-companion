import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { logFileName, scrub } from './log'

/** Values inside text that look like credentials, which a key-based scrub can't see */
const secretValues: Array<[RegExp, string]> = [
  [/(bearer\s+)[\w.~+/=-]{8,}/gi, '$1[hidden]'],
  [/((?:access_token|refresh_token|client_secret|clientSecret|token|secret|password)["']?\s*[:=]\s*["']?)[^\s"',&}]{4,}/gi, '$1[hidden]'],
  [/\b[A-Fa-f0-9]{40,}\b/g, '[hidden]'],
  [/\b[A-Za-z0-9+/_-]{48,}={0,2}/g, '[hidden]'],
]

/**
 * Text safe to share: credential-looking values hidden, the home folder (which holds the user name) shown as ~, and
 * each character's name and realm replaced
 */
export function redact(text: string, home: string | null, names: string[] = []): string {
  let value = text
  for (const name of [...new Set(names)].filter(name => name.trim().length >= 2).sort((a, b) => b.length - a.length)) value = value.split(name).join('[character]')
  for (const [pattern, replacement] of secretValues) value = value.replace(pattern, replacement)
  if (home) for (const form of new Set([home, home.replace(/\\/g, '/'), home.replace(/\\/g, '\\\\')])) value = value.split(form).join('~')
  return value
}

export type DiagnosticsInput = {
  app: { version: string; packaged: boolean; platform: string; arch: string; os: string; electron: string }
  settings: Record<string, unknown> | null
  simulationCraft: { configured: boolean }
  ai: { selected: string | null; providers: Array<{ id: string; installed: boolean; signedIn: boolean | null; version: string | null }> } | null
  sync: { finishedAt: string | null; results: Array<{ ok?: boolean; error?: string | null }> } | null
  gameData: unknown
  characters: number
  /** Character names and realms, removed from the report */
  names: string[]
  logDirectory: string
  now: Date
  home: string | null
}

/** The last lines of today's and yesterday's logs, newest last */
async function recentLog(directory: string, now: Date, lines: number): Promise<string[]> {
  const days = [new Date(now.getTime() - 86_400_000), now].map(logFileName)
  const all: string[] = []
  for (const name of days) all.push(...(await readFile(path.join(directory, name), 'utf8').catch(() => '')).split('\n').filter(Boolean))
  return all.slice(-lines)
}

/**
 * A text report for troubleshooting: versions, settings, connections, the last sync, and the recent log. It never
 * names characters or realms, never includes keys or tokens, and shows the home folder as ~
 */
export async function diagnosticsText(input: DiagnosticsInput, logLines = 300): Promise<string> {
  const failed = input.sync?.results.filter(result => result.ok === false || !!result.error).length ?? 0
  const sections = [
    `WOW Companion ${input.app.version}${input.app.packaged ? '' : ' (development)'} · ${input.app.platform} ${input.app.arch} ${input.app.os} · Electron ${input.app.electron}`,
    `Generated ${input.now.toISOString()} · ${input.characters} characters`,
    `Settings: ${JSON.stringify(scrub(input.settings ?? {}))}`,
    `SimulationCraft: ${input.simulationCraft.configured ? 'chosen' : 'not chosen'}`,
    `AI assistant: ${input.ai ? `${input.ai.selected ?? 'off'} · ${input.ai.providers.map(provider => `${provider.id} ${provider.installed ? `installed${provider.version ? ` ${provider.version}` : ''}` : 'not installed'}${provider.installed ? provider.signedIn === true ? ', signed in' : provider.signedIn === false ? ', signed out' : ', sign-in unknown' : ''}`).join(' · ')}` : 'unknown'}`,
    `Last sync: ${input.sync?.finishedAt ?? 'never'}${input.sync ? ` · ${input.sync.results.length} characters, ${failed} could not update` : ''}`,
    `Game data: ${JSON.stringify(scrub(input.gameData))}`,
    `Recent log:\n${(await recentLog(input.logDirectory, input.now, logLines)).join('\n') || '(empty)'}`,
  ]
  return redact(sections.join('\n\n'), input.home, input.names)
}
