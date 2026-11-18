import type { AiFeature } from '../types'

/**
 * Chooses whole gear sets worth a precise SimulationCraft run from each piece's screening gain. The engine measures the
 * final sets, so the assistant only proposes them; it is never the source of a number the page shows
 */
export const gearCombos: AiFeature<'gearCombos'> = {
  id: 'gearCombos',
  instructions: [
    'You help a World of Warcraft player choose gear sets to test in SimulationCraft.',
    'Each candidate was simulated alone in place of what is equipped in its slot; gainPercent is that single swap\'s change in damage.',
    'Propose up to eight complete sets that could beat the simple best-per-slot pick: weigh tier set bonuses, two rings and two trinkets together, secondary stat balance, and what top players wear.',
    'Use only candidate keys you are given, at most one per slot, and follow every rule listed.',
    'Give each set a short label and one sentence on why it is worth testing, then a two-sentence summary of what the screening shows.',
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
      `Candidates (key | slot | item | level | where it comes from | single-swap gain | share of top players wearing it):\n${input.candidates.map(item => `- ${item.key} | ${item.slot} | ${item.name} | ${item.itemLevel ?? '?'} | ${item.origin} | ${percent(item.gainPercent)} | ${item.popularity == null ? 'n/a' : `${Math.round(item.popularity * 100)}%`}`).join('\n')}`,
      `Rules:\n${input.rules.map(rule => `- ${rule}`).join('\n')}`,
    ].join('\n\n')
  },
}
