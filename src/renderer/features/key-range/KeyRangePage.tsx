import { useMemo, useState, type ReactNode } from 'react'
import { KeyRound, Minus, Plus, RefreshCw } from 'lucide-react'
import type { Character, SeasonDungeon } from '../../../shared/domain'
import { dungeonVerdict, earnedLevel, highestTimed, keyLevels, lowestDungeon, overallVerdict, seasonDungeons, suggestedLevel, timeToSpareMs, upgradesFor, verdictLabels, type KeyVerdict } from '../../../shared/key-range'
import { AppSelect } from '../../components/AppSelect'
import { Button, EmptyState } from '../../components/ui/primitives'
import './key-range.css'

const levels = Array.from({ length: keyLevels.max - keyLevels.min + 1 }, (_, index) => keyLevels.min + index)
const chips: Record<KeyVerdict, string> = { timed: 'In your range', reach: 'The game would hand you this key', stretch: 'One past what you earned', notyet: 'More than one past what you earned', nodata: 'No timed key to judge from' }
const marks: Record<KeyVerdict, string> = { timed: '✓', reach: '✓', stretch: '!', notyet: '✕', nodata: '?' }
const anyDungeon = '__any'

const clock = (ms: number | null) => {
  if (ms == null) return null
  const seconds = Math.round(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}
const ago = (iso: string) => {
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  if (minutes < 60) return minutes <= 1 ? 'just now' : `${minutes} minutes ago`
  const hours = Math.round(minutes / 60)
  return hours < 48 ? `${hours} hour${hours === 1 ? '' : 's'} ago` : `${Math.round(hours / 24)} days ago`
}
function runSummary(dungeon: SeasonDungeon) {
  if (!dungeon.timed) return dungeon.overtime ? `+${dungeon.overtime.level} ran out of time` : 'No key this season'
  const spare = clock(timeToSpareMs(dungeon)), upgrades = upgradesFor(dungeon)
  return [spare ? `${spare} to spare` : null, upgrades ? `upgraded +${upgrades}` : null, dungeon.overtime && dungeon.overtime.level > dungeon.timed.level ? `+${dungeon.overtime.level} ran out of time` : null].filter(Boolean).join(' · ')
}

/**
 * Answers "is this character ready for +N" from its own season bests
 * Item level and score are shown as facts; there is no source yet for how other players at a level compare
 */
export function KeyRangePage({ character, refreshing, onRefresh, gearPlanLink, tonightLink }: {
  character: Character
  refreshing: boolean
  onRefresh: () => void
  gearPlanLink: (children: ReactNode) => ReactNode
  tonightLink: (children: ReactNode) => ReactNode
}) {
  const { dungeons, sources } = useMemo(() => seasonDungeons(character), [character])
  const [level, setLevel] = useState(() => suggestedLevel(dungeons))
  const [focusName, setFocusName] = useState<string | null>(null)
  const focus = dungeons.find(dungeon => dungeon.dungeon === focusName) ?? null
  const scope = focus ? [focus] : dungeons
  const result = focus ? { verdict: dungeonVerdict(focus, level), counts: null, withData: focus.timed ? 1 : 0 } : overallVerdict(dungeons, level)
  const best = highestTimed(scope)
  const low = lowestDungeon(dungeons)
  const missingEnchants = character.gear.filter(item => ['mainHand', 'finger1', 'finger2'].includes(item.slot) && item.enchantCoverage === 'complete' && !item.enchant)

  if (!dungeons.length) return (
    <EmptyState icon={KeyRound} title="No Mythic+ season bests yet" description="Time a key, then /reload in game so the addon saves your season bests, or refresh the public profile to read them from Raider.IO">
      <Button disabled={refreshing} onClick={onRefresh}><RefreshCw size={15} />{refreshing ? 'Refreshing…' : 'Refresh public profile'}</Button>
    </EmptyState>
  )

  const why = (() => {
    const where = focus ? ` in ${focus.dungeon}` : ''
    const earned = focus ? earnedLevel(focus) : null
    switch (result.verdict) {
      case 'timed': return focus ? `You timed +${focus.timed!.level} here${clock(timeToSpareMs(focus)) ? ` with ${clock(timeToSpareMs(focus))} to spare` : ''}, so +${level} is already in your range` : `You've timed +${level} or higher in ${dungeons.filter(d => d.timed && d.timed.level >= level).length} of ${dungeons.length} dungeons this season`
      case 'reach': return focus ? `Your best timed key here upgraded to +${earned}, so the game itself says +${level} is a fair next key` : `In most dungeons, your best timed key upgraded to at least +${level}, so the game would hand you this level`
      case 'stretch': return `+${level} is one level past the key your best runs${where} earned. Time the earned key with room to spare first`
      case 'notyet': return `+${level} is more than one level past what your best runs${where} earned. ${best != null ? `Step up from +${best} one level at a time` : 'Time a lower key first'}`
      default: return focus ? `You haven't timed a key in ${focus.dungeon} this season` : 'You have no timed keys this season to judge from'
    }
  })()

  return (
    <div className="key-range">
      <section className="surface key-question" aria-labelledby="key-question-label">
        <div>
          <div className="key-question-label" id="key-question-label">Is {character.name} ready for</div>
          <div className="key-stepper">
            <Button variant="icon" aria-label="Lower key level" disabled={level <= keyLevels.min} onClick={() => setLevel(level - 1)}><Minus size={16} /></Button>
            <div className="key-level" aria-live="polite">+{level}<small>{focus?.dungeon ?? 'Any dungeon'}</small></div>
            <Button variant="icon" aria-label="Higher key level" disabled={level >= keyLevels.max} onClick={() => setLevel(level + 1)}><Plus size={16} /></Button>
          </div>
        </div>
        <div className="key-answer">
          <div className="key-verdict"><h2>{verdictLabels[result.verdict]}</h2><span className={`key-chip kv-${result.verdict}`}>{chips[result.verdict]}</span></div>
          <p>{why}</p>
          <div className="key-scope">
            <AppSelect label="Dungeon" value={focusName ?? anyDungeon} onValueChange={value => setFocusName(value === anyDungeon ? null : value)} options={[{ value: anyDungeon, label: 'Any dungeon' }, ...dungeons.map(dungeon => ({ value: dungeon.dungeon, label: dungeon.dungeon }))]} />
            <Button disabled={refreshing} onClick={onRefresh}><RefreshCw size={15} />{refreshing ? 'Refreshing…' : 'Refresh public profile'}</Button>
          </div>
        </div>
      </section>

      <section className="surface key-ladder-surface" aria-labelledby="key-ladder-title">
        <div className="surface-heading"><h2 id="key-ladder-title">Your key range</h2><p>Select a level to check it</p></div>
        <div className="key-ladder" role="group" aria-label="Key levels">
          {levels.map(value => {
            const verdict = focus ? dungeonVerdict(focus, value) : overallVerdict(dungeons, value).verdict
            return <button key={value} type="button" className={`key-rung kv-${verdict}`} aria-pressed={value === level} title={`+${value}: ${verdictLabels[verdict]}`} onClick={() => setLevel(value)}>+{value}</button>
          })}
        </div>
        <div className="key-legend">{(['timed', 'reach', 'stretch', 'notyet', 'nodata'] as const).map(verdict => <span key={verdict} className={`kv-${verdict}`}><i />{verdictLabels[verdict]}</span>)}</div>
      </section>

      <section className="surface" aria-labelledby="key-checks-title">
        <div className="surface-heading"><h2 id="key-checks-title">Checks for +{level}{focus ? ` ${focus.dungeon}` : ''}</h2></div>
        <div className="key-checks">
          <KeyCheck verdict={result.verdict} title="Your runs" value={best != null ? `best timed +${best}` : 'no timed key'}
            text={focus ? runSummary(focus) : result.counts ? `At +${level}: ${result.counts.timed} timed, ${result.counts.reach} within reach, ${result.counts.stretch} stretch, ${result.counts.notyet} not yet${result.counts.nodata ? `, ${result.counts.nodata} with no timed key` : ''}` : ''}
            note="Your own season bests, judged by the keystone upgrade the game gave each run" />
          <KeyCheck verdict="nodata" title="Item level" value={character.itemLevel != null ? `${Math.round(character.itemLevel)} equipped` : 'Unknown'}
            text="Not compared: the app has no source yet for the item level of players who timed this level" note={character.gearObservedAt ? `Gear from ${character.gearSource ?? 'an unknown source'}, ${ago(character.gearObservedAt)}` : 'Gear observation time unknown'} />
          <KeyCheck verdict="nodata" title="Mythic+ score" value={character.ratings.mythicPlus?.value != null ? Math.round(character.ratings.mythicPlus.value).toLocaleString('en-US') : 'Unknown'}
            text="Not compared: group leaders often look at it, but there is no source yet for typical scores at this level" note={character.ratings.mythicPlus?.observedAt ? `${character.ratings.mythicPlus.source ?? 'Unknown source'}, ${ago(character.ratings.mythicPlus.observedAt)}` : 'Score observation time unknown'} />
          <KeyCheck verdict={missingEnchants.length ? 'stretch' : 'timed'} title="Weapon and ring enchants" value={missingEnchants.length ? `${missingEnchants.length} missing` : 'all present'}
            text={missingEnchants.length ? 'Your imported gear shows an empty enchant; check its current eligibility in game' : 'Only slots whose enchant was observed are counted'} note="From your gear; not compared with other players" />
        </div>
        <details className="key-how">
          <summary>How this is decided</summary>
          <ul>
            <li>Everything here comes from your own season bests; nothing is compared with other players or combined into a score</li>
            <li>Timing a key upgrades it one level, two with 20% of the timer left, or three with 40% left. A level up to what your best run earned is “Within reach”</li>
            <li>One level past what you earned is a “Stretch”; further is “Not yet”</li>
            <li>For any dungeon, the answer is the one reached by at least half of the dungeons where you have a timed key</li>
            <li>Gear, route, and group still decide a run; this reads your history, not a promise</li>
          </ul>
        </details>
      </section>

      <section className="surface" aria-labelledby="key-dungeons-title">
        <div className="surface-heading"><h2 id="key-dungeons-title">By dungeon</h2><p>Your season best per dungeon · select one to focus the checks</p></div>
        <div className="key-dungeons">
          {dungeons.map(dungeon => {
            const verdict = dungeonVerdict(dungeon, level)
            return (
              <button key={dungeon.dungeon} type="button" className="key-dungeon" aria-pressed={focus?.dungeon === dungeon.dungeon} onClick={() => setFocusName(focus?.dungeon === dungeon.dungeon ? null : dungeon.dungeon)}>
                <span className="key-dungeon-name">{dungeon.dungeon}</span>
                <span className="key-dungeon-best">{dungeon.timed ? <>+{dungeon.timed.level}<small>timed</small></> : <small>No timed key</small>}</span>
                <span className="key-dungeon-meta">{runSummary(dungeon)}</span>
                <span className={`key-chip kv-${verdict}`}>+{level} · {verdictLabels[verdict]}</span>
              </button>
            )
          })}
        </div>
      </section>

      <section className="surface" aria-labelledby="key-next-title">
        <div className="surface-heading"><h2 id="key-next-title">What would move you up</h2><p>Toward +{level}</p></div>
        <div className="key-next">
          {low && low.timed && (
            <div><div><h3>Time +{low.timed.level + 1} {low.dungeon}</h3><p>It's your lowest dungeon, so another timed level there adds more score than one in a dungeon you've already pushed</p></div>{tonightLink(<>Plan tonight</>)}</div>
          )}
          {focus && focus.timed && result.verdict !== 'timed' && result.verdict !== 'reach' && (
            <div><div><h3>Time +{earnedLevel(focus)} {focus.dungeon} first</h3><p>That's the key your best run here earned; timing it with 20% of the timer left would make +{earnedLevel(focus)! + 2} a fair next step</p></div></div>
          )}
          {missingEnchants.length > 0 && (
            <div><div><h3>Review your missing enchants</h3><p>{missingEnchants.length === 1 ? 'One weapon or ring enchant is' : `${missingEnchants.length} weapon or ring enchants are`} empty in your imported gear</p></div>{gearPlanLink(<>Open gear plan</>)}</div>
          )}
        </div>
      </section>

      <div className="key-sources">
        {sources.map(source => <span key={source.source}>Season bests: {source.source}, {ago(source.observedAt)}</span>)}
        <span>WoW saves addon data on /reload or logout, so in-game bests update then</span>
      </div>
    </div>
  )
}

function KeyCheck({ verdict, title, value, text, note }: { verdict: KeyVerdict; title: string; value: string; text: string; note: string }) {
  return (
    <div className={`key-check kv-${verdict}`}>
      <span className="key-check-mark" aria-hidden="true">{marks[verdict]}</span>
      <div><h3>{title} <span>{value}</span></h3><p>{text}</p><small>{note}</small></div>
    </div>
  )
}
