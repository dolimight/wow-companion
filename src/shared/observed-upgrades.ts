import type { EvaluationContext } from './evidence'
import type { ItemVariant, CurrencyCost } from './gear-variants'

const MAX_QUOTE_AGE = 24 * 60 * 60 * 1000
/** Client vendor quotes contain per-step costs and item-level increments relative to the current item */
export function quoteUpgradeVariants(item: ItemVariant, context: EvaluationContext): { items: ItemVariant[]; reasons: string[] } {
  const quote = item.observedUpgrade
  const reasons: string[] = []
  const items: ItemVariant[] = []
  if (!quote) return { items, reasons: ['No upgrade-vendor quote has been observed for this item'] }
  const now = Date.parse(context.now), observed = Date.parse(quote.observedAt)
  if (!Number.isFinite(now) || !Number.isFinite(observed) || observed > now + 300_000 || now - observed > MAX_QUOTE_AGE) reasons.push('The upgrade-vendor quote is stale or has an incompatible timestamp')
  if (!context.gameBuild || quote.gameBuild !== context.gameBuild) reasons.push('The upgrade-vendor quote belongs to an unknown or different game build')
  if (!item.itemId || !item.itemLink || Number(item.itemLink.match(/item:(\d+):/)?.[1]) !== item.itemId || item.itemLevel === null || item.itemLevel <= 0) reasons.push('The exact source item link and observed item level are required for an upgrade quote')
  if (item.upgradeRank !== null && item.upgradeRank !== quote.currentRank) reasons.push('The quoted upgrade rank no longer matches the source item')
  if (quote.maxRank < quote.currentRank || quote.maxItemLevel < quote.minItemLevel) reasons.push('The upgrade-vendor quote has inconsistent bounds')
  if (reasons.length || !quote.upgradeable || quote.currentRank === quote.maxRank) return { items, reasons }
  const future = quote.levels.filter(level => level.rank > quote.currentRank).sort((a, b) => a.rank - b.rank)
  if (new Set(future.map(level => level.rank)).size !== future.length) return { items, reasons: ['The upgrade-vendor quote repeats an upgrade rank'] }
  const totals = new Map<string, number>()
  let expected = quote.currentRank + 1, previousIncrement = 0
  for (const level of future) {
    if (level.rank > quote.maxRank) { reasons.push('The upgrade-vendor quote exceeds its maximum rank'); break }
    if (level.rank !== expected) { reasons.push(`The upgrade-vendor quote is missing rank ${expected}`); break }
    if (level.failureMessage) { reasons.push(`Rank ${level.rank} is blocked: ${level.failureMessage}`); break }
    if (level.moneyCost === null) { reasons.push(`The gold cost for rank ${level.rank} is unknown`); break }
    if (level.itemLevelIncrement < previousIncrement || item.itemLevel! + level.itemLevelIncrement > quote.maxItemLevel) { reasons.push(`The item-level increment for rank ${level.rank} is inconsistent`); break }
    if (level.currencies.some(cost => !/^[1-9]\d*$/.test(cost.currencyId))) { reasons.push(`A currency identifier for rank ${level.rank} is unsupported`); break }
    for (const cost of level.currencies) totals.set(cost.currencyId, (totals.get(cost.currencyId) ?? 0) + cost.amount)
    for (const cost of level.items) totals.set(`item:${cost.itemId}`, (totals.get(`item:${cost.itemId}`) ?? 0) + cost.amount)
    totals.set('money', (totals.get('money') ?? 0) + level.moneyCost)
    if ([...totals.values()].some(amount => !Number.isSafeInteger(amount))) { reasons.push('The accumulated upgrade cost exceeds the supported range'); break }
    const currencyCost: CurrencyCost[] = [...totals].filter(([, amount]) => amount > 0).map(([currencyId, amount]) => ({ currencyId, amount }))
    items.push({ ...item, variantKey: `${item.variantKey}:upgrade:${level.rank}`, upgradeRank: level.rank, itemLevel: item.itemLevel! + level.itemLevelIncrement, currencyCost })
    previousIncrement = level.itemLevelIncrement
    expected++
  }
  if (expected <= quote.maxRank && !reasons.length) reasons.push(`The upgrade-vendor quote is missing rank ${expected}`)
  return { items, reasons }
}
