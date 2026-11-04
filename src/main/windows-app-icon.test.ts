import { afterEach, expect, it, vi } from 'vite-plus/test'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import type { ShortcutDetails } from 'electron'
import { persistWindowsIcon, taskbarDetails, updatePinnedAppIcons, windowsAppId } from './windows-app-icon'

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
