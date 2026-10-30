import { copyFile, mkdir, readdir, readFile, rm, stat } from 'node:fs/promises'
import path from 'node:path'

export type AddonStatus = {
  bundledVersion: string | null
  installedVersion: string | null
  state: 'not-installed' | 'installed' | 'update-available'
  savedVariables: Array<{ account: string; modifiedAt: string }>
}

const FILES = ['WoWCompanion.toc', 'WoWCompanion.lua', 'MountPreview.lua', 'OutfitPreview.lua']

async function tocVersion(dir: string) {
  try { return (await readFile(path.join(dir, 'WoWCompanion.toc'), 'utf8')).match(/^##\s*Version:\s*(.+)$/m)?.[1]?.trim() ?? null } catch { return null }
}

const newer = (a: string, b: string) => {
  const x = a.split('.').map(Number), y = b.split('.').map(Number)
  for (let i = 0; i < Math.max(x.length, y.length); i++) { if ((x[i] ?? 0) !== (y[i] ?? 0)) return (x[i] ?? 0) > (y[i] ?? 0) }
  return false
}

export function addonFolder(retail: string) { return path.join(retail, 'Interface', 'AddOns', 'WoWCompanion') }

/** SavedVariables files are listed per account folder; paths never leave the main process */
export async function savedVariableFiles(retail: string) {
  const accounts = path.join(retail, 'WTF', 'Account')
  const found: Array<{ account: string; file: string; modifiedAt: string }> = []
  let names: string[] = []
  try { names = await readdir(accounts) } catch { return found }
  for (const account of names) {
    const file = path.join(accounts, account, 'SavedVariables', 'WoWCompanion.lua')
    try { const info = await stat(file); if (info.isFile()) found.push({ account, file, modifiedAt: info.mtime.toISOString() }) } catch { /* not exported yet */ }
  }
  return found.sort((a, b) => b.modifiedAt.localeCompare(a.modifiedAt))
}

export async function addonStatus(bundledDir: string, retail: string): Promise<AddonStatus> {
  const bundledVersion = await tocVersion(bundledDir)
  const installedVersion = await tocVersion(addonFolder(retail))
  const state = !installedVersion ? 'not-installed' : bundledVersion && newer(bundledVersion, installedVersion) ? 'update-available' : 'installed'
  return { bundledVersion, installedVersion, state, savedVariables: (await savedVariableFiles(retail)).map(({ account, modifiedAt }) => ({ account, modifiedAt })) }
}

/** Copies only the addon's own files into the game's AddOns folder */
export async function installAddon(bundledDir: string, retail: string) {
  try { await stat(path.join(retail, 'Interface')) } catch { await mkdir(path.join(retail, 'Interface'), { recursive: true }) }
  const target = addonFolder(retail)
  await mkdir(target, { recursive: true })
  for (const file of FILES) await copyFile(path.join(bundledDir, file), path.join(target, file))
  return tocVersion(target)
}

/** Deletes only the addon's own folder; the game's saved data and every other addon stay untouched */
export async function removeAddon(retail: string) {
  const target = addonFolder(retail)
  if (path.basename(target) !== 'WoWCompanion' || !target.startsWith(path.join(retail, 'Interface', 'AddOns') + path.sep)) throw new Error('Unexpected addon folder')
  await rm(target, { recursive: true, force: true })
}
