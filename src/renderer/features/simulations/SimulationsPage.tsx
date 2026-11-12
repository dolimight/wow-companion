import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, ClipboardList, Copy, Cpu, ExternalLink, FileCode2, FlaskConical, FolderOpen, Link2, LoaderCircle, Play, Settings2, Trophy, X } from 'lucide-react'
import { CallChip } from '../../components/motion/CallChip'
import { DamageHistory } from './DamageHistory'
import type { Activity, Character } from '../../../shared/domain'
import { compareSimulationValues, requestScenario, simulationScenarios, type SimulationJob, type SimulationScenarioId } from '../../../shared/simulation'
import { api } from '../../lib/client'
import { Button, Badge, Field } from '../../components/ui/primitives'
import { Card } from '../../components/ui/card'
import { AppSelect } from '../../components/AppSelect'
import { errorMessage, notify } from '../../lib/notify'
import { useUpdateBlocker } from '../../lib/update-safety'
import { trackSimulation } from '../../lib/simulation-toasts'
import { SimulationDetail } from './SimulationDetail'
import './simulations.css'

type Navigation = { jobId?: string; onOpenJob?: (jobId: string | null) => void }
type Kind = 'gear' | 'plan' | 'top'
const kindOf = (job: SimulationJob): Kind => job.request.plan ? 'plan' : job.request.benchmark ? 'top' : 'gear'
const active = (job: SimulationJob) => job.state === 'queued' || job.state === 'running'

export function SimulationsPage({ character, activity, jobId, onOpenJob }: { character: Character; activity: Activity } & Navigation) {
  return <SimulationContent key={character.id} character={character} activity={activity} jobId={jobId} onOpenJob={onOpenJob} />
}

