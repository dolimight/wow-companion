import type { AiFeature } from '../types'

/**
 * Chooses whole gear sets worth a precise SimulationCraft run from each piece's screening gain. The engine measures the
 * final sets, so the assistant only proposes them; it is never the source of a number the page shows
 */
export const gearCombos: AiFeature<'gearCombos'> = {
  id: 'gearCombos',
  instructions: [
    'You help a World of Warcraft player choose gear sets to test in SimulationCraft.',
    'Each candidate was simulated alone in place of what is equipped in its slot; gainPercent is that single swap\'s change in damage and noisePercent its margin of error.',
    'A gain inside its noise is no gain: never pick it, and never trade an equipped piece for a lower item level one unless its gain clearly clears the noise.',
    'Count tier pieces before replacing one, so a swap never breaks a set bonus the player has unless the screening shows it still wins.',
    'Propose up to six sets the simple best-per-slot pick could miss. First, sets of owned gear only. Then sets that add one to three targets to the best owned set, the realistic next upgrades to farm; never a whole set of targets.',
    'Use only candidate keys you are given, at most one per slot, and follow every rule listed.',
    'Give each set a short label and one sentence on why it is worth testing. Then write a two-sentence summary: the owned swap that matters most, if any, and the single target worth getting first.',
    'Reply only with JSON that matches the schema.',
  ].join(' '),
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['combos', 'summary'],
    properties: {
      combos: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false, required: ['label', 'picks', 'why'],
          properties: {
            label: { type: 'string' },
            picks: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['slot', 'key'], properties: { slot: { type: 'string' }, key: { type: 'string' } } } },
            why: { type: 'string' },
          },
        },
      },
      summary: { type: 'string' },
    },
  },
  prompt(input, { character }) {
    const who = character && character.specName !== 'Unknown' ? `${character.specName} ${character.className}` : character?.className ?? 'player'
    const percent = (value: number) => `${value >= 0 ? '+' : ''}${value.toFixed(2)}%`
    return [
      `Player: ${who}. Fight: ${input.scenario}`,
      `Equipped now:\n${input.equipped.map(item => `- ${item.slot}: ${item.name}${item.itemLevel ? ` (${item.itemLevel})` : ''}`).join('\n')}`,
      `Candidates (key | slot | item | level | owned or target, and where from | single-swap gain with its noise | share of top players wearing it):\n${input.candidates.map(item => `- ${item.key} | ${item.slot} | ${item.name} | ${item.itemLevel ?? '?'} | ${item.origin} | ${percent(item.gainPercent)} ±${item.noisePercent.toFixed(2)}% | ${item.popularity == null ? 'n/a' : `${Math.round(item.popularity * 100)}%`}`).join('\n')}`,
      `Rules:\n${input.rules.map(rule => `- ${rule}`).join('\n')}`,
    ].join('\n\n')
  },
}
