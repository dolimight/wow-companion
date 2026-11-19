// Boss cards, strategy, and the role picker shared by the Dungeons and Raids pages
import { useEffect, useId, useMemo, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, ChevronDown, ExternalLink, Gem, HeartPulse, Move, Shield, Skull, Sparkles, Swords, Users, X } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { specRole, strategyFor, whyItMatters, type DungeonStrategy, type JournalAbility, type JournalBoss, type JournalFlag, type JournalRole, type LootItem, type StrategyNotes } from '../../../shared/dungeons'
import { inLootTable, isGearDrop, lootKind, uniqueDrops, voidcoreShare } from '../../../shared/loot'
import { api } from '../../lib/client'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { ItemIcon } from '../items/items'
import { ItemHoverCard } from '../items/ItemHoverCard'
import { BossCoach } from '../ai/BossCoach'

export const roleLabels: Record<JournalRole, string> = { tank: 'Tank', healer: 'Healer', damage: 'Damage' }
export const roleIcons: Record<JournalRole, typeof Shield> = { tank: Shield, healer: HeartPulse, damage: Swords }

/** The role the page is read as: the spec's role until the player picks another, remembered per character */
export function useDungeonRole(character: Character) {
  const key = `wowc:dungeon-role:${character.id}`
  const [role, setRole] = useState<JournalRole>(() => {
    try { const saved = localStorage.getItem(key); if (saved === 'tank' || saved === 'healer' || saved === 'damage') return saved } catch { /* storage unavailable */ }
    return specRole(character.specId)
  })
  const choose = (next: JournalRole) => { setRole(next); try { localStorage.setItem(key, next) } catch { /* storage unavailable */ } }
  return [role, choose] as const
}

export function RolePicker({ role, onChange }: { role: JournalRole; onChange: (role: JournalRole) => void }) {
  return (
    <div className="dungeon-role">
      <span>Read as</span>
      <ToggleGroup variant="outline" size="sm" value={[role]} onValueChange={values => { const next = values[0] as JournalRole | undefined; if (next) onChange(next) }} aria-label="Your role">
        {(['tank', 'healer', 'damage'] as const).map(entry => { const Icon = roleIcons[entry]; return <ToggleGroupItem key={entry} value={entry} aria-label={roleLabels[entry]}><Icon aria-hidden="true" />{roleLabels[entry]}</ToggleGroupItem> })}
      </ToggleGroup>
    </div>
  )
}
export const flagLabels: Partial<Record<JournalFlag, { label: string; tone: 'neutral' | 'blue' | 'green' | 'amber' }>> = {
  deadly: { label: 'Deadly', tone: 'amber' }, important: { label: 'Important', tone: 'amber' }, interruptible: { label: 'Interruptible', tone: 'blue' },
  magic: { label: 'Magic', tone: 'blue' }, curse: { label: 'Curse', tone: 'blue' }, poison: { label: 'Poison', tone: 'green' }, disease: { label: 'Disease', tone: 'green' },
  enrage: { label: 'Enrage', tone: 'amber' }, bleed: { label: 'Bleed', tone: 'amber' }, mythic: { label: 'Mythic', tone: 'neutral' },
  tank: { label: 'Tank', tone: 'neutral' }, healer: { label: 'Healer', tone: 'neutral' }, damage: { label: 'Damage', tone: 'neutral' },
}

export function BossCard({ boss, index, role, plan, defaultOpen, showMythic = false, character, coach }: { boss: JournalBoss; index: number; role: JournalRole; plan: StrategyNotes | undefined; defaultOpen: boolean; showMythic?: boolean; /** Shows the boss's loot for this character, as raids drop it per boss */ character?: Character; /** Offers tips for this character's spec from the connected AI assistant */ coach?: { character: Character; instance: string; difficulty: string } }) {
  const [open, setOpen] = useState(defaultOpen)
  const tips = boss.tips.filter(tip => tip.role === role).map(tip => tip.text)
  const keyCount = boss.abilities.flatMap(ability => [ability, ...ability.children]).filter(ability => whyItMatters(ability.flags, role)).length
  return (
    <Card as="article" className="boss-card">
      <button type="button" className="boss-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ItemIcon icon={boss.portrait} size="large" label={boss.name} />
        <span className="boss-title"><b>{boss.name}</b><Badge>Boss {index + 1}</Badge>{keyCount > 0 && <Badge tone="blue">{keyCount} for {roleLabels[role].toLowerCase()}</Badge>}{plan?.positioning?.length ? <Badge><Move size={11} aria-hidden="true" />Positioning</Badge> : null}</span>
        <ChevronDown size={16} className="boss-chevron" aria-hidden="true" />
      </button>
      {open && <div className="boss-body">
        {boss.overview && <p className="boss-overview">{boss.overview}</p>}
        <StrategyView notes={plan} role={role} journalTips={tips} showMythic={showMythic} />
        {coach && <BossCoach {...coach} boss={boss} role={role} plan={plan} mythic={showMythic} />}
        <div className="boss-abilities">{boss.abilities.map(ability => <Ability key={ability.id} ability={ability} role={role} />)}</div>
        {character && boss.loot?.length ? <div className="boss-loot"><h4><Gem size={14} aria-hidden="true" />Loot</h4><LootList items={boss.loot} character={character} /></div> : null}
      </div>}
    </Card>
  )
}

