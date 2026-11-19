import type { AiFeature } from '../types'

const clock = (ms: number) => `${Math.floor(ms / 60_000)}:${String(Math.floor(ms / 1000) % 60).padStart(2, '0')}`
const amount = (value: number) => value >= 1e6 ? `${(value / 1e6).toFixed(1)}M` : value >= 1e3 ? `${Math.round(value / 1e3)}K` : String(Math.round(value))

/**
 * A short review of one fight from a public Warcraft Logs report. The assistant sees only the numbers the app read for
 * this player, so every finding has to rest on one of them
 */
export const fightReview: AiFeature<'fightReview'> = {
  id: 'fightReview',
  instructions: [
    'You review one World of Warcraft fight for one player, from a summary of their Warcraft Logs numbers.',
    'Use only the numbers you are given, and tie every finding to one of them: an ability share, a cast count, damage taken, or a death.',
    'Find what most likely held the player back: deaths and what caused them, avoidable damage taken, abilities cast too rarely for their spec, and a damage profile that looks off for their spec.',
    'Give at most five findings, most important first, each with a short title and one or two sentences of advice. Then a two-sentence summary.',
    'If the numbers can\'t support a finding, leave it out rather than guess.',
    'Reply only with JSON that matches the schema.',
  ].join(' '),
  schema: {
    type: 'object',
    additionalProperties: false,
    required: ['findings', 'summary'],
    properties: {
      findings: {
        type: 'array',
        items: { type: 'object', additionalProperties: false, required: ['title', 'detail'], properties: { title: { type: 'string' }, detail: { type: 'string' } } },
      },
      summary: { type: 'string' },
    },
  },
  prompt(input, { character, talents }) {
    const fight = input.fight
    const who = character && character.specName !== 'Unknown' ? `${character.specName} ${character.className}` : character?.className ?? 'player'
    return [
      `Player: ${who}${character?.itemLevel ? `, item level ${Math.round(character.itemLevel)}` : ''}${talents?.hero ? `, ${talents.hero} hero talents` : ''}`,
      `Fight: ${fight.name}${fight.keystoneLevel ? ` +${fight.keystoneLevel}` : ''}, ${fight.kill === true ? 'a kill' : fight.kill === false ? 'a wipe' : 'outcome unknown'}, ${clock(fight.durationMs)} long`,
      `Damage done: ${amount(fight.damage.total)} total, ${amount(fight.damage.perSecond)} per second\n${fight.damage.top.map(row => `- ${row.name}: ${amount(row.total)} (${fight.damage.total ? Math.round(row.total / fight.damage.total * 100) : 0}%)`).join('\n')}`,
      `Damage taken: ${amount(fight.taken.total)} total\n${fight.taken.top.map(row => `- ${row.name}: ${amount(row.total)}`).join('\n')}`,
      `Casts:\n${fight.casts.map(row => `- ${row.name}: ${row.count}`).join('\n')}`,
      fight.deaths.length ? `Deaths:\n${fight.deaths.map(death => `- at ${clock(Math.max(0, death.atMs))}${death.killingBlow ? `, killed by ${death.killingBlow}` : ''}`).join('\n')}` : 'Deaths: none',
    ].join('\n\n')
  },
}
