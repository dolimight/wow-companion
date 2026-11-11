import { describe, expect, it } from 'vite-plus/test'
import { realmChanges, realmSlug } from './realm-alerts'

const realm = (id: number, up: boolean, ...names: string[]) => ({ id, up, realms: names.map(name => ({ name, slug: realmSlug(name) })) })
const dolimight = { id: 'a', name: 'Dolimight', realm: 'Gurubashi', region: 'us' }
const alt = { id: 'b', name: 'Altimight', realm: "Aman'Thul", region: 'us' }

describe('realm up and down alerts', () => {
  it('records the first check without announcing anything', () => {
    const { alerts, next } = realmChanges(null, 'us', [realm(1, false, 'Gurubashi')], [dolimight], 't0')
    expect(alerts).toEqual([])
    expect(next.get(1)).toBe(false)
  })

  it('announces a realm going down and coming back, named after the player’s own realm', () => {
    const up = realmChanges(null, 'us', [realm(1, true, 'Bloodhoof', 'Gurubashi')], [dolimight], 't0').next
    const down = realmChanges(up, 'us', [realm(1, false, 'Bloodhoof', 'Gurubashi')], [dolimight], 't1')
    expect(down.alerts).toMatchObject([{ title: 'Gurubashi is down', characterId: 'a' }])
    const back = realmChanges(down.next, 'us', [realm(1, true, 'Bloodhoof', 'Gurubashi')], [dolimight], 't2')
    expect(back.alerts).toMatchObject([{ title: 'Gurubashi is back up', body: 'Dolimight can log in again' }])
  })

  it('ignores realms without the player’s characters, other regions, and unchanged realms', () => {
    const before = new Map([[1, true], [2, true]])
    const { alerts } = realmChanges(before, 'us', [realm(1, true, 'Gurubashi'), realm(2, false, "Aman'Thul"), realm(3, false, 'Stormrage')], [dolimight, alt, { ...alt, id: 'c', region: 'eu' }], 't1')
    expect(alerts.map(alert => alert.title)).toEqual(["Aman'Thul is down"])
  })
})