function SimulationContent({ character, activity, jobId, onOpenJob }: { character: Character; activity: Activity } & Navigation) {
  const queryClient = useQueryClient()
  const [scenario, setScenario] = useState<SimulationScenarioId>(activity === 'mythicPlus' ? 'big-pulls' : 'patchwerk')
  const [planActivity, setPlanActivity] = useState<Activity>(activity === 'raiding' ? 'raiding' : 'mythicPlus')
  const [threads, setThreads] = useState(4)
  const [timeoutMinutes, setTimeoutMinutes] = useState(30)
  const [text, setText] = useState<string | null>(null)
  const [savedProfileText, setSavedProfileText] = useState<string | null>(null)
  const [reportUrl, setReportUrl] = useState('')
  const [notes, setNotes] = useState('')
  const [allJobs, setAllJobs] = useState(false)
  const [starting, setStarting] = useState<Kind | null>(null)
  const workspace = useQuery({ queryKey: ['simulations', character.id], queryFn: () => api.simulationWorkspace({ characterId: character.id }), refetchInterval: query => query.state.data?.jobs.some(active) ? 1500 : false })
  const plans = useQuery({ queryKey: ['gear-draft', character.id, 'simulation-plans', character.specId], queryFn: async () => { const [mythicPlus, raiding] = await Promise.all([api.getGearDraft({ characterId: character.id, activity: 'mythicPlus', specId: character.specId }), api.getGearDraft({ characterId: character.id, activity: 'raiding', specId: character.specId })]); return { mythicPlus, raiding } } })
  const profile = useQuery({ queryKey: ['simulation-profile', character.id, character.gearObservedAt, character.talents?.observedAt], queryFn: () => api.simulationProfile({ characterId: character.id }) })
  const mutation = useMutation({ mutationFn: (task: () => Promise<unknown>) => task(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['simulations', character.id] }) }, onError: error => notify(errorMessage(error)) })
  const perform = (task: () => Promise<unknown>) => mutation.mutate(task)
  const exported = profile.data
  useUpdateBlocker(text !== null && text !== exported?.text && text !== savedProfileText, 'Save your simulation profile before restarting')
  const data = workspace.data
  const running = data?.jobs.find(active) ?? null
  // A run that just finished stays on screen for a moment so its chip can settle green or shake red
  const [justFinished, setJustFinished] = useState<SimulationJob | null>(null)
  const lastRunning = useRef<string | null>(null)
  useEffect(() => {
    if (running) { lastRunning.current = running.id; setJustFinished(null); return }
    const id = lastRunning.current
    if (!id) return
    const job = data?.jobs.find(entry => entry.id === id)
    if (!job || active(job)) return
    lastRunning.current = null
    if (job.state !== 'completed' && job.state !== 'failed') return
    setJustFinished(job)
    const timer = setTimeout(() => setJustFinished(null), 4000)
    return () => clearTimeout(timer)
  }, [running?.id, data]) // eslint-disable-line react-hooks/exhaustive-deps
  const expectedMs = typicalDuration(data?.jobs ?? [], running ?? justFinished)
  // Only one simulation at a time: every run waits until the current one finishes
  const busy = starting !== null || running !== null || mutation.isPending
  const ready = !!data?.configured && exported?.coverage === 'complete' && activity !== 'pvp'
  const chosenPlan = plans.data?.[planActivity === 'raiding' ? 'raiding' : 'mythicPlus'] ?? null
  const loadingKind = starting ?? (running ? kindOf(running) : null)
  const launch = (kind: Kind, task: () => Promise<SimulationJob>) => {
    if (busy) return
    setStarting(kind)
    mutation.mutate(async () => { try { trackSimulation(await task()) } finally { setStarting(null) } })
  }
  const base = { characterId: character.id, activity, scenarioId: scenario, threads, timeoutMinutes }
  const opened = jobId ? data?.jobs.find(job => job.id === jobId) : undefined
  if (opened) return <SimulationDetail character={character} activity={activity} job={opened} onBack={() => onOpenJob?.(null)} />
  const finished = data?.jobs.filter(job => !active(job)) ?? []
  const shownJobs = allJobs ? finished : finished.slice(0, 5)
  const blocked = !data?.configured ? null : activity === 'pvp' ? 'Simulations model Mythic+ and Raiding · Switch the activity above to run one' : exported && exported.coverage !== 'complete' ? 'Your profile is missing some fields · Open the profile below to see which' : null
  const runButton = (kind: Kind, label: string, icon: ReactNode, onClick: () => void, extraDisabled = false, primary = false) => {
    const loading = loadingKind === kind
    return <Button variant={primary ? 'primary' : 'secondary'} disabled={!ready || busy || extraDisabled} aria-busy={loading || undefined} onClick={onClick}>{loading ? <LoaderCircle size={14} className="spin" /> : icon}{loading ? 'Running…' : label}</Button>
  }
  return <div className="simulation-page">
    <div className="page-heading"><div><h2>Simulations</h2><p>See how your gear, your plan, and top players' setups compare on your own character</p></div></div>
    {(workspace.isError || profile.isError) && <p role="alert" className="error-surface">{errorMessage(workspace.error ?? profile.error)}</p>}

    <Card className="simulation-section sim-run" role="region" aria-label="Run a simulation">
      <div className="simulation-heading">
        <h2>Run a simulation</h2>
        <span className="sim-engine"><Cpu size={14} aria-hidden="true" />{data?.configured ? data.executableName : 'No engine chosen'}<Button variant="quiet" disabled={busy} onClick={() => perform(() => api.chooseSimulationExecutable())}><FolderOpen size={14} />{data?.configured ? 'Change' : 'Choose engine'}</Button></span>
      </div>
      {!data?.configured && <p className="sim-blocked" role="status">Choose your installed SimulationCraft executable to run simulations on this computer</p>}
        <Field label="Scenario"><AppSelect label="Simulation scenario" value={scenario} options={Object.entries(simulationScenarios).map(([value, preset]) => ({ value, label: `${preset.label} · ${preset.description}` }))} onValueChange={value => setScenario(value as SimulationScenarioId)} /></Field>
        <div className="sim-choices">
          <Card size="sm" className="sim-choice"><strong>Your gear</strong><p className="muted">Your current damage in this scenario</p>{runButton('gear', 'Run simulation', <Play size={14} />, () => launch('gear', () => api.startSimulation(base)), false, true)}</Card>
          <Card size="sm" className="sim-choice"><strong>Your plan</strong><p className="muted">{chosenPlan?.items.length ? 'The whole plan and each upgrade on its own, so you know which to get first' : `No ${planActivity === 'raiding' ? 'Raiding' : 'Mythic+'} plan saved yet · Save one on the Plan tab`}</p>
            <AppSelect label="Gear plan to simulate" value={planActivity} options={(['mythicPlus', 'raiding'] as const).map(value => { const draft = plans.data?.[value]; return { value, label: `${value === 'raiding' ? 'Raiding' : 'Mythic+'} · ${draft?.items.length ? `${draft.name} · ${draft.items.length} items` : 'Not saved yet'}` } })} onValueChange={value => setPlanActivity(value as Activity)} />
            {runButton('plan', 'Simulate plan', <ClipboardList size={14} />, () => launch('plan', () => api.startSimulationPlan({ ...base, planActivity })), !chosenPlan?.items.length)}</Card>
          <Card size="sm" className="sim-choice"><strong>Top players</strong><p className="muted">The items and talents top {character.specName ?? ''} players use, on your character</p>{runButton('top', 'Compare with top players', <Trophy size={14} />, () => launch('top', () => api.startSimulationBenchmark(base)))}</Card>
        </div>
        {blocked && <p className="sim-blocked" role="status">{blocked}</p>}
        <details className="simulation-details sim-settings"><summary><Settings2 size={14} aria-hidden="true" />Settings · {threads} threads · {timeoutMinutes} minute limit</summary>
          <div className="simulation-options">
            <Field label="CPU threads"><AppSelect label="Simulation threads" value={String(threads)} options={[1, 2, 4, 8].map(value => ({ value: String(value), label: `${value} threads` }))} onValueChange={value => setThreads(Number(value))} /></Field>
            <Field label="Time limit"><AppSelect label="Simulation time limit" value={String(timeoutMinutes)} options={[1, 5, 15, 30, 60, 120].map(value => ({ value: String(value), label: `${value} minutes` }))} onValueChange={value => setTimeoutMinutes(Number(value))} /></Field>
          </div>
          <p className="muted">Simulated damage models your character playing without mistakes · Compare it with your own runs, not with damage meters or logs · It does not measure healing, tank survival, or PvP</p>
        </details>
    </Card>

    {(running ?? justFinished) && <RunningJob job={(running ?? justFinished)!} expectedMs={expectedMs} disabled={mutation.isPending || !running} onCancel={() => running && perform(() => api.cancelSimulation({ characterId: character.id, jobId: running.id }))} />}

    {data && <DamageHistory jobs={data.jobs} scenario={scenario} />}

    <Card className="simulation-section" role="region" aria-label="Simulation jobs">
      <div className="simulation-heading"><h2>Results</h2>{finished.length > 0 && <span className="muted small">{finished.length} saved</span>}</div>
      {workspace.isPending ? <p role="status">Loading saved results…</p>
        : !finished.length ? <div className="simulation-empty"><FlaskConical size={25} /><p>No results yet</p><span className="muted">Each result keeps the exact gear, scenario, and engine it was run with</span></div>
        : <ul className="sim-results">{shownJobs.map(job => <JobRow key={job.id} job={job} onOpen={onOpenJob && job.result ? () => onOpenJob(job.id) : undefined} />)}</ul>}
      {finished.length > 5 && <Button variant="quiet" onClick={() => setAllJobs(value => !value)}>{allJobs ? 'Show the latest 5' : `Show all ${finished.length} results`}</Button>}
    </Card>

    <Card className="simulation-section"><details className="sim-disclosure" aria-label="Simulation profile" open={exported?.coverage === 'partial' || undefined}>
      <summary><FileCode2 size={15} aria-hidden="true" /><span>SimulationCraft profile</span><Badge tone={exported?.coverage === 'complete' ? 'green' : 'amber'}>{exported?.coverage === 'complete' ? 'Complete profile' : 'Partial profile'}</Badge>{data?.profile && <small className="muted">Saved import: {data.profile.matchesCurrent ? 'matches the recorded baseline' : 'does not match the recorded baseline'}</small>}</summary>
      <p className="muted">{character.name} · {character.specName} · Build {character.gameBuild ?? 'unknown'} · Export your observed gear and talents, or import a supported single-character /simc profile</p>
      <Field label="SimulationCraft profile"><textarea className="simulation-profile" aria-label="SimulationCraft profile" spellCheck={false} value={text ?? exported?.text ?? ''} onChange={event => setText(event.target.value)} maxLength={1_048_576} /></Field>
      <div className="simulation-actions"><Button disabled={!exported} onClick={() => void navigator.clipboard.writeText(text ?? exported?.text ?? '').then(() => notify('Profile copied')).catch(error => notify(errorMessage(error)))}><Copy size={14} />Copy profile</Button><Button disabled={mutation.isPending || !text?.trim()} onClick={() => perform(async () => { const imported = await api.importSimulationProfile({ characterId: character.id, text: text! }); setSavedProfileText(text!); notify(imported.matchesCurrent ? 'Profile saved for this baseline' : 'Profile saved with a baseline mismatch') })}>Save imported profile</Button><Button variant="quiet" disabled={mutation.isPending} onClick={() => perform(async () => { await api.clearSimulationProfile({ characterId: character.id }); setText(null); await profile.refetch() })}>Use current export</Button></div>
      {exported?.reasons.length ? <details className="simulation-details"><summary>{exported.reasons.length} fields need attention before local execution</summary><ul>{exported.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details> : null}
      {data?.profile && <p className="muted">Saved {new Date(data.profile.createdAt).toLocaleString()}</p>}
    </details></Card>

    <Card className="simulation-section"><details className="sim-disclosure" aria-label="External simulation reports">
      <summary><Link2 size={15} aria-hidden="true" /><span>Saved reports</span>{data?.reports.length ? <small className="muted">{data.reports.length} saved</small> : <small className="muted">Bookmark Raidbots or SimulationCraft links</small>}</summary>
      <p className="muted">Links are bookmarks with your notes, not imported results</p>
      <Field label="Report URL"><input aria-label="Simulation report URL" type="url" placeholder="https://www.raidbots.com/simbot/report/…" value={reportUrl} maxLength={2048} onChange={event => setReportUrl(event.target.value)} /></Field>
      <Field label="Notes"><textarea aria-label="Simulation report notes" value={notes} maxLength={4000} onChange={event => setNotes(event.target.value)} rows={2} /></Field>
      <Button disabled={mutation.isPending || !reportUrl.trim()} onClick={() => perform(async () => { await api.saveSimulationReport({ characterId: character.id, url: reportUrl, notes }); setReportUrl(''); setNotes('') })}>Save report</Button>
      {data?.reports.map(report => <div className="simulation-report" key={report.id}><div><strong>{new URL(report.url).hostname}</strong><p>{report.notes || 'No notes'}</p><small className="muted">{report.baselineHash === data.baselineHash ? 'Saved against this baseline' : 'Saved against an older baseline'} · {new Date(report.createdAt).toLocaleString()}</small></div><Button variant="quiet" aria-label="Open saved simulation report" onClick={() => void api.openExternal(report.url).catch(error => notify(errorMessage(error)))}><ExternalLink size={15} /></Button></div>)}
    </details></Card>
  </div>
}

