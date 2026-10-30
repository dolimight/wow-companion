import { randomBytes, randomUUID } from 'node:crypto'
import { mkdir, readdir, rm, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { z } from 'zod'
import type { DatabaseClient } from '../database'
import type { GameDataClient } from '../gamedata/client'
import { readInstall } from '../gamedata/install'
import type { SecretStore } from '../secrets'
import { addonStatus, installAddon, removeAddon, savedVariableFiles, type AddonStatus } from './addon'
import { REDIRECT_URI, waitForAuthorizationCode } from './oauth-loopback'
import { authorizeUrl, BlizzardApi, BlizzardError, blizzardRegions, fetchAccountCharacters, fetchBlizzardProfile, fetchCollectedAppearances, fetchRealms, realmSlug, requestToken, userInfo, type AccountCharacter, type BlizzardCredentials, type BlizzardProfile, type BlizzardRegion } from '../providers/blizzard'
import type { Character } from '../../shared/domain'
import type { GameDataStatus } from '../../shared/gamedata'

export type ConnectionsStatus = {
  gameData: GameDataStatus
  addon: AddonStatus | null
  blizzard: { configured: boolean; region: BlizzardRegion | null; clientIdHint: string | null; persistent: boolean }
  battlenet: { signedIn: boolean; battletag: string | null; expiresAt: string | null }
  redirectUri: string
  addonWatching: string | null
}

const credentialsSchema = z.object({ clientId: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9]+$/, 'A Client ID uses only letters and numbers'), clientSecret: z.string().trim().min(16).max(100).regex(/^[A-Za-z0-9]+$/, 'A Client Secret uses only letters and numbers'), region: z.enum(blizzardRegions) })
const sessionSchema = z.object({ accessToken: z.string(), expiresAt: z.number(), battletag: z.string().nullable(), region: z.enum(blizzardRegions) })
const RENDER_HOSTS = new Set(['render.worldofwarcraft.com', 'render-us.worldofwarcraft.com', 'render-eu.worldofwarcraft.com', 'render-kr.worldofwarcraft.com', 'render-tw.worldofwarcraft.com'])

export type ConnectionsOptions = {
  db: DatabaseClient
  gameData: GameDataClient
  secrets: SecretStore
  addonDir: string
  assetsDir: string
  changed(characterId?: string): Promise<void>
  setWatchPath(path: string | null): Promise<void>
  watchedPath(): string | null
}

