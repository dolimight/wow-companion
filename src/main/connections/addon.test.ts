import { expect, it } from 'vite-plus/test'
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { addonFolder, addonStatus, installAddon } from './addon'

it('updates every TOC module while preserving the player’s saved addon data', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'wow-addon-install-'))
  try {
    const bundled = fileURLToPath(new URL('../../../addon/', import.meta.url))
    const retail = path.join(directory, '_retail_')
    const target = addonFolder(retail)
    await mkdir(target, { recursive: true })
    await writeFile(path.join(target, 'WoWCompanion.toc'), '## Version: 0.4.2\n')
    const saved = path.join(retail, 'WTF', 'Account', 'test', 'SavedVariables')
    await mkdir(saved, { recursive: true })
    await writeFile(path.join(saved, 'WoWCompanion.lua'), 'player data')
    expect((await addonStatus(bundled, retail)).state).toBe('update-available')
    await installAddon(bundled, retail)
    const toc = await readFile(path.join(bundled, 'WoWCompanion.toc'), 'utf8')
    const files = ['WoWCompanion.toc', ...toc.split(/\r?\n/).filter(line => line.endsWith('.lua'))]
    for (const file of files) {
      expect(await readFile(path.join(target, file), 'utf8')).toBe(await readFile(path.join(bundled, file), 'utf8'))
    }
    expect((await addonStatus(bundled, retail)).state).toBe('installed')
    expect(await readFile(path.join(saved, 'WoWCompanion.lua'), 'utf8')).toBe('player data')
  } finally { await rm(directory, { recursive: true, force: true }) }
})
