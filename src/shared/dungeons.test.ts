import { describe, expect, it } from 'vite-plus/test'
import { bestFamily, bossPace, clock, journalFlags, journalSpellText, journalText, keystoneTimers, placeholderTitle, routeEmbedUrl, specRole, type JournalSpell, type RouteFamily } from './dungeons'

const spells = new Map<number, JournalSpell>([
  [1, { name: 'Ravenous Bellow', description: 'Inflicting $s1 Physical damage to all players and an additional $s2 Physical damage every $t2 sec for $d. Ignores armor.', durationMs: 10_000, effects: [{ index: 0, periodMs: 0, basePoints: 17 }, { index: 1, periodMs: 1000, basePoints: 3 }] }],
  [2, { name: 'Spoiled Supplies', description: 'Tosses rotten food over $d, hitting players for $3s1 Nature damage or littering $@spellname4s around the arena.', durationMs: 7000, effects: [] }],
  [3, { name: 'Spoiled Supplies', description: '$@spelldesc2', durationMs: null, effects: [{ index: 0, periodMs: 0, basePoints: 10 }] }],
  [4, { name: 'Rotten Mushroom', description: '', durationMs: null, effects: [] }],
  [5, { name: 'Putrid Burst', description: 'After $6d the mushroom bursts, inflicting $s1 Nature damage.', durationMs: null, effects: [] }],
  [7, { name: 'Resourceful Measures', description: 'Casts at $s1%, $s2%, and $s3% health.$?DIFF8|DIFF23[][ He can only keep one.]', durationMs: null, effects: [{ index: 0, periodMs: 0, basePoints: 90 }, { index: 1, periodMs: 0, basePoints: 70 }, { index: 2, periodMs: 0, basePoints: 40 }] }],
])

describe('journal text', () => {
  it('turns spell links, bullets, and difficulty passages into plain text for Mythic+', () => {
    expect(journalText('$bullet; Kick |cFF2959D3|Hspell:1235072|h[Resourceful Measures]|h|r now')).toBe('• Kick Resourceful Measures now')
    expect(journalText('Always. $[!23,8\n\nNot on Mythic.$]$[8 On keys.$]')).toBe('Always. On keys.')
    // Passages can hold bullets, and Mythic-only text applies to keys
    expect(journalText('$[23$bullet; Shivercores trigger Rimeshatter.$]\n$[1,2$bullet; Shivercores only drift.$]')).toBe('• Shivercores trigger Rimeshatter.')
  })
  it('leaves out server-scaled amounts but keeps durations, tick periods, and percentages', () => {
    expect(journalSpellText(spells.get(1)!.description, 1, spells)).toBe('Inflicting Physical damage to all players and an additional Physical damage every 1 sec for 10 sec. Ignores armor.')
    expect(journalSpellText(spells.get(7)!.description, 7, spells)).toBe('Casts at 90%, 70%, and 40% health.')
  })
  it('follows linked names and descriptions, and drops phrases built on a missing duration', () => {
    expect(journalSpellText(spells.get(3)!.description, 3, spells)).toBe('Tosses rotten food over 7 sec, hitting players for Nature damage or littering Rotten Mushrooms around the arena.')
    expect(journalSpellText(spells.get(5)!.description, 5, spells)).toBe('The mushroom bursts, inflicting Nature damage.')
    expect(journalSpellText('Inflicting $s1 Frost damage to players within $a1 yards of targets.', 9, spells)).toBe('Inflicting Frost damage to players near targets.')
  })
  it('reads the journal flag bits and placeholder titles', () => {
    expect(journalFlags(4128)).toEqual(['important', 'mythic'])
    expect(journalFlags(512 | 64)).toEqual(['interruptible', 'poison'])
    expect(placeholderTitle('Section 12')).toBe(true)
    expect(placeholderTitle('Rotten Mushroom')).toBe(false)
  })
})

describe('routes and timers', () => {
  const family = (id: string, runs: number, timed: number, routeKey: string | null): RouteFamily => ({ familyId: id, runs, timed, medianClearMs: null, fastestClearMs: null, highestKey: null, latestAt: null, routeKey })
  it('follows the most timed route that has a map, falling back to the most timed', () => {
    expect(bestFamily([family('a', 9000, 8900, null), family('b', 5000, 4900, 'KEY')])?.familyId).toBe('b')
    expect(bestFamily([family('a', 9000, 8900, null), family('b', 5000, 4900, null)])?.familyId).toBe('a')
    expect(bestFamily([])).toBeNull()
  })
  it('gives the +2 and +3 timers and an even pace per boss', () => {
    expect(keystoneTimers(1_920_000)).toEqual({ plusOne: 1_920_000, plusTwo: 1_536_000, plusThree: 1_152_000 })
    expect(bossPace(keystoneTimers(1_920_000), 1, 3)).toEqual({ plusOne: 1_280_000, plusTwo: 1_024_000, plusThree: 768_000 })
    expect(clock(1_536_000)).toBe('25:36')
  })
  it('builds the public embed address and picks the role for a spec', () => {
    expect(routeEmbedUrl('den-of-nalorakk', 'G6mLASJ')).toBe('https://keystone.guru/route/den-of-nalorakk/G6mLASJ/den-of-nalorakk/embed?style=compact&showAffixes=0')
    expect([specRole(250), specRole(65), specRole(71), specRole(null)]).toEqual(['tank', 'healer', 'damage', 'damage'])
  })
})
