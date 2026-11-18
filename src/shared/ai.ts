import { z } from 'zod'

/**
 * Optional AI help runs through an assistant CLI the player already has installed and signed in, so it uses their own
 * subscription. Providers and features are plugins: each provider runs a prompt, each feature builds one and checks the
 * answer, and the app works the same with none connected
 */
export const aiProviderIdSchema = z.string().regex(/^[a-z][a-z0-9-]{1,30}$/)

/** What the app found for one provider on this computer */
export type AiProviderInfo = {
  id: string
  name: string
  /** Where the player signs in and what it uses, shown in Settings */
  description: string
  installed: boolean
  version: string | null
  signedIn: boolean | null
  /** How it is signed in, such as ChatGPT or Claude.ai, or why it can't be used */
  detail: string | null
}

export type AiStatus = { selected: string | null; providers: AiProviderInfo[] }

/** A boss as the coach sees it: the strategy already on the page, so the answer adds to it rather than guessing */
export const bossCoachInputSchema = z.object({
  characterId: z.string().min(1).max(100),
  instance: z.string().min(1).max(120),
  difficulty: z.string().min(1).max(40),
  boss: z.string().min(1).max(120),
  role: z.enum(['tank', 'healer', 'damage']),
  /** The strategy lines and key abilities shown for the boss */
  notes: z.array(z.string().max(600)).max(60),
})
export type BossCoachInput = z.infer<typeof bossCoachInputSchema>

/** Answers are trimmed and capped rather than refused, since a model may give one line too many */
const lines = (most: number, length: number) => z.array(z.string()).transform(list => list.map(line => line.trim().slice(0, length)).filter(Boolean).slice(0, most))

export const bossCoachOutputSchema = z.object({
  /** Things this spec does on this fight that a generic role guide leaves out */
  tips: lines(6, 400).refine(list => list.length > 0, 'The answer had no tips'),
  /** Cooldowns or utility worth planning around a named mechanic */
  cooldowns: z.array(z.object({ ability: z.string(), when: z.string() })).transform(list => list.map(entry => ({ ability: entry.ability.trim().slice(0, 80), when: entry.when.trim().slice(0, 300) })).filter(entry => entry.ability && entry.when).slice(0, 6)),
})
export type BossCoachOutput = z.infer<typeof bossCoachOutputSchema>

/**
 * The gear optimizer's screening results, for choosing which whole sets are worth a precise run. Gains are each piece
 * alone against current gear, so the answer has to judge how pieces combine: set bonuses, paired slots, and stats
 */
export const gearCombosInputSchema = z.object({
  characterId: z.string().min(1).max(100),
  scenario: z.string().min(1).max(120),
  equipped: z.array(z.object({ slot: z.string().max(20), name: z.string().max(200), itemLevel: z.number().nullable() })).max(16),
  candidates: z.array(z.object({ key: z.string().max(80), slot: z.string().max(20), name: z.string().max(200), itemLevel: z.number().nullable(), origin: z.string().max(40), gainPercent: z.number(), popularity: z.number().nullable() })).max(240),
  rules: z.array(z.string().max(300)).max(12),
})
export type GearCombosInput = z.infer<typeof gearCombosInputSchema>
export const gearCombosOutputSchema = z.object({
  combos: z.array(z.object({ label: z.string(), picks: z.array(z.object({ slot: z.string(), key: z.string() })), why: z.string() }))
    .transform(list => list.map(combo => ({ label: combo.label.trim().slice(0, 80), picks: combo.picks.slice(0, 16), why: combo.why.trim().slice(0, 400) })).filter(combo => combo.label && combo.picks.length).slice(0, 8))
    .refine(list => list.length > 0, 'The answer had no sets'),
  summary: z.string().transform(text => text.trim().slice(0, 600)),
})
export type GearCombosOutput = z.infer<typeof gearCombosOutputSchema>

/** Every feature's input and output, so the renderer, the router, and the feature plugins agree */
export const aiFeatures = {
  bossCoach: { input: bossCoachInputSchema, output: bossCoachOutputSchema },
  gearCombos: { input: gearCombosInputSchema, output: gearCombosOutputSchema },
} as const
export type AiFeatureId = keyof typeof aiFeatures
export type AiFeatureInput<Id extends AiFeatureId> = z.infer<(typeof aiFeatures)[Id]['input']>
export type AiFeatureOutput<Id extends AiFeatureId> = z.infer<(typeof aiFeatures)[Id]['output']>

/** A question for a feature, as the renderer sends it */
export const aiAskSchema = z.discriminatedUnion('feature', [z.object({ feature: z.literal('bossCoach'), input: bossCoachInputSchema })])
export type AiAsk = z.infer<typeof aiAskSchema>

/** An answer with the provider that gave it, so the page can credit it */
export type AiAnswer<T> = { provider: string; value: T; durationMs: number }
