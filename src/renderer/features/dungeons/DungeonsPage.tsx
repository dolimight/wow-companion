import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate, useSearch } from '@tanstack/react-router'
import { ArrowLeft, ArrowRight, Castle, ChevronDown, Compass, Crosshair, ExternalLink, HeartPulse, Map as MapIcon, Play, RefreshCw, Shield, Skull, Sparkles, Swords, Timer, Users, WandSparkles, X } from 'lucide-react'
import type { Character, SeasonDungeon } from '../../../shared/domain'
import { bestFamily, bossPace, clock, dungeonKey, enemyNote, keystoneTimers, routeEmbedUrl, routeUrl, specRole, whyItMatters, wowheadNpcUrl, type DungeonEnemy, type DungeonJournal, type DungeonRoutes, type JournalAbility, type JournalBoss, type JournalFlag, type JournalRole, type RouteFamily, type SeasonDungeonInfo } from '../../../shared/dungeons'
import { lowestDungeon, seasonDungeons, timeToSpareMs, upgradesFor } from '../../../shared/key-range'
import { api } from '../../lib/client'
import { iconUrl } from '../../lib/assets'
import { errorMessage } from '../../lib/notify'
import { Card } from '../../components/ui/card'
import { Badge, Button, EmptyState } from '../../components/ui/primitives'
import { ItemIcon, useGameData } from '../items/items'
import { ToggleGroup, ToggleGroupItem } from '../../components/ui/toggle-group'
import './dungeons.css'

const roleLabels: Record<JournalRole, string> = { tank: 'Tank', healer: 'Healer', damage: 'Damage' }
const roleIcons: Record<JournalRole, typeof Shield> = { tank: Shield, healer: HeartPulse, damage: Swords }

/** The role the page is read as: the spec's role until the player picks another, remembered per character */
function useDungeonRole(character: Character) {
  const key = `wowc:dungeon-role:${character.id}`
  const [role, setRole] = useState<JournalRole>(() => {
    try { const saved = localStorage.getItem(key); if (saved === 'tank' || saved === 'healer' || saved === 'damage') return saved } catch { /* storage unavailable */ }
    return specRole(character.specId)
  })
  const choose = (next: JournalRole) => { setRole(next); try { localStorage.setItem(key, next) } catch { /* storage unavailable */ } }
  return [role, choose] as const
}

function RolePicker({ role, onChange }: { role: JournalRole; onChange: (role: JournalRole) => void }) {
  return (
    <div className="dungeon-role">
      <span>Read as</span>
      <ToggleGroup variant="outline" size="sm" value={[role]} onValueChange={values => { const next = values[0] as JournalRole | undefined; if (next) onChange(next) }} aria-label="Your role">
        {(['tank', 'healer', 'damage'] as const).map(entry => { const Icon = roleIcons[entry]; return <ToggleGroupItem key={entry} value={entry} aria-label={roleLabels[entry]}><Icon aria-hidden="true" />{roleLabels[entry]}</ToggleGroupItem> })}
      </ToggleGroup>
    </div>
  )
}
const flagLabels: Partial<Record<JournalFlag, { label: string; tone: 'neutral' | 'blue' | 'green' | 'amber' }>> = {
  deadly: { label: 'Deadly', tone: 'amber' }, important: { label: 'Important', tone: 'amber' }, interruptible: { label: 'Interruptible', tone: 'blue' },
  magic: { label: 'Magic', tone: 'blue' }, curse: { label: 'Curse', tone: 'blue' }, poison: { label: 'Poison', tone: 'green' }, disease: { label: 'Disease', tone: 'green' },
  enrage: { label: 'Enrage', tone: 'amber' }, bleed: { label: 'Bleed', tone: 'amber' }, mythic: { label: 'Mythic', tone: 'neutral' },
  tank: { label: 'Tank', tone: 'neutral' }, healer: { label: 'Healer', tone: 'neutral' }, damage: { label: 'Damage', tone: 'neutral' },
}

