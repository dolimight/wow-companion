import { afterEach, describe, expect, it } from 'vite-plus/test'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createEnhancementFixture } from './acceptance-fixture'
import { GameDataEngine } from './engine'
import { readInstall } from './install'

const folders: string[] = []
const engines: GameDataEngine[] = []
afterEach(async () => { for (const engine of engines.splice(0)) await engine.close(); for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true }) })

describe('desktop acceptance game data fixture', () => {
  // The packaged smoke run searches this fixture, so it must keep up with every index format change
  it('serves every item search filter at the current index format', async () => {
    const folder = mkdtempSync(path.join(tmpdir(), 'wow-acceptance-')); folders.push(folder)
    const root = await createEnhancementFixture(folder)
    const engine = new GameDataEngine(path.join(folder, 'gamedata'), { status: () => {} }); engines.push(engine)
    await engine.useInstall((await readInstall(root))!)
    expect(engine.getStatus().state).toBe('ready')
    const query = { slot: 'head' as const, character: { className: 'Mage', specId: 62, level: 90 }, limit: 40 }
    for (const filters of [{}, { currentOnly: true }, { withEffect: true }, { stat: 'haste' as const }, { source: 'dungeon' as const }, { source: 'crafted' as const }]) {
      expect(() => engine.searchPage({ ...query, ...filters })).not.toThrow()
    }
    expect(engine.searchPage({ ...query, currentOnly: true }).items[0]?.name).toContain('Acceptance Crown')
    expect(() => engine.instances(true)).not.toThrow()
  })
})
