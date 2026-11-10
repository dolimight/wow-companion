import { describe, expect, it } from 'vite-plus/test'
import { parseConnectedRealms } from './blizzard'

// Trimmed from the shape of /data/wow/search/connected-realm, where names come once per locale
const realm = (id: number, slug: string, name: string) => ({ id, slug, name: { en_US: name, de_DE: `${name} DE` }, timezone: 'America/Chicago', category: { en_US: 'United States' } })
const page = { page: 1, pageSize: 3, maxPageSize: 1000, pageCount: 1, results: [
  { key: { href: 'x' }, data: { id: 11, has_queue: false, status: { type: 'UP', name: { en_US: 'Up' } }, population: { type: 'FULL', name: { en_US: 'Full' } }, realms: [realm(1, 'stormrage', 'Stormrage')] } },
  { key: { href: 'x' }, data: { id: 12, has_queue: true, status: { type: 'UP' }, population: { type: 'HIGH' }, realms: [realm(3, 'zuljin', "Zul'jin"), realm(2, 'area-52', 'Area 52')] } },
  { key: { href: 'x' }, data: { id: 13, has_queue: false, status: { type: 'DOWN' }, population: null, realms: [realm(4, 'illidan', 'Illidan')] } },
] }

describe('connected realm status', () => {
  it('reads up, down, queue, and population with English names, sorted by first realm name', () => {
    expect(parseConnectedRealms([page])).toEqual([
      { id: 12, realms: [{ name: 'Area 52', slug: 'area-52' }, { name: "Zul'jin", slug: 'zuljin' }], up: true, population: 'High', queue: true, timezone: 'America/Chicago' },
      { id: 13, realms: [{ name: 'Illidan', slug: 'illidan' }], up: false, population: null, queue: false, timezone: 'America/Chicago' },
      { id: 11, realms: [{ name: 'Stormrage', slug: 'stormrage' }], up: true, population: 'Full', queue: false, timezone: 'America/Chicago' },
    ])
  })
  it('rejects a response that is not a realm list', () => {
    expect(() => parseConnectedRealms([{ results: [{ data: { id: 'x' } }] }])).toThrow()
  })
})