function useJournal(name: string | null, encounterIds: number[] = []) {
  const ready = useGameData().data?.state === 'ready'
  return useQuery({ queryKey: ['dungeon-journal', name, encounterIds], queryFn: () => api.dungeonJournal(name!, encounterIds), enabled: ready && !!name, staleTime: Infinity })
}

function bestLine(best: SeasonDungeon | undefined) {
  if (!best?.timed) return best?.overtime ? `+${best.overtime.level} ran out of time` : 'No key this season'
  const spare = timeToSpareMs(best), upgrades = upgradesFor(best)
  return ['timed', spare != null ? `${clock(spare)} to spare` : null, upgrades ? `upgraded +${upgrades}` : null].filter(Boolean).join(' · ')
}
const timedShare = (family: RouteFamily) => family.runs ? Math.round(family.timed / family.runs * 100) : 0

/** Every season dungeon with your best key and the route players run most; one opens into its page or play mode */
export function DungeonsPage({ character }: { character: Character }) {
  const search = useSearch({ strict: false }) as { dungeon?: string; play?: string | boolean }
  const navigate = useNavigate()
  const open = (dungeon: string | null, play = false) => void navigate({ to: '.', search: ((previous: Record<string, unknown>) => ({ ...previous, dungeon: dungeon ?? undefined, play: play ? 1 : undefined })) as never })
  const list = useQuery({ queryKey: ['dungeons'], queryFn: () => api.dungeons(), staleTime: 30 * 60_000 })
  const bests = useMemo(() => new Map(seasonDungeons(character).dungeons.map(dungeon => [dungeonKey(dungeon.dungeon), dungeon])), [character])

  if (list.isPending) return <div className="loading-surface" role="status">Loading this season's dungeons…</div>
  if (list.isError) return (
    <EmptyState icon={Castle} title="Dungeons could not load" description={errorMessage(list.error)}>
      <Button onClick={() => void list.refetch()}><RefreshCw size={15} />Try again</Button>
    </EmptyState>
  )
  const selected = list.data.dungeons.find(dungeon => dungeon.slug === search.dungeon)
  if (selected) return <DungeonDetail key={selected.slug} character={character} dungeon={selected} best={bests.get(dungeonKey(selected.name))} playing={!!search.play} onPlay={play => open(selected.slug, play)} onBack={() => open(null)} />
  const lowest = lowestDungeon([...bests.values()])
  return (
    <div className="dungeons">
      <p className="dungeons-intro">{list.data.season.name} · {list.data.dungeons.length} dungeons · routes from Raider.IO runs · bosses from your game files</p>
      <div className="dungeon-grid">
        {list.data.dungeons.map(dungeon => <DungeonCard key={dungeon.slug} dungeon={dungeon} best={bests.get(dungeonKey(dungeon.name))} lowest={!!lowest && dungeonKey(lowest.dungeon) === dungeonKey(dungeon.name)} onOpen={() => open(dungeon.slug)} />)}
      </div>
    </div>
  )
}

/** Art bundled with the app (public/assets/dungeons), downloaded by scripts/dungeon-data.ts */
const bundledArt = (dungeon: SeasonDungeonInfo) => dungeon.art ? `${import.meta.env.BASE_URL}assets/${dungeon.art}` : null

/**
 * The dungeon's bundled art, covering the box. A dungeon without bundled art falls back to the journal's button picture
 * from the game files, which fills the top-left 68% × 75% of its texture and is cropped to that
 */
function DungeonArt({ dungeon, journal, className, children }: { dungeon: SeasonDungeonInfo; journal: DungeonJournal | null | undefined; className: string; children?: React.ReactNode }) {
  const bundled = bundledArt(dungeon)
  const src = bundled ?? iconUrl(journal?.button)
  return <div className={className}>{src && <img className={bundled ? 'dungeon-art dungeon-art-cover' : 'dungeon-art dungeon-art-button'} src={src} alt="" draggable={false} />}{children}</div>
}

