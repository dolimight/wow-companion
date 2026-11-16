import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { fetchDungeonEnemies, scriptObject } from './keystone-guru'

const embed = '<script src="https://assets.keystone.guru/compiled/v16.3.0/js/app-v16.3.0.js"></script><script src="https://assets.keystone.guru/compiled/v16.3.0/mapcontext/data/den-of-nalorakk/1991/facade.js"></script>'
const npcs = `let mapContextDungeonData = ${JSON.stringify({ dungeonNpcs: [
  { id: 241808, name: 'Territorial Matriarch', dangerous: 0, classification_id: 2, class: { key: 'melee' }, npc_healths: [{ health: 1200000 }] },
  { id: 241900, name: 'Venom Shaman', dangerous: 1, classification_id: 2, class: { key: 'caster' } },
  { id: 241812, name: 'The Hoardmonger', dangerous: 1, classification_id: 3, class: { key: 'melee' } },
] })};`
const facade = `let mapContextMappingVersionData = ${JSON.stringify({ mappingVersion: { enemy_forces_required: 729 }, npcEnemyForces: [{ id: 241808, enemy_forces: { enemy_forces: 8 } }, { id: 241900, enemy_forces: 5 }, { id: 241812, enemy_forces: null }] })};`

afterEach(() => { vi.unstubAllGlobals() })

describe('Keystone Guru enemies', () => {
  it('reads every enemy with its danger flag, kind, and forces from the public data files', async () => {
    const asked: string[] = []
    vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
      asked.push(url)
      expect(init.redirect).toBe('error')
      if (url.includes('/embed')) return new Response(embed)
      if (url.endsWith('/den-of-nalorakk/en_US.js')) return new Response(npcs)
      if (url.endsWith('/1991/facade.js')) return new Response(facade)
      return new Response('missing', { status: 404 })
    }))
    const result = await fetchDungeonEnemies('den-of-nalorakk', 'G6mLASJ')
    expect(asked).toContain('https://assets.keystone.guru/compiled/v16.3.0/mapcontext/data/den-of-nalorakk/en_US.js')
    expect(result.forcesRequired).toBe(729)
    expect(result.enemies).toEqual([
      { npcId: 241808, name: 'Territorial Matriarch', dangerous: false, kind: 'melee', elite: true, boss: false, health: 1200000, forces: 8 },
      { npcId: 241900, name: 'Venom Shaman', dangerous: true, kind: 'caster', elite: true, boss: false, health: null, forces: 5 },
      { npcId: 241812, name: 'The Hoardmonger', dangerous: true, kind: 'melee', elite: false, boss: true, health: null, forces: null },
    ])
  })

  it('still lists enemies without forces when no route names the mapping', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => url === 'https://keystone.guru/' ? new Response('<script src="https://assets.keystone.guru/compiled/v16.3.0/js/app.js"></script>') : new Response(npcs)))
    const result = await fetchDungeonEnemies('den-of-nalorakk', null)
    expect(result.forcesRequired).toBeNull()
    expect(result.enemies.every(enemy => enemy.forces === null)).toBe(true)
  })

  it('refuses unknown dungeon slugs and pages it cannot read', async () => {
    await expect(fetchDungeonEnemies('../etc', null)).rejects.toThrow('Unknown dungeon')
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html>no assets</html>')))
    await expect(fetchDungeonEnemies('den-of-nalorakk', null)).rejects.toThrow('enemies are unavailable')
  })

  it('reads the data object without running the script', () => {
    expect(scriptObject('let x = {"a":1};')).toEqual({ a: 1 })
    expect(() => scriptObject('alert(1)')).toThrow()
  })
})
