import type { AiFeatureId, AiFeatureInput, AiProviderInfo } from '../../shared/ai'
import type { Character } from '../../shared/domain'

/** One prompt for a provider: fixed instructions, the question, and the JSON Schema the answer must follow */
export type AiRunRequest = {
  instructions: string
  prompt: string
  schema: Record<string, unknown>
  /** An empty folder the CLI runs in, so it never sees the player's files */
  workDir: string
  signal?: AbortSignal
}

/**
 * A provider plugin: an assistant CLI on the player's computer. It reports whether it is installed and signed in, and
 * runs one prompt with no tools beyond reading, returning the parsed JSON answer
 */
export interface AiProvider {
  id: string
  name: string
  description: string
  detect(): Promise<Pick<AiProviderInfo, 'installed' | 'version' | 'signedIn' | 'detail'>>
  run(request: AiRunRequest): Promise<unknown>
}

/** What a feature may read about the player beyond its own input */
/** What a feature's prompt may use: the character the question is about, and its build's talents by name when known */
export type AiFeatureContext = { character: Character | null; talents?: { hero: string | null; names: string[] } | null }

/**
 * A feature plugin: builds the prompt for its input and gives the schema its answer follows. The answer is checked
 * against the feature's output schema in src/shared/ai.ts before the page sees it
 */
export interface AiFeature<Id extends AiFeatureId = AiFeatureId> {
  id: Id
  instructions: string
  schema: Record<string, unknown>
  prompt(input: AiFeatureInput<Id>, context: AiFeatureContext): string
}