/**
 * How to play a boss or enemy: the chosen role's jobs first, with the journal's own advice for that role, then where to
 * stand and what the whole group does
 */
export function StrategyView({ notes, role, journalTips = [], showMythic = false }: { notes: StrategyNotes | undefined; role: JournalRole; journalTips?: string[]; showMythic?: boolean }) {
  const { positioning, everyone, mine } = strategyFor(notes, role)
  // Raids keep Mythic-only changes apart, shown when Mythic is the chosen difficulty
  const mythic = showMythic ? notes?.mythic ?? [] : []
  const RoleIcon = roleIcons[role]
  if (!positioning.length && !everyone.length && !mine.length && !journalTips.length && !mythic.length) return null
  return (
    <div className="strategy">
      {(mine.length > 0 || journalTips.length > 0) && <div className="boss-advice">
        <h4><RoleIcon size={14} aria-hidden="true" />{roleLabels[role]}</h4>
        {mine.length > 0 && <Lines lines={mine} />}
        {journalTips.map((tip, at) => <TipText key={at} text={tip} />)}
      </div>}
      {(positioning.length > 0 || everyone.length > 0 || mythic.length > 0) && <div className="strategy-grid">
        {positioning.length > 0 && <div className="strategy-block"><h4><Move size={14} aria-hidden="true" />Positioning</h4><Lines lines={positioning} /></div>}
        {everyone.length > 0 && <div className="strategy-block"><h4><Users size={14} aria-hidden="true" />Everyone</h4><Lines lines={everyone} /></div>}
        {mythic.length > 0 && <div className="strategy-block"><h4><Skull size={14} aria-hidden="true" />On Mythic</h4><Lines lines={mythic} /></div>}
      </div>}
    </div>
  )
}

export function Lines({ lines }: { lines: string[] }) {
  return <ul className="boss-tips">{lines.map((line, at) => <li key={at}>{line}</li>)}</ul>
}

