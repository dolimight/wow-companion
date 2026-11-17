import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, CalendarCheck, Crown, Play, RefreshCw, Skull, Trophy, X } from 'lucide-react'
import type { Character } from '../../../shared/domain'
import { journalDifficultyIds, whyItMatters, type DungeonJournal, type JournalBoss, type JournalRole } from '../../../shared/dungeons'
import { raidDifficulties, raidDifficultyLabels, raidLockouts, raidSummary, type RaidDifficulty, type RaidInfo, type RaidStrategy } from '../../../shared/raids'
import { weeklyLockouts } from '../../../shared/weekly'
import { api } from '../../lib/client'
import { iconUrl } from '../../lib/assets'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button, EmptyState } from '../../components/ui/primitives'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import { ItemIcon, useGameData } from '../items/items'
import { Ability, BossCard, RolePicker, StrategySource, StrategyView, useDungeonRole } from '../dungeons/encounters'
import { bundledRaid, useEncounterJournal } from '../dungeons/bundled'
import { raidStrategy } from './strategy'
import '../dungeons/dungeons.css'
import './raids.css'

/** The difficulty the page is read at, remembered per character; Heroic until the player picks another */
function useRaidDifficulty(character: Character) {
  const key = `wowc:raid-difficulty:${character.id}`
  const [difficulty, setDifficulty] = useState<RaidDifficulty>(() => {
    try { const saved = localStorage.getItem(key) as RaidDifficulty | null; if (saved && raidDifficulties.includes(saved)) return saved } catch { /* storage unavailable */ }
    return 'heroic'
  })
  const choose = (next: RaidDifficulty) => { setDifficulty(next); try { localStorage.setItem(key, next) } catch { /* storage unavailable */ } }
  return [difficulty, choose] as const
}

/** A bundled raid at the difficulty, or the game files' journal for a raid the bundle lacks */
function useRaidJournal(raid: RaidInfo, difficulty: RaidDifficulty) {
  const packed = bundledRaid(raid.slug)
  return useEncounterJournal(`raid:${raid.slug}:${difficulty}`, packed ? packed[difficulty] ?? Object.values(packed)[0] : null, () => api.dungeonJournal(raid.name, [], difficulty))
}

/** The difficulties the journal tags for this raid; lairs have no Raid Finder or Mythic in the journal */
function offered(raid: RaidInfo, journal: DungeonJournal | null | undefined): RaidDifficulty[] {
  const packed = bundledRaid(raid.slug)
  if (packed) return raidDifficulties.filter(entry => packed[entry])
  const tagged = new Set(journal?.difficultyIds ?? [])
  const list = raidDifficulties.filter(difficulty => journalDifficultyIds[difficulty].some(id => tagged.has(id)))
  return list.length ? list : ['normal', 'heroic', 'mythic']
}

function useLockouts(character: Character, raid: RaidInfo) {
  return raidLockouts(weeklyLockouts(character.weekly, character.region).lockouts, raid.name)
}

/** This season's raids with your progress; one opens into its bosses with strategy for your role, or play mode */
export function RaidsPage({ character }: { character: Character }) {
  const search = useSearch({ strict: false }) as { raid?: string; play?: string | boolean }
  const navigate = useNavigate()
  const open = (raid: string | null, play = false) => void navigate({ to: '.', search: ((previous: Record<string, unknown>) => ({ ...previous, raid: raid ?? undefined, play: play ? 1 : undefined })) as never })
  const list = useQuery({ queryKey: ['raids'], queryFn: () => api.raids(), staleTime: 60 * 60_000 })

  if (list.isPending) return <div className="loading-surface" role="status">Loading this season's raids…</div>
  if (list.isError) return (
    <EmptyState icon={Crown} title="Raids could not load" description={errorMessage(list.error)}>
      <Button onClick={() => void list.refetch()}><RefreshCw size={15} />Try again</Button>
    </EmptyState>
  )
  const selected = list.data.raids.find(raid => raid.slug === search.raid)
  if (selected) return <RaidDetail key={selected.slug} character={character} raid={selected} playing={!!search.play} onPlay={play => open(selected.slug, play)} onBack={() => open(null)} />
  return (
    <div className="dungeons">
      <p className="dungeons-intro">{list.data.raids.length} raids this season · bosses and loot from the Encounter Journal · strategy from Method's guides</p>
      <div className="dungeon-grid">
        {list.data.raids.map(raid => <RaidCard key={raid.slug} character={character} raid={raid} onOpen={() => open(raid.slug)} />)}
      </div>
    </div>
  )
}

/** Loading-screen art bundled with the app (public/assets/raids); a raid without it falls back to the journal's button art */
const bundledArt = (raid: RaidInfo) => raid.art ? `${import.meta.env.BASE_URL}assets/${raid.art}` : null

