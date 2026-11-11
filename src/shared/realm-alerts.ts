import type { Alert } from './alerts'

/** Same rule as Blizzard's realm slugs, so a character's realm name finds its connected realm */
export const realmSlug = (realm: string) => realm.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

type ConnectedRealm = { id: number; up: boolean; realms: Array<{ name: string; slug: string }> }
type Player = { id: string; name: string; realm: string; region: string; archived?: boolean; demo?: boolean }

const names = (list: string[]) => list.length <= 2 ? list.join(' and ') : `${list.slice(0, 2).join(', ')} and ${list.length - 2} more`

/**
 * Alerts for the player's own realms that went down or came back since the last check. The first check of a
 * region only records the baseline, so a realm already down at launch isn't announced as news
 */
export function realmChanges(previous: ReadonlyMap<number, boolean> | null, region: string, realms: ConnectedRealm[], characters: Player[], at: string): { alerts: Alert[]; next: Map<number, boolean> } {
  const bySlug = new Map(realms.flatMap(realm => realm.realms.map(entry => [entry.slug, realm] as const)))
  const watched = new Map<number, { realm: ConnectedRealm; name: string; characters: Player[] }>()
  for (const character of characters) {
    if (character.archived || character.demo || character.region !== region) continue
    const slug = realmSlug(character.realm)
    const realm = bySlug.get(slug)
    if (!realm) continue
    const entry = watched.get(realm.id) ?? { realm, name: realm.realms.find(item => item.slug === slug)?.name ?? character.realm, characters: [] }
    entry.characters.push(character)
    watched.set(realm.id, entry)
  }
  const next = new Map([...watched].map(([id, entry]) => [id, entry.realm.up]))
  if (!previous) return { alerts: [], next }
  const alerts: Alert[] = []
  for (const [id, { realm, name, characters: players }] of watched) {
    const was = previous.get(id)
    if (was === undefined || was === realm.up) continue
    const who = names(players.map(player => player.name))
    alerts.push(realm.up
      ? { key: `realm-up:${region}:${id}:${at}`, characterId: players[0]!.id, title: `${name} is back up`, body: `${who} can log in again` }
      : { key: `realm-down:${region}:${id}:${at}`, characterId: players[0]!.id, title: `${name} is down`, body: `Blizzard reports the realm offline · ${who} can't log in until it's back` })
  }
  return { alerts, next }
}
