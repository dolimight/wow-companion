import { useMemo, useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ChevronDown, CircleHelp, Gem, Sparkles, WandSparkles } from 'lucide-react'
import type { Character, GearItem, GearSlot, StatWeights } from '../../../shared/domain'
import { equalWeights, ratingConversions, scoreEnhancement, statHelp, statKeys, statNames, zeroRatings, type EnhancementScore, type Ratings } from '../../../shared/enhancement-recommendations'
import type { ItemSockets } from '../../../shared/sockets'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '../../components/ui/collapsible'
import { Tooltip, TooltipContent, TooltipTrigger } from '../../components/ui/tooltip'
import { Term } from '../../components/Term'
import { Button } from '../../components/ui/primitives'
import { Input } from '../../components/ui/input'
import { errorMessage } from '../../lib/notify'
import { ItemIcon, useGameData } from '../items/items'
import { enhancementChoices, plannedRatings, type Enhancement, type PlanRatings } from './enhancement-data'
import './enhancement-recommendations.css'

type Suggestion = { choice: Enhancement; score: EnhancementScore; value: string }
type Ranked = { suggestions: Suggestion[]; note: string | null }

const planShape = (items: GearItem[]) => items.map(item => [item.slot, item.itemId, item.itemLevel, item.enchant, item.gems.join('|')].join(':')).sort().join(',')

function rankEnchants(choices: Enhancement[], plan: PlanRatings, current: GearItem | undefined, score: (previous: Ratings, next: Ratings) => EnhancementScore | null): Ranked {
  const enchants = choices.filter(choice => choice.kind === 'enchant')
  if (!enchants.length) return { suggestions: [], note: 'No enchants are known for this slot' }
  const previous = plan.resolve(current?.enchant ?? '', 'enchant')
  if (!previous) return { suggestions: [], note: `The stats of ${current?.enchant} are unknown, so alternatives cannot be compared` }
  const suggestions = enchants.flatMap(choice => {
    if (!choice.stats || choice.name === current?.enchant) return []
    const result = score(previous, choice.stats)
    return result && result.score > 0 ? [{ choice, score: result, value: choice.name }] : []
  })
  return { suggestions: suggestions.sort((a, b) => b.score.score - a.score.score).slice(0, 3), note: suggestions.length ? null : 'Your planned enchant is already the best flat stat choice for these weights' }
}

/** Gems replace planned gems or fill the item's empty sockets; adding a socket the item does not have is never suggested */
function rankGems(choices: Enhancement[], plan: PlanRatings, current: GearItem | undefined, sockets: ItemSockets | null, score: (previous: Ratings, next: Ratings) => EnhancementScore | null): Ranked {
  const planned = current?.gems ?? []
  const empty = sockets ? Math.max(0, sockets.sockets - planned.length) : 0
  if (sockets && !sockets.sockets && !planned.length) return { suggestions: [], note: sockets.addable ? 'This item has no sockets yet · plan a gem above once you add one' : 'This item has no sockets' }
  if (!planned.length && !empty) return { suggestions: [], note: 'Add a planned gem above to compare alternatives for that socket' }
  const best = new Map<number, Suggestion>()
  let unknown = 0
  if (empty) for (const choice of choices) {
    if (choice.kind !== 'gem' || !choice.stats) continue
    const result = score(zeroRatings(), choice.stats)
    if (result && result.score > 0) best.set(choice.itemId, { choice, score: result, value: [...planned, choice.name].join(', ') })
  }
  planned.forEach((name, index) => {
    const previous = plan.resolve(name, 'gem')
    if (!previous) { unknown += 1; return }
    for (const choice of choices) {
      if (choice.kind !== 'gem' || !choice.stats || choice.name === name) continue
      const result = score(previous, choice.stats)
      if (!result || result.score <= 0 || (best.get(choice.itemId)?.score.score ?? -Infinity) >= result.score) continue
      best.set(choice.itemId, { choice, score: result, value: planned.map((gem, at) => at === index ? choice.name : gem).join(', ') })
    }
  })
  const suggestions = [...best.values()].sort((a, b) => b.score.score - a.score.score).slice(0, 3)
  const note = planned.length && unknown === planned.length && !empty ? 'The stats of your planned gems are unknown, so alternatives cannot be compared' : suggestions.length ? null : 'Your planned gems are already the best flat stat choices for these weights'
  return { suggestions, note }
}

function describe(score: EnhancementScore) {
  return score.changes.map(change => `${change.rating > 0 ? '+' : ''}${Math.round(change.rating)} ${statNames[change.key]}${change.rating > 0 && change.retained < 0.995 ? ` · keeps ${Math.round(change.retained * 100)}%` : ''}`).join(' · ')
}

function SuggestionList({ title, icon, ranked, onApply }: { title: string; icon: ReactNode; ranked: Ranked; onApply: (value: string) => void }) {
  return (
    <section className="enhancement-suggestions" aria-label={`Suggested ${title.toLowerCase()}`}>
      <h4>{icon}{title}</h4>
      {ranked.note && <p className="muted">{ranked.note}</p>}
      {ranked.suggestions.map(({ choice, score, value }) => (
        <div className="enhancement-suggestion" key={choice.itemId}>
          <ItemIcon icon={choice.icon} quality={choice.quality} size="small" />
          <div>
            <strong>{choice.name}</strong>
            <small>{describe(score)}</small>
          </div>
          <span className="enhancement-score" title="Weighted secondary rating after diminishing returns">+{Math.round(score.score)}</span>
          <Button variant="quiet" onClick={() => onApply(value)} aria-label={`Use ${choice.name}`}>Use</Button>
        </div>
      ))}
    </section>
  )
}