/** Where the written strategy comes from, for a dungeon or a raid */
export function StrategySource({ strategy }: { strategy: Pick<DungeonStrategy, 'source'> }) {
  const updated = new Date(`${strategy.source.updated}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
  return (
    <p className="muted small dungeon-note strategy-source">
      <BookOpen size={13} aria-hidden="true" />Positioning and role notes summarized from {strategy.source.name}'s guide, updated {updated}
      <Button variant="quiet" onClick={() => void api.openExternal(strategy.source.url)}><ExternalLink size={13} />Full guide</Button>
    </p>
  )
}

export function TipText({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.replace(/^•\s*/, '').trim()).filter(Boolean)
  return <Lines lines={lines} />
}

export function Ability({ ability, role, depth = 0 }: { ability: JournalAbility; role: JournalRole; depth?: number }) {
  const why = whyItMatters(ability.flags, role)
  // The "For you" badge already names the reason, so that flag isn't repeated
  const flags = ability.flags.filter(flag => flagLabels[flag] && flag !== 'damage' && flagLabels[flag]!.label !== why)
  return (
    <div className="boss-ability" style={{ marginLeft: depth * 28 }}>
      <div className="boss-ability-row" data-emphasis={why ? 'key' : 'quiet'}>
        <ItemIcon icon={ability.icon} size="small" fallback={<Skull />} />
        <div>
          <div className="boss-ability-name">{ability.name || 'Ability'}{why && <Badge tone="blue"><Sparkles size={11} aria-hidden="true" />For you · {why}</Badge>}{flags.map(flag => <Badge key={flag} tone={flagLabels[flag]!.tone}>{flagLabels[flag]!.label}</Badge>)}</div>
          {ability.text && <p>{ability.text.split('\n').filter(Boolean).map((line, at) => <span key={at}>{line}</span>)}</p>}
        </div>
      </div>
      {ability.children.length > 0 && ability.children.map(child => <Ability key={child.id} ability={child} role={role} depth={1} />)}
    </div>
  )
}

/** A loot table with what drops for you first, and a Voidcore roll's odds over those */
export function LootList({ items: listed, character }: { items: LootItem[]; character: Character }) {
  const [all, setAll] = useState(false)
  const items = useMemo(() => uniqueDrops(listed), [listed])
  // Level is left out: a character synced before the level cap still wants to know what drops at it
  const who = useMemo(() => ({ className: character.className, specId: character.specId, level: null }), [character.className, character.specId])
  const mine = useMemo(() => new Set(items.filter(item => inLootTable(item, who))), [items, who])
  const gear = items.filter(isGearDrop).length
  const others = items.length - gear
  const shown = all ? items : items.filter(item => mine.has(item))
  const spec = character.specName && character.specName !== 'Unknown' ? `${character.specName} ${character.className}` : character.className
  return (
    <div className="loot">
      <p className="loot-summary"><b>{mine.size} of {gear}</b> gear drops for {spec}{others > 0 ? ` · ${others} non-gear ${others === 1 ? 'drop' : 'drops'}` : ''}</p>
      {mine.size > 0 && <Card size="sm" className="loot-voidcore">
        <Sparkles size={15} aria-hidden="true" />
        <span><b>Nebulous Voidcore · {voidcoreShare(mine.size)}% each</b><small>A bonus roll gives one of the {mine.size} pieces for your loot specialization; ones you already won with a Voidcore leave its pool, so the odds rise as you collect them</small></span>
      </Card>}
      <div className="loot-items">
        {shown.map(item => (
          <ItemHoverCard key={item.id} itemId={item.id} item={{ ...item, itemLevel: 0, expansion: 0, sources: [] }}>
            <div className="loot-item" data-emphasis={mine.has(item) ? undefined : 'quiet'}>
              <ItemIcon icon={item.icon} quality={item.quality} size="small" />
              <span><b className={`quality-text-${item.quality}`}>{item.name}</b><small>{lootKind(item)}</small></span>
              {all && mine.has(item) && <Badge tone="green">For you</Badge>}
            </div>
          </ItemHoverCard>
        ))}
      </div>
      {items.length > mine.size && <Button variant="quiet" onClick={() => setAll(!all)}>{all ? `Only gear for ${spec}` : `Show all ${items.length} drops`}</Button>}
      <p className="muted small">Loot from the Encounter Journal. Blizzard doesn't publish drop rates, so only the Voidcore's odds are shown</p>
    </div>
  )
}

/**
 * Play mode's sticky bar: where you are, your role, and the step controls up top, so moving to the next boss never
 * needs a scroll. The track under it names every boss and jumps to one on a click
 */
export function PlayBar({ title, detail, extra, bosses, step, onStep, role, onRole, onExit }: { title: string; detail?: string; extra?: React.ReactNode; bosses: JournalBoss[]; step: number; onStep: (step: number) => void; role: JournalRole; onRole: (role: JournalRole) => void; onExit: () => void }) {
  const previous = bosses[step - 1], next = bosses[step + 1]
  return (
    <Card as="header" className="play-bar">
      <div className="play-bar-row">
        <Button variant="quiet" className="play-exit" onClick={onExit} aria-label="Exit play mode"><X size={14} aria-hidden="true" />Exit</Button>
        <span className="play-bar-title"><b>{title}</b>{detail && <small>{detail}</small>}{extra}</span>
        <RolePicker role={role} onChange={onRole} />
        <div className="play-bar-steps">
          <Button disabled={!previous} onClick={() => onStep(step - 1)} aria-label={previous ? `Back to ${previous.name}` : 'Back'} title={previous ? `Back to ${previous.name} (←)` : undefined}><ArrowLeft size={14} aria-hidden="true" /></Button>
          <Button variant="primary" className="play-next" disabled={!next} onClick={() => onStep(step + 1)} title={next ? 'Next boss (→)' : undefined}>{next ? <><span>Next · {next.name}</span><ArrowRight size={14} aria-hidden="true" /></> : 'Last boss'}</Button>
        </div>
      </div>
      <ol className="play-track" aria-label="Bosses">
        {bosses.map((entry, index) => (
          <li key={entry.encounterId}>
            <button type="button" data-state={index < step ? 'done' : index === step ? 'on' : 'next'} aria-current={index === step ? 'step' : undefined} title={entry.name} onClick={() => onStep(index)}>
              <i aria-hidden="true" /><span>{entry.name}</span>
            </button>
          </li>
        ))}
      </ol>
    </Card>
  )
}

/** The boss on screen: portrait, name, and where it falls in the run, with room on the right for a pace or other facts */
export function PlayHero({ boss, step, total, children }: { boss: JournalBoss; step: number; total: number; children?: React.ReactNode }) {
  return (
    <Card as="section" className="play-hero" aria-label={boss.name}>
      <ItemIcon icon={boss.portrait} size="large" label={boss.name} />
      <div className="play-hero-name"><small>Boss {step + 1} of {total}</small><h2>{boss.name}</h2></div>
      {children}
    </Card>
  )
}

/** The arrow keys step through bosses and Escape leaves, unless focus is in a text field */
export function usePlayKeys(count: number, setStep: (update: (value: number) => number) => void, onExit: () => void) {
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target?.closest('input, textarea, [contenteditable="true"], [role="listbox"], [role="menu"]')) return
      if (event.key === 'ArrowRight') setStep(value => Math.min(count - 1, value + 1))
      if (event.key === 'ArrowLeft') setStep(value => Math.max(0, value - 1))
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [count, setStep, onExit])
}

/** The parts under the boss, each in its own card with a heading, so play mode reads in sections instead of one long card */
export function PlaySection({ icon: Icon, title, aside, className = '', children }: { icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean | 'true' }>; title: string; aside?: React.ReactNode; className?: string; children: React.ReactNode }) {
  const id = useId()
  return (
    <Card as="section" className={`play-section ${className}`} aria-labelledby={id}>
      <div className="play-section-head"><h3 id={id}><Icon size={15} aria-hidden="true" />{title}</h3>{aside}</div>
      {children}
    </Card>
  )
}