export function createConnections(options: ConnectionsOptions) {
  const { db, gameData, secrets } = options
  let api: BlizzardApi | null = null
  let pendingSignIn: { state: string; cancel(): void; code: Promise<string>; credentials: BlizzardCredentials } | null = null
  const realmCache = new Map<BlizzardRegion, string[]>()

  async function credentials(): Promise<BlizzardCredentials | null> {
    const raw = await secrets.get('blizzard-client')
    if (!raw) return null
    try { return credentialsSchema.parse(JSON.parse(raw)) } catch { return null }
  }
  async function blizzard() {
    const value = await credentials()
    if (!value) throw new Error('Connect Blizzard data in Settings first')
    if (!api || api.credentials.clientId !== value.clientId || api.credentials.clientSecret !== value.clientSecret || api.credentials.region !== value.region) api = new BlizzardApi(value)
    return api
  }
  async function session() {
    const raw = await secrets.get('battlenet-session')
    if (!raw) return null
    try { const value = sessionSchema.parse(JSON.parse(raw)); return value.expiresAt > Date.now() + 60_000 ? value : null } catch { return null }
  }
  async function install() {
    const status = gameData.currentStatus
    return status.install ? readInstall(status.install.root) : null
  }

  async function status(): Promise<ConnectionsStatus> {
    const found = await install()
    const value = await credentials()
    const signed = await session()
    return {
      gameData: gameData.currentStatus,
      addon: found ? await addonStatus(options.addonDir, found.retail).catch(() => null) : null,
      blizzard: { configured: !!value, region: value?.region ?? null, clientIdHint: value ? `…${value.clientId.slice(-4)}` : null, persistent: secrets.persistent },
      battlenet: { signedIn: !!signed, battletag: signed?.battletag ?? null, expiresAt: signed ? new Date(signed.expiresAt).toISOString() : null },
      redirectUri: REDIRECT_URI,
      addonWatching: options.watchedPath() ? path.basename(path.dirname(path.dirname(options.watchedPath()!))) : null,
    }
  }

  /** Detects (or re-reads) the install, remembers it, and prepares item data in the background */
  async function useInstallPath(candidate: string | null) {
    const result = await gameData.call('configure', candidate)
    if (result.install) await db.call('setSettings', { wowInstallPath: result.install.root })
    else if (candidate) throw new Error('That folder does not contain World of Warcraft')
    if (result.state === 'not-indexed') void gameData.call('ensureIndex', false).catch(() => {})
    await options.changed()
    return result
  }

  /** Renders are copied locally so the roster works offline and the page never loads remote images */
  async function cacheRenders(characterId: string, renders: BlizzardProfile['renders']): Promise<Character['renders']> {
    const dir = path.join(options.assetsDir, 'renders')
    await mkdir(dir, { recursive: true })
    for (const name of await readdir(dir)) if (name.startsWith(`${characterId}-`)) await rm(path.join(dir, name), { force: true }).catch(() => {})
    const result: NonNullable<Character['renders']> = { main: null, inset: null, avatar: null, observedAt: new Date().toISOString() }
    for (const key of ['main', 'inset', 'avatar'] as const) {
      const url = renders[key]
      if (!url) continue
      try {
        const parsed = new URL(url)
        if (parsed.protocol !== 'https:' || !RENDER_HOSTS.has(parsed.hostname)) continue
        const response = await fetch(parsed, { redirect: 'error', signal: AbortSignal.timeout(15_000) })
        const type = response.headers.get('content-type') ?? ''
        if (!response.ok || !/^image\/(png|jpeg|webp)$/.test(type)) continue
        const data = Buffer.from(await response.arrayBuffer())
        if (data.length > 6 * 1024 * 1024) continue
        const file = `${characterId}-${key}-${randomUUID().slice(0, 8)}.${type.endsWith('png') ? 'png' : type.endsWith('webp') ? 'webp' : 'jpg'}`
        await writeFile(path.join(dir, file), data)
        result[key] = `wow-asset://renders/${file}`
      } catch { /* a missing render keeps the initial avatar */ }
    }
    return result
  }

  async function applyProfile(characterId: string, profile: BlizzardProfile, collected: number[] | null) {
    const renders = await cacheRenders(characterId, profile.renders)
    const character = await db.call('applyBlizzardProfile', characterId, { ...profile, renders, collectedAppearanceIds: collected })
    await options.changed(characterId)
    return character
  }

  async function collectedForAccount(region: BlizzardRegion) {
    const signed = await session()
    if (!signed || signed.region !== region) return null
    return fetchCollectedAppearances(await blizzard(), signed.accessToken, region)
  }

  async function refreshCharacter(characterId: string) {
    const character = await db.call('getCharacter', characterId)
    if (!character) throw new Error('Character was not found')
    if (character.demo) throw new Error('Demo characters use fictional data and cannot refresh from live providers')
    const region = character.region.toLowerCase() as BlizzardRegion
    if (!blizzardRegions.includes(region)) throw new Error('Blizzard data is not available for this region')
    const profile = await fetchBlizzardProfile(await blizzard(), { region, realm: character.realm, name: character.name })
    return applyProfile(characterId, profile, await collectedForAccount(region))
  }

  async function addCharacter(input: { region: BlizzardRegion; realm: string; name: string }) {
    const lookup = z.object({ region: z.enum(blizzardRegions), realm: z.string().trim().min(1).max(100), name: z.string().trim().min(2).max(24) }).parse(input)
    const profile = await fetchBlizzardProfile(await blizzard(), lookup)
    const ref = { provider: 'blizzard' as const, edition: 'retail' as const, region: lookup.region, realmId: profile.realmSlug, characterKey: String(profile.characterId) }
    const existing = await db.call('findCharacterByRef', ref, profile.name, profile.realm)
    const character = existing ?? await db.call('addCharacter', { edition: 'retail', region: lookup.region, realm: profile.realm, name: profile.name, sourceRefs: [ref] })
    if (existing?.archived) await db.call('restoreCharacter', existing.id)
    return applyProfile(character.id, profile, await collectedForAccount(lookup.region))
  }

  return {
    status,
    refreshCharacter,
    addCharacter,
    async initialize() {
      const settings = await db.call('getSettings')
      // Detection runs from the setup assistant; startup only reopens a folder the user already confirmed
      if (settings.wowInstallPath) await useInstallPath(settings.wowInstallPath).catch(() => {})
    },
    detectInstall: () => useInstallPath(null),
    /** Quietly finds the game, keeps the addon current, and starts reading its saved data; failures just leave things as they were */
    async discover(allowDetect: boolean) {
      try {
        if (!gameData.currentStatus.install && allowDetect) await useInstallPath(null)
        const found = await install()
        if (!found) return
        const addon = await addonStatus(options.addonDir, found.retail).catch(() => null)
        if (addon?.state === 'update-available') await installAddon(options.addonDir, found.retail).catch(() => {})
        if (!options.watchedPath()) {
          const files = await savedVariableFiles(found.retail)
          if (files[0]) await options.setWatchPath(files[0].file)
        }
      } catch { /* detection is best effort */ }
    },
    useInstallPath,
    async rebuildIndex() { await gameData.call('ensureIndex', true); await options.changed() },
    async installAddon() {
      const found = await install()
      if (!found) throw new Error('Find World of Warcraft before installing the addon')
      try { await installAddon(options.addonDir, found.retail) } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        throw new Error(code === 'EPERM' || code === 'EACCES' ? 'Windows blocked writing to the World of Warcraft folder. Close the game and try again, or copy the addon folder manually' : 'The addon could not be installed')
      }
      const files = await savedVariableFiles(found.retail)
      if (files[0] && !options.watchedPath()) await options.setWatchPath(files[0].file)
      await options.changed()
      return status()
    },
    async removeAddon() {
      const found = await install()
      if (!found) throw new Error('Find World of Warcraft first')
      try { await removeAddon(found.retail) } catch (error) {
        const code = (error as NodeJS.ErrnoException).code
        throw new Error(code === 'EPERM' || code === 'EACCES' || code === 'EBUSY' ? 'Windows blocked removing the addon. Close the game and try again' : 'The addon could not be removed')
      }
      await options.changed()
      return status()
    },
    async useSavedVariables(account: string) {
      const found = await install()
      if (!found) throw new Error('Find World of Warcraft first')
      const file = (await savedVariableFiles(found.retail)).find(entry => entry.account === account)
      if (!file) throw new Error('No addon data was found for that account yet. Log in to a character with the addon enabled, then type /reload')
      await options.setWatchPath(file.file)
      await options.changed()
    },
    async setBlizzardKey(input: unknown) {
      const value = credentialsSchema.parse(input)
      await requestToken(value, { grant_type: 'client_credentials' })
      await secrets.set('blizzard-client', JSON.stringify(value))
      api = null
      realmCache.clear()
      await options.changed()
      return status()
    },
    async clearBlizzardKey() {
      pendingSignIn?.cancel()
      await secrets.delete('blizzard-client')
      await secrets.delete('battlenet-session')
      api = null
      await options.changed()
    },
    async realms(region: BlizzardRegion) {
      if (!realmCache.has(region)) realmCache.set(region, await fetchRealms(await blizzard(), region))
      return realmCache.get(region)!
    },
    async beginSignIn() {
      const value = await credentials()
      if (!value) throw new Error('Connect Blizzard data before signing in with Battle.net')
      pendingSignIn?.cancel()
      const state = randomBytes(24).toString('hex')
      const listener = waitForAuthorizationCode(state)
      listener.code.catch(() => {})
      pendingSignIn = { state, cancel: listener.cancel, code: listener.code, credentials: value }
      return { url: authorizeUrl(value, REDIRECT_URI, state) }
    },
    async completeSignIn(): Promise<AccountCharacter[]> {
      const pending = pendingSignIn
      if (!pending) throw new Error('Start Battle.net sign-in first')
      try {
        const code = await pending.code
        const token = await requestToken(pending.credentials, { grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
        const info = await userInfo(token.accessToken).catch(() => ({ battletag: undefined }))
        await secrets.set('battlenet-session', JSON.stringify({ accessToken: token.accessToken, expiresAt: token.expiresAt, battletag: info.battletag ?? null, region: pending.credentials.region }))
        await options.changed()
        return fetchAccountCharacters(await blizzard(), token.accessToken, pending.credentials.region)
      } finally { if (pendingSignIn === pending) pendingSignIn = null }
    },
    cancelSignIn() { pendingSignIn?.cancel(); pendingSignIn = null },
    async accountCharacters() {
      const signed = await session()
      if (!signed) throw new Error('Sign in with Battle.net to list your characters')
      return fetchAccountCharacters(await blizzard(), signed.accessToken, signed.region)
    },
    async importAccountCharacters(characters: Array<{ name: string; realm: string }>) {
      const signed = await session()
      if (!signed) throw new Error('Sign in with Battle.net to import your characters')
      const imported: string[] = [], failed: Array<{ name: string; reason: string }> = []
      for (const entry of characters.slice(0, 60)) {
        try { imported.push((await addCharacter({ region: signed.region, realm: entry.realm, name: entry.name })).id) } catch (error) { failed.push({ name: entry.name, reason: error instanceof Error ? error.message : 'Import failed' }) }
      }
      return { imported, failed }
    },
    async signOut() { await secrets.delete('battlenet-session'); await options.changed() },
    /** Deletes the cached Blizzard pictures of a removed character */
    async forgetRenders(characterId: string) {
      const dir = path.join(options.assetsDir, 'renders')
      for (const name of await readdir(dir).catch(() => [] as string[])) if (name.startsWith(`${characterId}-`)) await rm(path.join(dir, name), { force: true }).catch(() => {})
    },
    blizzardConfigured: async () => !!await credentials(),
    /** The Blizzard client for read-only Game Data requests, or null without a key */
    blizzardApi: async () => (await credentials()) ? blizzard() : null,
    rendersDir: () => path.join(options.assetsDir, 'renders'),
    realmSlug,
    isRateLimit: (error: unknown) => error instanceof BlizzardError && error.status === 429,
  }
}
export type Connections = ReturnType<typeof createConnections>
