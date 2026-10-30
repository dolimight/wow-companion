import { describe, expect, it } from 'vite-plus/test'
import { itemVariantSchema } from './gear-variants'
import { quoteUpgradeVariants } from './observed-upgrades'
import type { EvaluationContext } from './evidence'

const context: EvaluationContext = { now: '2026-10-29T12:00:00.000Z', gameBuild: '12.1.5.70575', seasonId: null, rulesetId: null }
function item() { return itemVariantSchema.parse({ slot: 'head', itemId: 123, name: 'Synthetic helm', itemLevel: 250, itemLink: 'item:123:0:0:0:0:0:0:0:90:0:0:0:0', variantKey: 'observed-helm', instanceId: 'actual-instance', owned: true, upgradeRank: 2, observedAt: context.now, observedUpgrade: { observedAt: context.now, gameBuild: context.gameBuild, currentRank: 2, maxRank: 4, minItemLevel: 247, maxItemLevel: 256, upgradeable: true, levels: [{ rank: 2, itemLevelIncrement: 0, currencies: [{ currencyId: '9001', amount: 999 }], items: [], moneyCost: 999 }, { rank: 3, itemLevelIncrement: 3, currencies: [{ currencyId: '9001', amount: 10 }], items: [{ itemId: 42, amount: 1 }], moneyCost: 10_000 }, { rank: 4, itemLevelIncrement: 6, currencies: [{ currencyId: '9001', amount: 20 }, { currencyId: '9002', amount: 2 }], items: [{ itemId: 42, amount: 2 }], moneyCost: 25_000 }] } }) }
describe('observed client upgrade quotes', () => {
  it('adds costs across future steps while treating item-level increments as relative to the current item', () => {
    const result = quoteUpgradeVariants(item(), context)
    expect(result.reasons).toEqual([])
    expect(result.items.map(value => value.itemLevel)).toEqual([253, 256])
    expect(result.items[1]!.currencyCost).toEqual([{ currencyId: '9001', amount: 30 }, { currencyId: 'item:42', amount: 3 }, { currencyId: 'money', amount: 35_000 }, { currencyId: '9002', amount: 2 }])
    expect(result.items[1]!.instanceId).toBe('actual-instance')
    expect(result.items[1]!.itemLink).toBe(item().itemLink)
    expect(result.items[1]!.variantKey).toBe('observed-helm:upgrade:4')
  })
  it('accepts quoted zero costs without inventing or reapplying discounts', () => {
    const value = item()
    value.observedUpgrade!.levels = value.observedUpgrade!.levels.map(level => ({ ...level, currencies: [], items: [], moneyCost: 0 }))
    expect(quoteUpgradeVariants(value, context).items[1]!.currencyCost).toEqual([])
  })
  it.each(['2026-10-28T11:59:59.000Z', '2026-10-29T12:05:01.000Z'])('rejects stale or future quotes (%s)', observedAt => {
    const value = item(); value.observedUpgrade!.observedAt = observedAt
    expect(quoteUpgradeVariants(value, context).items).toEqual([])
    expect(quoteUpgradeVariants(value, context).reasons[0]).toContain('timestamp')
  })
  it('requires a matching build, exact item identity/link, known level and current rank', () => {
    for (const change of [(value: ReturnType<typeof item>) => { value.observedUpgrade!.gameBuild = '12.1.5.99999' }, (value: ReturnType<typeof item>) => { value.itemLink = null }, (value: ReturnType<typeof item>) => { value.itemLink = 'item:999:0' }, (value: ReturnType<typeof item>) => { value.itemLevel = null }, (value: ReturnType<typeof item>) => { value.upgradeRank = 3 }]) { const value = item(); change(value); expect(quoteUpgradeVariants(value, context).items).toEqual([]) }
  })
  it('stops at a missing step instead of skipping its costs', () => {
    const value = item(); value.observedUpgrade!.levels = value.observedUpgrade!.levels.filter(level => level.rank !== 3)
    expect(quoteUpgradeVariants(value, context)).toMatchObject({ items: [], reasons: ['The upgrade-vendor quote is missing rank 3'] })
  })
  it('retains lower reachable ranks while blocking a failure or unknown money cost at the next rank', () => {
    const value = item(); value.observedUpgrade!.levels[2]!.failureMessage = 'Requirement not met'
    expect(quoteUpgradeVariants(value, context).items.map(value => value.upgradeRank)).toEqual([3])
    expect(quoteUpgradeVariants(value, context).reasons[0]).toContain('blocked')
    value.observedUpgrade!.levels[2]!.failureMessage = null
    value.observedUpgrade!.levels[2]!.moneyCost = null
    expect(quoteUpgradeVariants(value, context).items.map(value => value.upgradeRank)).toEqual([3])
    expect(quoteUpgradeVariants(value, context).reasons[0]).toContain('gold cost')
  })
  it('does not mutate source observations or accept duplicate/decreasing ranks', () => {
    const value = item(), before = structuredClone(value)
    quoteUpgradeVariants(value, context)
    expect(value).toEqual(before)
    value.observedUpgrade!.levels.push(value.observedUpgrade!.levels[1]!)
    expect(quoteUpgradeVariants(value, context).items).toEqual([])
    const inconsistent = item(); inconsistent.observedUpgrade!.levels[2]!.itemLevelIncrement = 2
    expect(quoteUpgradeVariants(inconsistent, context).items.map(value => value.upgradeRank)).toEqual([3])
  })
})