const dps = (value: number) => `${Math.round(value).toLocaleString()} DPS`
const signed = (value: number) => `${value > 0 ? '+' : value < 0 ? '−' : ''}${Math.abs(Math.round(value)).toLocaleString()}`
function scenarioLine(job: SimulationJob) {
  const scenario = requestScenario(job.request)
  return [simulationScenarios[job.request.scenarioId].label, scenario.targets && scenario.targets > 1 ? `${scenario.targets} targets` : null, `${Math.round(scenario.fightSeconds / 60 * 10) / 10} min`].filter(Boolean).join(' · ')
}

/** The one number worth reading in the list; everything else lives on the job's detail page */
function headline(job: SimulationJob): { value: string; note: string; tone?: 'up' | 'down' } | null {
  const result = job.result
  const baseline = result?.values[0]
  if (!result || !baseline) return null
  const candidates = result.values.slice(1)
  const whole = job.request.plan ? candidates[job.request.plan.whole ?? 0] : null
  const target = whole ?? [...candidates].sort((a, b) => b.mean - a.mean)[0]
  if (!target) return { value: dps(baseline.mean), note: 'Current gear' }
  const comparison = compareSimulationValues(baseline, target)
  const note = job.request.plan ? 'Whole plan' : job.request.benchmark ? 'Top players’ setup' : 'Best option'
  if (comparison.verdict === 'sidegrade') return { value: 'About the same', note }
  if (comparison.verdict === 'unknown') return { value: dps(target.mean), note }
  return { value: `${signed(comparison.difference)} DPS`, note, tone: comparison.difference > 0 ? 'up' : 'down' }
}

