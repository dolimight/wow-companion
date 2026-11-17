// Boss cards, strategy, and the role picker shared by the Dungeons and Raids pages
import { useState } from 'react'
import { BookOpen, ChevronDown, ExternalLink, HeartPulse, Move, Shield, Skull, Sparkles, Swords, Users } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { specRole, strategyFor, whyItMatters, type DungeonStrategy, type JournalAbility, type JournalBoss, type JournalFlag, type JournalRole, type StrategyNotes } from '../../../shared/dungeons'
import { api } from '../../lib/client'
import { Card } from '../../components/ui/card'
import { Badge, Button } from '../../components/ui/primitives'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { ItemIcon } from '../items/items'

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

export function BossCard({ boss, index, role, plan, defaultOpen, showMythic = false }: { boss: JournalBoss; index: number; role: JournalRole; plan: StrategyNotes | undefined; defaultOpen: boolean; showMythic?: boolean }) {
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
        <div className="boss-abilities">{boss.abilities.map(ability => <Ability key={ability.id} ability={ability} role={role} />)}</div>
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
