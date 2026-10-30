import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import path from 'node:path'

export type SecretCodec = { available(): boolean; encrypt(value: string): Buffer; decrypt(value: Buffer): string }
export type SecretName = 'blizzard-client' | 'battlenet-session' | 'warcraftlogs-client'

/** Secrets live only in the main process; the renderer only ever sees whether one exists */
export interface SecretStore {
  readonly persistent: boolean
  get(name: SecretName): Promise<string | null>
  set(name: SecretName, value: string): Promise<void>
  delete(name: SecretName): Promise<void>
}

/** Each value is encrypted with the operating system's credential protection (Electron safeStorage) */
export class EncryptedFileStore implements SecretStore {
  readonly persistent = true
  private queue: Promise<unknown> = Promise.resolve()
  constructor(private readonly file: string, private readonly codec: SecretCodec) {}
  private async load(): Promise<Record<string, string>> {
    try { const value: unknown = JSON.parse(await readFile(this.file, 'utf8')); return value && typeof value === 'object' ? value as Record<string, string> : {} } catch { return {} }
  }
  private serial<T>(operation: () => Promise<T>) { const next = this.queue.then(operation, operation); this.queue = next.catch(() => {}); return next }
  async get(name: SecretName) {
    const encoded = (await this.load())[name]
    if (!encoded || !this.codec.available()) return null
    try { return this.codec.decrypt(Buffer.from(encoded, 'base64')) } catch { return null }
  }
  set(name: SecretName, value: string) {
    return this.serial(async () => {
      if (!this.codec.available()) throw new Error('This computer cannot protect saved keys, so the key was not saved')
      const all = await this.load()
      all[name] = this.codec.encrypt(value).toString('base64')
      await this.write(all)
    })
  }
  delete(name: SecretName) { return this.serial(async () => { const all = await this.load(); delete all[name]; await this.write(all) }) }
  private async write(all: Record<string, string>) {
    await mkdir(path.dirname(this.file), { recursive: true })
    const temporary = `${this.file}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify(all), { encoding: 'utf8', mode: 0o600 })
    await rename(temporary, this.file)
  }
}

/** Development and tests keep secrets for the session only */
export class MemorySecretStore implements SecretStore {
  readonly persistent = false
  private values = new Map<SecretName, string>()
  async get(name: SecretName) { return this.values.get(name) ?? null }
  async set(name: SecretName, value: string) { this.values.set(name, value) }
  async delete(name: SecretName) { this.values.delete(name) }
}