/** A short label for why a result no longer matches, with the full reasons in its tooltip */
function staleLabel(reasons: string[]) {
  const text = reasons.join(' ')
  if (/Gear, talents, specialization/.test(text)) return 'Gear changed since'
  if (/engine game data/i.test(text)) return 'Engine data is older'
  if (/game build or seasonal rules/i.test(text)) return 'Game updated since'
  return 'Not current'
}

function JobRow({ job, onOpen }: { job: SimulationJob; onOpen?: () => void }) {
  const top = headline(job)
  const kind = kindOf(job)
  const Icon = kind === 'plan' ? ClipboardList : kind === 'top' ? Trophy : Play
  return <li className="sim-result" data-state={job.state}>
    <span className="sim-result-icon" aria-hidden="true"><Icon size={15} /></span>
    <span className="sim-result-text"><strong>{job.label}</strong><small className="muted">{scenarioLine(job)} · {new Date(job.createdAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</small>
      {job.state === 'failed' && job.failure && <small className="sim-result-failure" role="alert">{job.failure.replace(/\.+$/, '')}</small>}</span>
    {top ? <span className="sim-result-value" data-tone={top.tone}><strong>{top.value}</strong><small className="muted">{top.note}</small></span>
      : <Badge tone={job.state === 'failed' ? 'amber' : 'neutral'}>{job.state === 'cancelled' ? 'Cancelled' : job.state === 'failed' ? 'Failed' : job.state}</Badge>}
    {job.result?.applicability && job.result.applicability !== 'current' && <span title={job.result.reasons.join(' · ') || undefined}><Badge tone="neutral">{staleLabel(job.result.reasons)}</Badge></span>}
    {onOpen ? <Button variant="quiet" onClick={onOpen} aria-label={`Open details for ${job.label}`}>Details<ChevronRight size={14} /></Button> : <span />}
  </li>
}

/** How long runs of this kind usually take here, from the last few finished ones; a first run guesses a minute */
function typicalDuration(jobs: SimulationJob[], current: SimulationJob | null) {
  const kind = current ? kindOf(current) : null
  const spans = jobs.filter(job => job.state === 'completed' && job.startedAt && job.finishedAt && (!kind || kindOf(job) === kind))
    .map(job => Date.parse(job.finishedAt!) - Date.parse(job.startedAt!)).filter(ms => ms > 0).slice(0, 5).sort((a, b) => a - b)
  return spans.length ? spans[Math.floor(spans.length / 2)]! : 60_000
}

function RunningJob({ job, expectedMs, disabled, onCancel }: { job: SimulationJob; expectedMs: number; disabled: boolean; onCancel: () => void }) {
  const status = job.state === 'completed' ? 'done' : job.state === 'failed' ? 'error' : job.state === 'queued' ? 'idle' : 'running'
  const words = job.state === 'completed' ? 'Finished' : job.state === 'failed' ? 'Failed' : job.state === 'queued' ? 'Waiting to start' : 'Running'
  return <Card className="simulation-section sim-running" role="region" aria-label="Running simulation">
    <CallChip icon={<Cpu size={14} />} name="SimulationCraft" argument={job.label} status={status} expectedMs={expectedMs} startedAt={job.startedAt ? Date.parse(job.startedAt) : null} />
    <span className="sim-result-text"><strong>{words}</strong><small className="muted">{scenarioLine(job)} · {job.request.options.iterations.toLocaleString()} iterations{status === 'running' ? ` · usually about ${Math.max(1, Math.round(expectedMs / 1000))} s` : ''}</small></span>
    {status === 'running' || status === 'idle' ? <Button disabled={disabled} onClick={onCancel}><X size={14} />Cancel</Button> : <span />}
  </Card>
}
