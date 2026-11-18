import { appendFile, mkdir, readdir, rm } from 'node:fs/promises'
import path from 'node:path'

/**
 * Daily log files for troubleshooting: one file per day under the app's data folder, kept for today and yesterday and
 * purged after that. Secrets never reach a log: values under keys that look like credentials are replaced
 */
export type LogLevel = 'info' | 'warn' | 'error'

const secretKey = /token|secret|password|authorization|cookie|apikey|api_key|clientsecret/i
const day = (date: Date) => date.toISOString().slice(0, 10)
export const logFileName = (date: Date) => `companion-${day(date)}.log`

/** A value made safe and short enough for one log line */
export function scrub(value: unknown, depth = 0): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message.slice(0, 2000), stack: value.stack?.split('\n').slice(0, 8).join('\n') }
  if (typeof value === 'string') return value.length > 4000 ? `${value.slice(0, 4000)}…` : value
  if (value == null || typeof value !== 'object') return value
  if (depth > 4) return '…'
  if (Array.isArray(value)) return value.slice(0, 50).map(entry => scrub(entry, depth + 1))
  return Object.fromEntries(Object.entries(value).slice(0, 60).map(([key, entry]) => [key, secretKey.test(key) ? '[hidden]' : scrub(entry, depth + 1)]))
}

/** Log files older than yesterday, the ones a purge removes */
export function expiredLogs(names: string[], now: Date, keepDays = 2): string[] {
  const oldest = day(new Date(now.getTime() - (keepDays - 1) * 86_400_000))
  return names.filter(name => { const date = name.match(/^companion-(\d{4}-\d{2}-\d{2})\.log$/)?.[1]; return !!date && date < oldest })
}

export function createLog(options: { directory: string; now?: () => Date; keepDays?: number; echo?: boolean }) {
  const now = options.now ?? (() => new Date())
  let writing: Promise<void> = mkdir(options.directory, { recursive: true }).then(() => {}, () => {})
  const write = (level: LogLevel, scope: string, message: string, data?: unknown) => {
    const at = now()
    const line = `${at.toISOString()} ${level.toUpperCase().padEnd(5)} [${scope}] ${message}${data === undefined ? '' : ` ${JSON.stringify(scrub(data))}`}\n`
    if (options.echo) (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line.trimEnd())
    // Writes are queued so lines never interleave, and a failed write never throws into the caller
    writing = writing.then(() => appendFile(path.join(options.directory, logFileName(at)), line, 'utf8')).catch(() => {})
    return writing
  }
  return {
    directory: options.directory,
    info: (scope: string, message: string, data?: unknown) => void write('info', scope, message, data),
    warn: (scope: string, message: string, data?: unknown) => void write('warn', scope, message, data),
    error: (scope: string, message: string, data?: unknown) => void write('error', scope, message, data),
    /** Waits for every queued line, for tests and shutdown */
    flush: () => writing,
    async purge() {
      const names = await readdir(options.directory).catch(() => [] as string[])
      await Promise.all(expiredLogs(names, now(), options.keepDays).map(name => rm(path.join(options.directory, name), { force: true }).catch(() => {})))
    },
  }
}
export type Log = ReturnType<typeof createLog>

/** The app's log, set up at startup; before then, and in tests, lines go nowhere */
let current: Log | null = null
export function useLog(log: Log | null) { current = log }
export const log = {
  info: (scope: string, message: string, data?: unknown) => current?.info(scope, message, data),
  warn: (scope: string, message: string, data?: unknown) => current?.warn(scope, message, data),
  error: (scope: string, message: string, data?: unknown) => current?.error(scope, message, data),
}