function RaidArt({ raid, journal, className, children }: { raid: RaidInfo; journal: DungeonJournal | null | undefined; className: string; children?: React.ReactNode }) {
  const bundled = bundledArt(raid)
  const src = bundled ?? iconUrl(journal?.button)
  return <div className={className}>{src && <img className={bundled ? 'dungeon-art dungeon-art-cover' : 'dungeon-art dungeon-art-button'} src={src} alt="" draggable={false} />}{children}</div>
}

function RaidCard({ character, raid, onOpen }: { character: Character; raid: RaidInfo; onOpen: () => void }) {
  const journal = useRaidJournal(raid, 'heroic')
  const summary = raidSummary(character.ratings?.raiding?.label, raid.slug)
  const week = useLockouts(character, raid)
  return (
    <Card as="article" size="sm" className="dungeon-card">
      <button type="button" className="dungeon-card-hit" onClick={onOpen} aria-label={`Open ${raid.name}`}>
        <RaidArt raid={raid} journal={journal.data} className="dungeon-card-art"><span>{raid.name}</span></RaidArt>
        <span className="dungeon-card-body">
          <span className="dungeon-best"><b>{summary ?? '—'}</b><small>{summary ? 'your best progress' : 'no kills recorded'}</small></span>
          <span className="dungeon-chips">
            <Badge><Skull size={12} aria-hidden="true" />{raid.encounters.length} {raid.encounters.length === 1 ? 'boss' : 'bosses'}</Badge>
            {week.map(lockout => <Badge key={`${lockout.name}-${lockout.difficulty}`} tone={lockout.killed >= lockout.total ? 'green' : 'blue'}><CalendarCheck size={12} aria-hidden="true" />{lockout.difficulty || 'This week'} {lockout.killed}/{lockout.total}</Badge>)}
          </span>
        </span>
      </button>
    </Card>
  )
}

function RaidDetail({ character, raid, playing, onPlay, onBack }: { character: Character; raid: RaidInfo; playing: boolean; onPlay: (play: boolean) => void; onBack: () => void }) {
  const [role, setRole] = useDungeonRole(character)
  const [chosen, setDifficulty] = useRaidDifficulty(character)
  const probe = useRaidJournal(raid, chosen)
  const choices = offered(raid, probe.data)
  // A difficulty the raid lacks, such as Mythic for a lair, falls back to the hardest one it has
  const difficulty = choices.includes(chosen) ? chosen : choices[choices.length - 1]!
  const journal = useRaidJournal(raid, difficulty)
  const strategy = raidStrategy(raid.slug)
  const bosses = journal.data?.bosses ?? []
  const gameReady = useGameData().data?.state === 'ready'
  const summary = raidSummary(character.ratings?.raiding?.label, raid.slug)
  const week = useLockouts(character, raid)
  const plan = (boss: JournalBoss) => strategy?.bosses.find(entry => entry.encounterId === boss.encounterId)

  if (playing) return <RaidPlay raid={raid} bosses={bosses} strategy={strategy} role={role} difficulty={difficulty} onRole={setRole} onExit={() => onPlay(false)} />
  return (
    <div className="dungeons">
      <Button variant="quiet" className="back-link" onClick={onBack}><ArrowLeft size={14} />All raids</Button>
      <div className="dungeon-hero" data-art={bundledArt(raid) ? 'wide' : 'thumb'}>
        {bundledArt(raid) ? <img className="dungeon-hero-cover" src={bundledArt(raid)!} alt="" draggable={false} />
          : iconUrl(journal.data?.button) && <img className="dungeon-hero-backdrop" src={iconUrl(journal.data?.button)!} alt="" draggable={false} />}
        <div className="dungeon-hero-inner">
          {!bundledArt(raid) && <RaidArt raid={raid} journal={journal.data} className="dungeon-hero-thumb" />}
          <div className="dungeon-hero-text">
            <h2>{raid.name}</h2>
            <p>{summary ? `Your progress ${summary}` : 'No kills recorded this season'}</p>
          </div>
          <div className="dungeon-hero-actions">
            <Button variant="primary" onClick={() => onPlay(true)} disabled={!bosses.length}><Play size={14} />Play</Button>
          </div>
        </div>
      </div>

      <div className="raid-pickers">
        <RolePicker role={role} onChange={setRole} />
        <div className="dungeon-role">
          <span>Difficulty</span>
          <ToggleGroup variant="outline" size="sm" value={[difficulty]} onValueChange={values => { const next = values[0] as RaidDifficulty | undefined; if (next) setDifficulty(next) }} aria-label="Raid difficulty">
            {choices.map(entry => <ToggleGroupItem key={entry} value={entry}>{raidDifficultyLabels[entry]}</ToggleGroupItem>)}
          </ToggleGroup>
        </div>
      </div>

      <div className="dungeon-stats">
        <Card className="dungeon-stat"><small>Bosses</small><b>{raid.encounters.length}</b></Card>
        <Card className="dungeon-stat"><small><Trophy size={12} aria-hidden="true" /> Season best</small><b>{summary ?? '—'}</b></Card>
        {week.length ? week.slice(0, 2).map(lockout => <Card key={`${lockout.name}-${lockout.difficulty}`} className="dungeon-stat"><small><CalendarCheck size={12} aria-hidden="true" /> This week{lockout.difficulty ? ` · ${lockout.difficulty}` : ''}</small><b>{lockout.killed}/{lockout.total}</b></Card>)
          : <Card className="dungeon-stat"><small><CalendarCheck size={12} aria-hidden="true" /> This week</small><b>No lockout</b></Card>}
      </div>

      <Card as="section" aria-labelledby="raid-bosses-title">
        <div className="surface-heading"><h2 id="raid-bosses-title"><Skull size={16} aria-hidden="true" />Bosses</h2><p>{raidDifficultyLabels[difficulty]} · from the Encounter Journal, with each boss's loot</p></div>
        {journal.isPending && gameReady ? <p className="muted small" role="status">Reading the Encounter Journal…</p>
          : journal.isError ? <p className="muted small" role="alert">{errorMessage(journal.error)}</p>
            : !bosses.length ? <p className="muted small">Prepare local game data to read this raid's bosses</p>
              : bosses.map((boss, index) => <BossCard key={boss.encounterId} boss={boss} index={index} role={role} plan={plan(boss)} defaultOpen={index === 0} showMythic={difficulty === 'mythic'} character={character} />)}
        <p className="muted small dungeon-note">Mechanics that need your role's attention are marked; the rest are dimmed. Damage numbers are left out: the server scales them, and the game files hold placeholders</p>
        {strategy && <StrategySource strategy={strategy} />}
      </Card>
    </div>
  )
}

