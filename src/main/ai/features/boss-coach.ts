import type { AiFeature } from '../types'

const roleNames = { tank: 'tank', healer: 'healer', damage: 'damage dealer' } as const

/**
 * Spec-specific advice for one boss, layered on the strategy the page already shows. The page's own notes go in the
 * prompt so the answer adds to them instead of repeating or contradicting them
 */
export const bossCoach: AiFeature<'bossCoach'> = {
  id: 'bossCoach',
  instructions: [
    'You coach World of Warcraft players on a single boss fight.',
    'Answer for the player\'s exact class and specialization, naming that spec\'s own abilities, talents, and utility.',
    'Build on the strategy you are given: don\'t repeat it, and never contradict it.',
    'Keep each tip to one or two short sentences, written as a direct instruction.',
    'If you aren\'t sure a detail is right for the current season, leave it out rather than guess.',
    'Reply only with JSON that matches the schema.',
  ].join(' '),
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['tips', 'cooldowns'],
    properties: {
      tips: { type: 'array', description: 'Two to five things this spec does on this fight', items: { type: 'string' } },
      cooldowns: {
        type: 'array',
        description: 'Up to four cooldowns or utility spells and the mechanic to use each on',
        items: { type: 'object', additionalProperties: false, required: ['ability', 'when'], properties: { ability: { type: 'string' }, when: { type: 'string' } } },
      },
    },
  },
  prompt(input, { character }) {
    const who = character && character.specName !== 'Unknown' ? `${character.specName} ${character.className}` : character?.className ?? 'player'
    return [
      `Player: ${who}, playing as a ${roleNames[input.role]}`,
      `Fight: ${input.boss} in ${input.instance}, ${input.difficulty}`,
      input.notes.length ? `Strategy the player already has:\n${input.notes.map(line => `- ${line}`).join('\n')}` : 'The player has no written strategy for this fight yet',
    ].join('\n\n')
  },
}
