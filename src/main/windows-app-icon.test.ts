import { afterEach, expect, it, vi } from 'vite-plus/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ShortcutDetails } from 'electron'
import { persistWindowsIcon, refreshPinnedShellItems, alignShortcutActivator, appIdentity, registerToastIdentity, taskbarDetails, updatePinnedAppIcons, windowsAppId } from './windows-app-icon'

const directories: string[] = []
afterEach(async () => { for (const directory of directories.splice(0)) await rm(directory, { recursive: true, force: true }) })
async function fixture(links: Record<string, ShortcutDetails>) {
  const directory = await mkdtemp(path.join(tmpdir(), 'wow-taskbar-'))
  directories.push(directory)
  for (const name of Object.keys(links)) await writeFile(path.join(directory, name), '')
  const shell = {
    readShortcutLink: vi.fn((file: string) => links[path.basename(file)]!),
    writeShortcutLink: vi.fn((_file: string, _operation: 'update', _details: ShortcutDetails) => true),
  }
  return { directory, shell }
}
const executable = 'C:\\Apps\\WOW Companion.exe'
const icon = 'C:\\UserData\\app-icons\\halloween.ico'

it('updates only this installation’s pin and preserves all other shortcut properties', async () => {
  const { directory, shell } = await fixture({
    'mine.lnk': { target: executable.toUpperCase(), appUserModelId: windowsAppId, args: '--profile original', cwd: 'C:\\Apps', description: 'Original' },
    'legacy.lnk': { target: executable },
    'other.lnk': { target: executable, appUserModelId: 'another.app' },
    'other-install.lnk': { target: 'D:\\Apps\\WOW Companion.exe', appUserModelId: windowsAppId },
    'not-a-link.txt': { target: executable },
  })
  expect(await updatePinnedAppIcons(directory, executable, icon, shell)).toBe(2)
  expect(shell.writeShortcutLink.mock.calls).toEqual([
    [path.join(directory, 'legacy.lnk'), 'update', { target: executable, icon, iconIndex: 0 }],
    [path.join(directory, 'mine.lnk'), 'update', { target: executable.toUpperCase(), icon, iconIndex: 0 }],
  ])
})
it('never changes another Electron development app’s pin', async () => {
  const { directory, shell } = await fixture({
    'own.lnk': { target: executable, args: '"C:\\Code\\wow"' },
    'other.lnk': { target: executable, args: '"C:\\Code\\other"' },
    'bare.lnk': { target: executable },
  })
  expect(await updatePinnedAppIcons(directory, executable, icon, shell, 'C:\\Code\\wow')).toBe(1)
  expect(path.basename(shell.writeShortcutLink.mock.calls[0]![0])).toBe('own.lnk')
})
it('skips unchanged and unreadable links and surfaces a matching pin’s write failure', async () => {
  const { directory, shell } = await fixture({ 'unchanged.lnk': { target: executable, icon, iconIndex: 0 }, 'broken.lnk': { target: executable } })
  shell.readShortcutLink.mockImplementation(file => { if (file.endsWith('broken.lnk')) throw Error('corrupt'); return { target: executable, icon, iconIndex: 0 } })
  expect(await updatePinnedAppIcons(directory, executable, icon, shell)).toBe(0)
  expect(shell.writeShortcutLink).not.toHaveBeenCalled()
  shell.readShortcutLink.mockReturnValue({ target: executable })
  shell.writeShortcutLink.mockReturnValue(false)
  await expect(updatePinnedAppIcons(directory, executable, icon, shell)).rejects.toThrow('Windows could not update')
})
it('persists selected icon bytes outside the installation and tolerates no taskbar folder', async () => {
  const { directory, shell } = await fixture({})
  const source = path.join(directory, 'shipping.ico')
  await writeFile(source, 'first icon')
  const destination = await persistWindowsIcon(source, path.join(directory, 'persistent'))
  expect(await readFile(destination, 'utf8')).toBe('first icon')
  await writeFile(source, 'updated icon')
  await persistWindowsIcon(source, path.join(directory, 'persistent'))
  expect(await readFile(destination, 'utf8')).toBe('updated icon')
  expect(await updatePinnedAppIcons(path.join(directory, 'missing'), executable, icon, shell)).toBe(0)
})
it('sets one stable identity with a correctly quoted relaunch command', () => {
  expect(taskbarDetails(executable, icon)).toEqual({ appId: windowsAppId, appIconPath: icon, appIconIndex: 0, relaunchCommand: `"${executable}"`, relaunchDisplayName: 'WOW Companion' })
  expect(taskbarDetails(executable, icon, 'C:\\Code\\My App').relaunchCommand).toBe(`"${executable}" "C:\\Code\\My App"`)
})
it('reports every pin of this app, rewritten or already current, so Explorer can reload stale buttons', async () => {
  const { directory, shell } = await fixture({
    'changed.lnk': { target: executable },
    'current.lnk': { target: executable, icon, iconIndex: 0 },
    'other.lnk': { target: executable, appUserModelId: 'another.app' },
  })
  const onMatched = vi.fn(async (_files: string[]) => undefined)
  expect(await updatePinnedAppIcons(directory, executable, icon, shell, undefined, onMatched)).toBe(1)
  expect(onMatched).toHaveBeenCalledOnce()
  expect(onMatched.mock.calls[0]![0].map(file => path.basename(file))).toEqual(['changed.lnk', 'current.lnk'])
  onMatched.mockClear()
  await updatePinnedAppIcons(directory, executable, icon, shell, undefined, onMatched)
  expect(onMatched.mock.calls[0]![0]).toHaveLength(2)
  await updatePinnedAppIcons(path.join(directory, 'missing'), executable, icon, shell, undefined, onMatched)
  expect(onMatched).toHaveBeenCalledOnce()
})
it('passes link paths to PowerShell through the environment, never the script text', async () => {
  const run = vi.fn((_file: string, _args: string[], _options: { env: NodeJS.ProcessEnv }, callback: (error: Error | null) => void) => callback(null))
  const directory = path.win32.join('C:', 'Users', 'Me', 'Pins', `it's "quoted"`)
  const files = [path.win32.join(directory, 'WOW Companion.lnk')]
  expect(await refreshPinnedShellItems(directory, files, run as never)).toBe(true)
  const [file, args, options] = run.mock.calls[0]!
  expect(file).toBe('powershell.exe')
  expect(args.slice(0, 3)).toEqual(['-NoProfile', '-NonInteractive', '-Command'])
  expect(args.join(' ')).not.toContain('Pins')
  expect(JSON.parse(options.env.WOW_SHELL_REFRESH!)).toEqual({ directory, files })
  expect(await refreshPinnedShellItems(directory, [], run as never)).toBe(false)
  expect(run).toHaveBeenCalledOnce()
  run.mockImplementationOnce((_file, _args, _options, callback) => callback(new Error('blocked')))
  expect(await refreshPinnedShellItems(directory, files, run as never)).toBe(false)
})