export function EnhancementRecommendations({ character, items, slot, sockets = null, enchantable = null, weights, onWeights, disabled, onApply }: {
  character: Character
  items: GearItem[]
  slot: GearSlot
  sockets?: ItemSockets | null
  enchantable?: boolean | null
  weights: StatWeights | undefined
  onWeights: (weights: StatWeights) => void
  disabled: boolean
  onApply: (kind: 'enchant' | 'gem', value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const status = useGameData()
  const ready = status.data?.state === 'ready'
  const active = weights ?? equalWeights
  const conversions = useMemo(() => ratingConversions(character.stats), [character.stats])
  const choices = useQuery({ queryKey: ['enhancement-choices', slot], queryFn: () => enhancementChoices(slot), enabled: open && ready, staleTime: Infinity })
  const shape = planShape(items)
  const plan = useQuery({
    queryKey: ['planned-ratings', character.id, character.observedAt, shape],
    queryFn: () => plannedRatings(character, items, choices.data!),
    enabled: open && !!choices.data && !disabled,
    staleTime: 5 * 60_000,
    retry: false,
  })
  const current = items.find(item => item.slot === slot)
  const ranked = useMemo(() => {
    if (!choices.data || !plan.data) return null
    const score = (previous: Ratings, next: Ratings) => scoreEnhancement(conversions, plan.data.delta, previous, next, active)
    return { enchants: enchantable === false ? { suggestions: [], note: 'This slot can’t be enchanted this season' } : rankEnchants(choices.data, plan.data, current, score), gems: rankGems(choices.data, plan.data, current, sockets, score) }
  }, [choices.data, plan.data, conversions, active, current, sockets?.sockets, sockets?.addable, enchantable])
  const unranked = choices.data?.filter(choice => !choice.stats).length ?? 0
  const setWeight = (key: keyof StatWeights, text: string) => {
    const value = Number(text)
    if (text.trim() && Number.isFinite(value) && value >= 0 && value <= 10) onWeights({ ...active, [key]: value })
  }
  const known = statKeys.filter(key => conversions[key])

  let body: ReactNode
  if (!ready) body = <p className="muted">Prepare local game data to compare enchants and gems</p>
  else if (!known.length) body = <p className="muted">Import a character snapshot with recorded secondary stat ratings to compare enchants and gems</p>
  else if (disabled) body = <p className="muted">Finish the edit above to refresh suggestions</p>
  else if (choices.isError) body = <p role="alert">{errorMessage(choices.error)}</p>
  else if (plan.isError) body = <p role="alert">{errorMessage(plan.error)}</p>
  else if (!ranked) body = <p className="muted" role="status">Reading enchant and gem stats…</p>
  else body = <>
    <SuggestionList title="Enchants" icon={<WandSparkles size={13} aria-hidden="true" />} ranked={ranked.enchants} onApply={value => onApply('enchant', value)} />
    <SuggestionList title="Gems" icon={<Gem size={13} aria-hidden="true" />} ranked={ranked.gems} onApply={value => onApply('gem', value)} />
    {unranked > 0 && <p className="muted">{unranked} {unranked === 1 ? 'choice has' : 'choices have'} procs, primary stats or unknown values and {unranked === 1 ? 'is' : 'are'} not ranked</p>}
    {known.length < statKeys.length && <p className="muted">Changes to {statKeys.filter(key => !conversions[key]).map(key => statNames[key]).join(', ')} cannot be scored because their recorded ratings are missing</p>}
  </>

  return (
    <Collapsible open={open} onOpenChange={setOpen} className="enhancement-recommendations">
      <CollapsibleTrigger className="enhancement-recommendations-trigger">
        <Sparkles size={14} aria-hidden="true" />Suggested enchants and gems<ChevronDown size={14} aria-hidden="true" />
      </CollapsibleTrigger>
      <CollapsibleContent className="enhancement-recommendations-panel">
        <fieldset className="stat-weights">
          <legend>Your stat weights</legend>
          <div className="stat-weight-grid">
            {statKeys.map(key => (
              <label key={key}>
                <span>
                  {statNames[key]}
                  <Tooltip>
                    <TooltipTrigger render={<span className="stat-help" tabIndex={0} aria-label={`What ${statNames[key]} does`} />}><CircleHelp size={12} aria-hidden="true" /></TooltipTrigger>
                    <TooltipContent className="term-tip">{statHelp[key]}</TooltipContent>
                  </Tooltip>
                </span>
                <Input key={`${key}:${active[key]}`} type="number" min="0" max="10" step="0.1" defaultValue={active[key]} onBlur={event => setWeight(key, event.target.value)} aria-label={`${statNames[key]} weight`} />
              </label>
            ))}
          </div>
          <small className="muted">Relative value of one point of each rating before <Term term="diminishing returns" />, saved with this plan · equal weights are a neutral start, not a priority for your specialization</small>
          {weights && <Button variant="quiet" onClick={() => onWeights(equalWeights)}>Reset to equal</Button>}
        </fieldset>
        {body}
        <p className="enhancement-footnote muted">Scores are weighted secondary stat value across your whole plan after diminishing returns, not a damage prediction</p>
      </CollapsibleContent>
    </Collapsible>
  )
}
