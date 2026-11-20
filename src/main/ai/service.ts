import { fightReview } from './features/fight-review'
import { talentSummary, type TalentTree } from '../../shared/talents'
import { mkdtemp, rm } from 'node:fs/promises'
import path from 'node:path'
import { aiFeatures, type AiAnswer, type AiFeatureId, type AiFeatureInput, type AiFeatureOutput, type AiProviderInfo, type AiStatus } from '../../shared/ai'
import type { Character } from '../../shared/domain'
import { bossCoach } from './features/boss-coach'
import { gearCombos } from './features/gear-combos'
import { claudeProvider } from './providers/claude'
import { codexProvider } from './providers/codex'
import type { AiFeature, AiProvider } from './types'
import { log } from '../log'

/** The providers and features the app ships with; another plugin is one more entry in either list */
export const builtinProviders = (): AiProvider[] => [codexProvider(), claudeProvider()]
export const builtinFeatures: { [Id in AiFeatureId]: AiFeature<Id> } = { bossCoach, gearCombos, fightReview }

export type AiServiceOptions = {
  providers: AiProvider[]
  features?: Partial<{ [Id in AiFeatureId]: AiFeature<Id> }>
  /** The provider the player picked in Settings, or null when AI help is off */
  selected: () => Promise<string | null>
  character: (id: string) => Promise<Character | null>
  /** Where each question gets its own empty folder */
  scratchDir: string
  /** The installed game's talent tree for a specialization, to name a build's talents in a prompt */
  talentTree?: (specId: number) => Promise<TalentTree | null>
}

export function createAiService(options: AiServiceOptions) {
  const features = { ...builtinFeatures, ...options.features }
  const byId = new Map(options.providers.map(provider => [provider.id, provider]))
  // Checking runs each CLI twice, so a result is reused for a minute unless the player asks again
  let checked: { at: number; value: Promise<AiProviderInfo[]> } | null = null

  function providers(force = false): Promise<AiProviderInfo[]> {
    if (!force && checked && Date.now() - checked.at < 60_000) return checked.value
    const value = Promise.all(options.providers.map(async provider => {
      const found = await provider.detect().catch(error => ({ installed: false, version: null, signedIn: null, detail: (error as Error).message }))
      return { id: provider.id, name: provider.name, description: provider.description, ...found }
    }))
    checked = { at: Date.now(), value }
    value.catch(() => { checked = null })
    return value
  }

  async function status(force = false): Promise<AiStatus> {
    const [selected, list] = await Promise.all([options.selected(), providers(force)])
    return { selected: selected && byId.has(selected) ? selected : null, providers: list }
  }

  async function ask<Id extends AiFeatureId>(id: Id, raw: AiFeatureInput<Id>, signal?: AbortSignal): Promise<AiAnswer<AiFeatureOutput<Id>>> {
    const selected = await options.selected()
    const provider = selected ? byId.get(selected) : undefined
    if (!provider) throw new Error('Connect an AI assistant in Settings first')
    const feature = features[id] as AiFeature<Id> | undefined
    const shape = aiFeatures[id]
    if (!feature || !shape) throw new Error('Unknown AI feature')
    const input = shape.input.parse(raw) as AiFeatureInput<Id>
    const character = 'characterId' in input && typeof input.characterId === 'string' ? await options.character(input.characterId) : null
    // The build's talents by name, from the installed game's tree, so answers can speak to the player's own build
    const tree = character?.talents?.loadout && character.specId && options.talentTree ? await options.talentTree(character.specId).catch(() => null) : null
    const talents = tree && character?.talents?.loadout ? talentSummary(tree, character.talents.loadout) : null
    const workDir = await mkdtemp(path.join(options.scratchDir, `${id}-`))
    const started = Date.now()
    try {
      const answer = await provider.run({ instructions: feature.instructions, prompt: feature.prompt(input, { character, talents }), schema: feature.schema, workDir, signal })
      const parsed = shape.output.safeParse(answer)
      if (!parsed.success) throw new Error(`${provider.name} answered in a shape the app can't use`)
      log.info('ai', `${provider.name} answered ${id}`, { durationMs: Date.now() - started })
      return { provider: provider.name, value: parsed.data as AiFeatureOutput<Id>, durationMs: Date.now() - started }
    } catch (error) {
      log.warn('ai', `${provider.name} failed ${id}`, { durationMs: Date.now() - started, error })
      throw error
    } finally {
      await rm(workDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { status, ask }
}

export type AiService = ReturnType<typeof createAiService>