/** One boss at a time with the strategy for your role and the mechanics you must handle */
function RaidPlay({ raid, bosses, strategy, role, difficulty, onRole, onExit }: { raid: RaidInfo; bosses: JournalBoss[]; strategy: RaidStrategy | null; role: JournalRole; difficulty: RaidDifficulty; onRole: (role: JournalRole) => void; onExit: () => void }) {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const keys = (event: KeyboardEvent) => {
      if (event.key === 'ArrowRight') setStep(value => Math.min(bosses.length - 1, value + 1))
      if (event.key === 'ArrowLeft') setStep(value => Math.max(0, value - 1))
      if (event.key === 'Escape') onExit()
    }
    window.addEventListener('keydown', keys)
    return () => window.removeEventListener('keydown', keys)
  }, [bosses.length, onExit])
  const boss = bosses[step]
  if (!boss) return null
  const tips = boss.tips.filter(tip => tip.role === role).map(tip => tip.text)
  const plan = strategy?.bosses.find(entry => entry.encounterId === boss.encounterId)
  const warned = boss.abilities.flatMap(ability => [ability, ...ability.children]).filter(ability => whyItMatters(ability.flags, role))
  return (
    <div className="dungeon-play" role="region" aria-label={`${raid.name} play mode`}>
      <div className="play-top">
        <span>{raid.name} · {raidDifficultyLabels[difficulty]}</span>
        <RolePicker role={role} onChange={onRole} />
        <Button variant="quiet" onClick={onExit}><X size={14} />Exit</Button>
      </div>
      <div className="play-steps" aria-hidden="true">{bosses.map((entry, index) => <i key={entry.encounterId} data-state={index < step ? 'done' : index === step ? 'on' : 'next'} />)}</div>
      <Card className="play-card">
        <div className="play-boss">
          <ItemIcon icon={boss.portrait} size="large" label={boss.name} />
          <div><small>Boss {step + 1} of {bosses.length}</small><h2>{boss.name}</h2></div>
        </div>
        {!tips.length && !plan && boss.overview ? <p className="boss-overview">{boss.overview}</p> : <StrategyView notes={plan} role={role} journalTips={tips} showMythic={difficulty === 'mythic'} />}
        {warned.length > 0 && <div className="boss-abilities">{warned.map(ability => <Ability key={ability.id} ability={{ ...ability, children: [] }} role={role} />)}</div>}
      </Card>
      <div className="play-nav">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={14} />{step > 0 ? bosses[step - 1]!.name : 'Start'}</Button>
        <Button variant="primary" disabled={step >= bosses.length - 1} onClick={() => setStep(step + 1)}>{step < bosses.length - 1 ? bosses[step + 1]!.name : 'Last boss'}<ArrowRight size={14} /></Button>
      </div>
    </div>
  )
}