function DungeonCard({ dungeon, best, lowest, onOpen }: { dungeon: SeasonDungeonInfo; best: SeasonDungeon | undefined; lowest: boolean; onOpen: () => void }) {
  const journal = useJournal(dungeon.name)
  const routes = useQuery({ queryKey: ['dungeon-routes', dungeon.slug], queryFn: () => api.dungeonRoutes(dungeon.slug), staleTime: 30 * 60_000, retry: false })
  const top = routes.data ? bestFamily(routes.data.families) : null
  return (
    <Card as="article" size="sm" className="dungeon-card">
      <button type="button" className="dungeon-card-hit" onClick={onOpen} aria-label={`Open ${dungeon.name}`}>
        <DungeonArt dungeon={dungeon} journal={journal.data} className="dungeon-card-art"><span>{dungeon.name}</span></DungeonArt>
        <span className="dungeon-card-body">
          <span className="dungeon-best"><b>{best?.timed ? `+${best.timed.level}` : '—'}</b><small>{bestLine(best)}</small></span>
          <span className="dungeon-chips">
            {lowest && <Badge tone="amber">Lowest · most score to gain</Badge>}
            {top && <Badge tone="green">Top route {timedShare(top)}% timed</Badge>}
            <Badge><Timer size={12} aria-hidden="true" />{clock(dungeon.timerMs)} timer</Badge>
          </span>
        </span>
      </button>
    </Card>
  )
}

