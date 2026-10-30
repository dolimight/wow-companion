import { afterEach, describe, expect, it, vi } from 'vite-plus/test'
import { createInsights } from './insights'
import { BlizzardApi, type BlizzardRegion } from './providers/blizzard'
import type { GameDataClient } from './gamedata/client'
import type { ItemDetail } from '../shared/gamedata'

afterEach(() => vi.restoreAllMocks())

const item: ItemDetail = {
  id: 123, name: 'Indexed blade', quality: 4, itemLevel: 600, requiredLevel: 80,
  slot: 'mainHand', inventoryType: 13, armor: null, icon: 456, expansion: 11,
  sources: [{ encounter: 'Example boss', instance: 'Example dungeon', kind: 'dungeon' }],
  classId: 2, subclassId: 7, bonding: 'Binds when picked up', sockets: 1,
  description: '', appearances: [],
}

const response = { preview_item: {
  level: { value: 600 }, binding: { name: 'Binds when picked up' },
  inventory_type: { name: 'One-hand' }, item_subclass: { name: 'Sword' },
  armor: { display: { display_string: '140 Armor' } },
  stats: [
    { display: { display_string: '+1,234 Agility', color: { r: 255, g: 255, b: 255 } } },
    { display: { display_string: '+567 Haste', color: { r: 0, g: 255, b: 0 } } },
    { display: { display_string: '+999 Intellect' }, is_negated: true },
  ],
  weapon: { damage: { display_string: '123 - 456 Damage' }, attack_speed: { display_string: 'Speed 2.60' }, dps: { display_string: '(111 damage per second)' } },
  spells: [{ description: 'Equip: An exact item effect' }], sockets: [{ socket_type: { name: 'Prismatic' } }],
  requirements: { level: { display_string: 'Requires Level 80' } }, set: { display_string: 'Example set (0/5)' },
} }

function apiFor(region: BlizzardRegion = 'us') {
  const api = new BlizzardApi({ clientId: 'fixture', clientSecret: 'fixture', region })
  const get = vi.spyOn(api, 'get').mockResolvedValue(response)
  return { api, get }
}

function fixture(blizzardApi: () => Promise<BlizzardApi | null>) {
  const call = vi.fn(async () => item as ItemDetail | null)
  const insights = createInsights({ cacheDir: '.', blizzardApi, gameData: { call } as unknown as GameDataClient })
  return { insights, call }
}

describe('item tooltip enrichment', () => {
  it('keeps indexed details usable without a key and enriches them after connecting', async () => {
    const { api, get } = apiFor()
    let connected = false
    const { insights } = fixture(async () => connected ? api : null)
    await expect(insights.itemTooltip(item.id)).resolves.toEqual({ item, preview: null })
    expect(get).not.toHaveBeenCalled()
    connected = true
    expect((await insights.itemTooltip(item.id)).preview?.level).toBe(600)
    expect(get).toHaveBeenCalledOnce()
  })

  it('returns local details when obtaining a connected API fails', async () => {
    const { insights } = fixture(async () => { throw new Error('Key unavailable') })
    await expect(insights.itemTooltip(item.id)).resolves.toEqual({ item, preview: null })
  })

  it('retries a failed request and a missing preview rather than caching either indefinitely', async () => {
    const { api, get } = apiFor()
    get.mockRejectedValueOnce(new Error('Temporary outage')).mockResolvedValueOnce({ id: item.id })
    const { insights } = fixture(async () => api)
    await expect(insights.itemTooltip(item.id)).resolves.toEqual({ item, preview: null })
    await expect(insights.itemTooltip(item.id)).resolves.toEqual({ item, preview: null })
    expect((await insights.itemTooltip(item.id)).preview?.stats).toHaveLength(3)
    expect(get).toHaveBeenCalledTimes(3)
  })

  it('preserves exact API display strings independently of the local index', async () => {
    const { api, get } = apiFor()
    const { insights, call } = fixture(async () => api)
    call.mockRejectedValueOnce(new Error('Index unavailable'))
    await expect(insights.itemTooltip(item.id)).resolves.toEqual({ item: null, preview: {
      level: 600, binding: 'Binds when picked up', slot: 'One-hand', subclass: 'Sword',
      weapon: ['123 - 456 Damage', 'Speed 2.60', '(111 damage per second)'],
      stats: [{ text: '140 Armor', secondary: false }, { text: '+1,234 Agility', secondary: false }, { text: '+567 Haste', secondary: true }],
      effects: ['Equip: An exact item effect'], sockets: ['Prismatic'], requirement: 'Requires Level 80', set: 'Example set (0/5)',
    } })
    expect(get).toHaveBeenCalledWith('/data/wow/item/123', 'static', { signal: undefined, what: 'This item' })
  })

  it('shares an in-flight preview request and reuses successful results', async () => {
    const { api, get } = apiFor()
    let finish!: (value: unknown) => void
    get.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const { insights } = fixture(async () => api)
    const first = insights.itemTooltip(item.id)
    const second = insights.itemTooltip(item.id)
    await vi.waitFor(() => expect(get).toHaveBeenCalledOnce())
    finish(response)
    expect(await first).toEqual(await second)
    await insights.itemTooltip(item.id)
    expect(get).toHaveBeenCalledOnce()
  })

  it('expires successful previews and separates regions', async () => {
    const clock = vi.spyOn(Date, 'now').mockReturnValue(1_000)
    const us = apiFor('us')
    const eu = apiFor('eu')
    let connected = us.api
    const { insights } = fixture(async () => connected)
    await insights.itemTooltip(item.id)
    connected = eu.api
    await insights.itemTooltip(item.id)
    expect(eu.get).toHaveBeenCalledOnce()
    connected = us.api
    await insights.itemTooltip(item.id)
    expect(us.get).toHaveBeenCalledOnce()
    clock.mockReturnValue(1_000 + 24 * 3_600_000)
    await insights.itemTooltip(item.id)
    expect(us.get).toHaveBeenCalledTimes(2)
  })

  it('bounds cached previews while keeping recently used items', async () => {
    const { api, get } = apiFor()
    const { insights } = fixture(async () => api)
    for (let id = 1; id <= 800; id++) await insights.itemTooltip(id)
    await insights.itemTooltip(1)
    await insights.itemTooltip(801)
    await insights.itemTooltip(1)
    expect(get).toHaveBeenCalledTimes(801)
    await insights.itemTooltip(2)
    expect(get).toHaveBeenCalledTimes(802)
  })
})