it('keeps development runs apart from the installed app’s name, data, identity, and activator', () => {
  const installed = appIdentity(true), development = appIdentity(false)
  expect(installed).toMatchObject({ appId: windowsAppId, displayName: 'WOW Companion', dataFolder: 'wow-companion' })
  expect(development).toMatchObject({ displayName: 'WOW Companion Dev', dataFolder: 'wow-companion-dev' })
  for (const key of ['appId', 'activator', 'displayName', 'dataFolder'] as const) expect(development[key]).not.toBe(installed[key])
  for (const identity of [installed, development]) expect(identity.activator).toMatch(/^\{[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{12}\}$/)
})

it('names the toast identity, icon, activator, and launch command in the per-user registry', async () => {
  const calls: string[][] = []
  const ok = await registerToastIdentity(appIdentity(true), 'C:\\Icons\\classic.png', '"C:\\Apps\\WOW Companion.exe"', (_file, args, _options, callback) => { calls.push(args); callback(null) })
  expect(ok).toBe(true)
  const key = 'HKCU\\Software\\Classes\\AppUserModelId\\local.wowcompanion.desktop'
  expect(calls.slice(0, 3).map(args => [args[1], args[3], args[7]])).toEqual([
    [key, 'DisplayName', 'WOW Companion'],
    [key, 'IconUri', 'C:\\Icons\\classic.png'],
    [key, 'CustomActivator', '{9E1838B3-D189-4651-AF88-03B4767F6514}'],
  ])
  expect(calls[3]).toEqual(['add', 'HKCU\\Software\\Classes\\CLSID\\{9E1838B3-D189-4651-AF88-03B4767F6514}\\LocalServer32', '/ve', '/t', 'REG_SZ', '/d', '"C:\\Apps\\WOW Companion.exe"', '/f'])
  expect(await registerToastIdentity(appIdentity(true), 'x', 'y', (_file, _args, _options, callback) => callback(new Error('denied')))).toBe(false)
})

it('points only this installation’s Start Menu link at the fixed activator', () => {
  const identity = appIdentity(true)
  const writes: Array<[string, ShortcutDetails]> = []
  const links: Record<string, ShortcutDetails> = {
    mine: { target: 'C:\Apps\WOW Companion.exe', appUserModelId: identity.appId, toastActivatorClsid: '{06993883-4B25-45DF-8F02-205B1D5D6E18}' },
    done: { target: 'C:\Apps\WOW Companion.exe', appUserModelId: identity.appId, toastActivatorClsid: identity.activator.toLowerCase() },
    other: { target: 'C:\Other\WOW Companion.exe', appUserModelId: identity.appId },
  }
  const shell = { readShortcutLink: (file: string) => { const link = links[file]; if (!link) throw Error('missing'); return link }, writeShortcutLink: (file: string, _operation: 'update', details: ShortcutDetails) => { writes.push([file, details]); return true } }
  expect(alignShortcutActivator('mine', 'c:\apps\wow companion.exe', identity, shell)).toBe(true)
  expect(alignShortcutActivator('done', 'C:\Apps\WOW Companion.exe', identity, shell)).toBe(false)
  expect(alignShortcutActivator('other', 'C:\Apps\WOW Companion.exe', identity, shell)).toBe(false)
  expect(alignShortcutActivator('missing', 'C:\Apps\WOW Companion.exe', identity, shell)).toBe(false)
  expect(writes).toEqual([['mine', { target: 'C:\Apps\WOW Companion.exe', toastActivatorClsid: identity.activator }]])
})