function DungeonDetail({ character, dungeon, best, playing, onPlay, onBack }: { character: Character; dungeon: SeasonDungeonInfo; best: SeasonDungeon | undefined; playing: boolean; onPlay: (play: boolean) => void; onBack: () => void }) {
  const routes = useQuery({ queryKey: ['dungeon-routes', dungeon.slug], queryFn: () => api.dungeonRoutes(dungeon.slug), staleTime: 30 * 60_000, retry: false })
  const journal = useJournal(dungeon.name, routes.data?.encounterIds ?? [])
  // Only routes with a drawn map are offered, so every choice shows its pulls
  const families = (routes.data?.families ?? []).filter(entry => entry.routeKey)
  const [familyId, setFamilyId] = useState<string | null>(null)
  const family = families.find(entry => entry.familyId === familyId) ?? bestFamily(families)
  const timers = routes.data?.timersMs ?? keystoneTimers(dungeon.timerMs)
  const [role, setRole] = useDungeonRole(character)
  const bosses = journal.data?.bosses ?? []
  const gameReady = useGameData().data?.state === 'ready'

  if (playing) return <PlayMode dungeon={dungeon} family={family} familyIndex={family ? families.indexOf(family) : -1} timers={timers} bosses={bosses} role={role} onRole={setRole} onExit={() => onPlay(false)} />
  return (
    <div className="dungeons">
      <Button variant="quiet" className="back-link" onClick={onBack}><ArrowLeft size={14} />All dungeons</Button>
      <div className="dungeon-hero" data-art={bundledArt(dungeon) ? 'wide' : 'thumb'}>
        {/* Bundled art is wide and sharp enough to fill the banner; the game's small button art is shown as a thumbnail over a blurred copy */}
        {bundledArt(dungeon) ? <img className="dungeon-hero-cover" src={bundledArt(dungeon)!} alt="" draggable={false} />
          : iconUrl(journal.data?.button) && <img className="dungeon-hero-backdrop" src={iconUrl(journal.data?.button)!} alt="" draggable={false} />}
        <div className="dungeon-hero-inner">
          {!bundledArt(dungeon) && <DungeonArt dungeon={dungeon} journal={journal.data} className="dungeon-hero-thumb" />}
          <div className="dungeon-hero-text">
            <h2>{dungeon.name}</h2>
            <p>{best?.timed ? `Your best +${best.timed.level} · ${bestLine(best)}` : bestLine(best)}</p>
          </div>
          <div className="dungeon-hero-actions">
            {family?.routeKey && <Button onClick={() => void api.openExternal(routeUrl(dungeon.slug, family.routeKey!))}><ExternalLink size={14} />Keystone Guru</Button>}
            <Button variant="primary" onClick={() => onPlay(true)} disabled={!bosses.length}><Play size={14} />Play</Button>
          </div>
        </div>
      </div>

      <RolePicker role={role} onChange={setRole} />

      <div className="dungeon-stats">
        <Stat label="+1 timer" value={clock(timers.plusOne)} />
        <Stat label="+2 under" value={clock(timers.plusTwo)} />
        <Stat label="+3 under" value={clock(timers.plusThree)} />
        <Stat label="Enemy forces" value={routes.data?.enemyForces?.toLocaleString('en-US') ?? '—'} />
      </div>

      <div className="dungeon-route-row">
        <Card as="section" className="dungeon-routes" aria-labelledby="routes-title">
          <h3 id="routes-title"><Compass size={15} aria-hidden="true" />Routes players run</h3>
          {routes.isPending ? <p className="muted small" role="status">Loading routes…</p>
            : routes.isError ? <p className="muted small" role="alert">{errorMessage(routes.error)}</p>
              : !families.length ? <p className="muted small">No mapped routes for this dungeon yet</p>
                : <>
                  {families.slice(0, 5).map((entry, index) => (
                    <button key={entry.familyId} type="button" className="dungeon-route" aria-pressed={entry === family} onClick={() => setFamilyId(entry.familyId)}>
                      <b>Route {String.fromCharCode(65 + index)} · {entry.runs.toLocaleString('en-US')} runs</b>
                      <span>{timedShare(entry)}% timed{entry.highestKey ? ` · up to +${entry.highestKey}` : ''}{entry.medianClearMs ? ` · median ${clock(entry.medianClearMs)}` : ''}</span>
                      <span className="dungeon-bar"><i style={{ width: `${timedShare(entry)}%` }} /></span>
                    </button>
                  ))}
                  {routes.data?.totalRuns != null && <p className="muted small">Routes with a map, grouped by Raider.IO from {routes.data.totalRuns.toLocaleString('en-US')} runs</p>}
                </>}
        </Card>
        <Card as="section" className="dungeon-map" aria-labelledby="map-title">
          <h3 id="map-title"><MapIcon size={15} aria-hidden="true" />Route map</h3>
          <RouteMap dungeon={dungeon.slug} family={family} />
        </Card>
      </div>

      <Card as="section" aria-labelledby="bosses-title">
        <div className="surface-heading"><h2 id="bosses-title"><Skull size={16} aria-hidden="true" />Bosses</h2><p>From the Encounter Journal in your game files</p></div>
        {journal.isPending && gameReady ? <p className="muted small" role="status">Reading the Encounter Journal…</p>
          : journal.isError ? <p className="muted small" role="alert">{errorMessage(journal.error)}</p>
            : !bosses.length ? <p className="muted small">Prepare local game data to read this dungeon's bosses</p>
              : bosses.map((boss, index) => <BossCard key={boss.encounterId} boss={boss} index={index} role={role} defaultOpen={index === 0} />)}
        <p className="muted small dungeon-note">Mechanics that need your role's attention are marked; the rest are dimmed. Damage numbers are left out: the server scales them for each key level, and the game files hold placeholders</p>
      </Card>

      <EnemiesCard dungeon={dungeon} role={role} />
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return <Card className="dungeon-stat"><small>{label}</small><b>{value}</b></Card>
}

/** Keystone Guru's own embed draws the pulls, their numbers, and the enemy forces as the route goes */
function RouteMap({ dungeon, family }: { dungeon: string; family: RouteFamily | null }) {
  if (!family?.routeKey) return <div className="dungeon-map-empty"><MapIcon size={22} aria-hidden="true" /><p>{family ? 'Raider.IO has not drawn this route yet; pick another route to see its map' : 'Pick a route to see its map'}</p></div>
  return <iframe key={family.routeKey} className="dungeon-map-frame" title="Keystone Guru route map" src={routeEmbedUrl(dungeon, family.routeKey)} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" loading="lazy" />
}

function BossCard({ boss, index, role, defaultOpen }: { boss: JournalBoss; index: number; role: JournalRole; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen)
  const tips = boss.tips.filter(tip => tip.role === role)
  const keyCount = boss.abilities.flatMap(ability => [ability, ...ability.children]).filter(ability => whyItMatters(ability.flags, role)).length
  const RoleIcon = roleIcons[role]
  return (
    <Card as="article" className="boss-card">
      <button type="button" className="boss-head" aria-expanded={open} onClick={() => setOpen(!open)}>
        <ItemIcon icon={boss.portrait} size="large" label={boss.name} />
        <span className="boss-title"><b>{boss.name}</b><Badge>Boss {index + 1}</Badge>{keyCount > 0 && <Badge tone="blue">{keyCount} for {roleLabels[role].toLowerCase()}</Badge>}</span>
        <ChevronDown size={16} className="boss-chevron" aria-hidden="true" />
      </button>
      {open && <div className="boss-body">
        {boss.overview && <p className="boss-overview">{boss.overview}</p>}
        {tips.length > 0 && <div className="boss-advice">
          <h4><RoleIcon size={14} aria-hidden="true" />{roleLabels[role]} advice</h4>
          {tips.map((tip, at) => <TipText key={at} text={tip.text} />)}
        </div>}
        <div className="boss-abilities">{boss.abilities.map(ability => <Ability key={ability.id} ability={ability} role={role} />)}</div>
      </div>}
    </Card>
  )
}

function TipText({ text }: { text: string }) {
  const lines = text.split('\n').map(line => line.replace(/^•\s*/, '').trim()).filter(Boolean)
  return <ul className="boss-tips">{lines.map((line, at) => <li key={at}>{line}</li>)}</ul>
}

function Ability({ ability, role, depth = 0 }: { ability: JournalAbility; role: JournalRole; depth?: number }) {
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

const kindIcons: Record<DungeonEnemy['kind'], typeof Shield> = { caster: WandSparkles, healer: HeartPulse, ranged: Crosshair, melee: Swords, other: Users }

/**
 * The trash between bosses from Keystone Guru's public dungeon data: who its curators flag as dangerous, casters to
 * interrupt, and what each kill gives toward enemy forces. Their abilities aren't in that data, so each links to Wowhead
 */
function EnemiesCard({ dungeon, role }: { dungeon: SeasonDungeonInfo; role: JournalRole }) {
  const enemies = useQuery({ queryKey: ['dungeon-enemies', dungeon.slug], queryFn: () => api.dungeonEnemies(dungeon.slug), staleTime: 6 * 3_600_000, retry: false })
  const [all, setAll] = useState(false)
  const required = enemies.data?.forcesRequired ?? null
  const trash = (enemies.data?.enemies ?? []).filter(enemy => !enemy.boss && ((enemy.forces ?? 0) > 0 || enemy.dangerous))
    .sort((a, b) => Number(!!enemyNote(b, role)) - Number(!!enemyNote(a, role)) || Number(b.dangerous) - Number(a.dangerous) || (b.forces ?? 0) - (a.forces ?? 0))
  const shown = all ? trash : trash.slice(0, 12)
  return (
    <Card as="section" aria-labelledby="enemies-title">
      <div className="surface-heading"><h2 id="enemies-title"><Users size={16} aria-hidden="true" />Enemies</h2><p>Trash between the bosses · from Keystone Guru</p></div>
      {enemies.isPending ? <p className="muted small" role="status">Loading enemies…</p>
        : enemies.isError ? <p className="muted small" role="alert">{errorMessage(enemies.error)}</p>
          : !trash.length ? <p className="muted small">No enemies recorded for this dungeon yet</p>
            : <>
              <div className="dungeon-enemies">
                {shown.map(enemy => {
                  const Icon = enemy.dangerous ? Skull : kindIcons[enemy.kind]
                  const note = enemyNote(enemy, role)
                  return (
                    <div key={enemy.npcId} className="dungeon-enemy" data-emphasis={note ? 'key' : 'quiet'} data-dangerous={enemy.dangerous || undefined}>
                      <span className="dungeon-enemy-icon"><Icon size={16} aria-hidden="true" /></span>
                      <div className="dungeon-enemy-main">
                        <b>{enemy.name}</b>
                        <span className="dungeon-enemy-tags">
                          {note && <Badge tone={enemy.dangerous ? 'amber' : 'blue'}>{note}</Badge>}
                          {enemy.elite && <Badge>Elite</Badge>}
                          {enemy.kind !== 'melee' && enemy.kind !== 'other' && <Badge>{enemy.kind[0]!.toUpperCase() + enemy.kind.slice(1)}</Badge>}
                        </span>
                      </div>
                      <span className="dungeon-enemy-forces">{enemy.forces != null ? <>{enemy.forces}<small>{required ? ` · ${(enemy.forces / required * 100).toFixed(1)}%` : ''}</small></> : '—'}</span>
                      <Button variant="quiet" onClick={() => void api.openExternal(wowheadNpcUrl(enemy.npcId))} aria-label={`${enemy.name} abilities on Wowhead`}><ExternalLink size={13} />Abilities</Button>
                    </div>
                  )
                })}
              </div>
              {trash.length > shown.length && <Button variant="quiet" onClick={() => setAll(true)}>Show all {trash.length} enemies</Button>}
              <p className="muted small dungeon-note">Forces are per kill, out of {required ?? 'the dungeon total'}. Keystone Guru has not listed this season's trash abilities yet, so Abilities opens each enemy on Wowhead</p>
            </>}
    </Card>
  )
}

/** One boss at a time with the advice for your role, a rough pace for each upgrade, and the route map beside it */
function PlayMode({ dungeon, family, familyIndex, timers, bosses, role, onRole, onExit }: { dungeon: SeasonDungeonInfo; family: RouteFamily | null; familyIndex: number; timers: NonNullable<DungeonRoutes['timersMs']>; bosses: JournalBoss[]; role: JournalRole; onRole: (role: JournalRole) => void; onExit: () => void }) {
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
  const pace = bossPace(timers, step, bosses.length)
  const tips = boss.tips.filter(tip => tip.role === role)
  const warned = boss.abilities.flatMap(ability => [ability, ...ability.children]).filter(ability => whyItMatters(ability.flags, role))
  return (
    <div className="dungeon-play" role="region" aria-label={`${dungeon.name} play mode`}>
      <div className="play-top">
        <span>{dungeon.name}{familyIndex >= 0 ? ` · Route ${String.fromCharCode(65 + familyIndex)}` : ''}</span>
        <RolePicker role={role} onChange={onRole} />
        <Button variant="quiet" onClick={onExit}><X size={14} />Exit</Button>
      </div>
      <div className="play-steps" aria-hidden="true">{bosses.map((entry, index) => <i key={entry.encounterId} data-state={index < step ? 'done' : index === step ? 'on' : 'next'} />)}</div>
      <div className="play-main">
        <Card className="play-card">
          <div className="play-boss">
            <ItemIcon icon={boss.portrait} size="large" label={boss.name} />
            <div><small>Step {step + 1} of {bosses.length} · Boss {step + 1}</small><h2>{boss.name}</h2></div>
          </div>
          {tips.length ? tips.map((tip, at) => <TipText key={at} text={tip.text} />) : boss.overview ? <p className="boss-overview">{boss.overview}</p> : null}
          {warned.length > 0 && <div className="boss-abilities">{warned.map(ability => <Ability key={ability.id} ability={{ ...ability, children: [] }} role={role} />)}</div>}
          <div className="play-targets">
            <Card size="sm"><small>Kill by for +3</small><b>{clock(pace.plusThree)}</b></Card>
            <Card size="sm"><small>Kill by for +2</small><b>{clock(pace.plusTwo)}</b></Card>
            <Card size="sm"><small>Kill by for +1</small><b>{clock(pace.plusOne)}</b></Card>
          </div>
          <p className="muted small">A rough pace: each timer split evenly across the bosses, not route data</p>
        </Card>
        <Card className="play-map"><RouteMap dungeon={dungeon.slug} family={family} /></Card>
      </div>
      <div className="play-nav">
        <Button disabled={step === 0} onClick={() => setStep(step - 1)}><ArrowLeft size={14} />{step > 0 ? bosses[step - 1]!.name : 'Start'}</Button>
        <Button variant="primary" disabled={step >= bosses.length - 1} onClick={() => setStep(step + 1)}>{step < bosses.length - 1 ? bosses[step + 1]!.name : 'Last boss'}<ArrowRight size={14} /></Button>
      </div>
    </div>
  )
}
