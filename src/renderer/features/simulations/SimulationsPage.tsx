import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ExternalLink, FlaskConical, FolderOpen, Play, RefreshCw, X } from 'lucide-react'
import type { Activity, Character } from '../../../shared/domain'
import { compareSimulationValues, requestScenario, simulationScenarios, type SimulationJob, type SimulationScenarioId } from '../../../shared/simulation'
import { api } from '../../lib/client'
import { Button, Badge, Field } from '../../components/ui/primitives'
import { AppSelect } from '../../components/AppSelect'
import { Toggle } from '../../components/ui/toggle'
import { errorMessage, notify } from '../../lib/notify'
import { useUpdateBlocker } from '../../lib/update-safety'
import './simulations.css'

export function SimulationsPage({ character, activity }: { character: Character; activity: Activity }) {
  return <SimulationContent key={character.id} character={character} activity={activity} />
}
function SimulationContent({ character, activity }: { character: Character; activity: Activity }) {
  const queryClient = useQueryClient()
  const [scenario, setScenario] = useState<SimulationScenarioId>(activity === 'mythicPlus' ? 'big-pulls' : 'patchwerk')
  const [comparePlan, setComparePlan] = useState(false)
  const [threads, setThreads] = useState(4)
  const [timeoutMinutes, setTimeoutMinutes] = useState(30)
  const [text, setText] = useState<string | null>(null)
  const [savedProfileText, setSavedProfileText] = useState<string | null>(null)
  const [reportUrl, setReportUrl] = useState('')
  const [notes, setNotes] = useState('')
  const workspace = useQuery({ queryKey: ['simulations', character.id], queryFn: () => api.simulationWorkspace({ characterId: character.id }), refetchInterval: query => query.state.data?.jobs.some(job => job.state === 'queued' || job.state === 'running') ? 1500 : false })
  const profile = useQuery({ queryKey: ['simulation-profile', character.id, character.gearObservedAt, character.talents?.observedAt], queryFn: () => api.simulationProfile({ characterId: character.id }) })
  const mutation = useMutation({ mutationFn: (task: () => Promise<unknown>) => task(), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['simulations', character.id] }) }, onError: error => notify(errorMessage(error)) })
  const perform = (task: () => Promise<unknown>) => mutation.mutate(task)
  const exported = profile.data
  useUpdateBlocker(text !== null && text !== exported?.text && text !== savedProfileText, 'Save your simulation profile before restarting')
  const data = workspace.data
  const start = () => { const input = { characterId: character.id, activity, scenarioId: scenario, comparePlan, threads, timeoutMinutes }; perform(() => api.startSimulation(input)) }
  return <div className="simulation-page">
    <div className="page-heading"><div><h2>Simulations</h2><p>Compare modeled damage against a reproducible character baseline</p></div><Button disabled={workspace.isFetching} onClick={() => void workspace.refetch()}><RefreshCw size={15} />Refresh</Button></div>
    {(workspace.isError || profile.isError) && <p role="alert" className="error-surface">{errorMessage(workspace.error ?? profile.error)}</p>}
    <section className="surface simulation-section" aria-label="Simulation profile">
      <div className="simulation-heading"><h2>Your baseline</h2><Badge tone={exported?.coverage === 'complete' ? 'green' : 'amber'}>{exported?.coverage === 'complete' ? 'Complete profile' : 'Partial profile'}</Badge></div>
      <p className="muted">{character.name} · {character.specName} · Build {character.gameBuild ?? 'unknown'}</p>
      <p className="muted">Export your observed gear and talents, or import a supported single-character /simc profile</p>
      <Field label="SimulationCraft profile"><textarea className="simulation-profile" aria-label="SimulationCraft profile" spellCheck={false} value={text ?? exported?.text ?? ''} onChange={event => setText(event.target.value)} maxLength={1_048_576} /></Field>
      <div className="simulation-actions"><Button disabled={!exported} onClick={() => void navigator.clipboard.writeText(text ?? exported?.text ?? '').then(() => notify('Profile copied')).catch(error => notify(errorMessage(error)))}><Copy size={14} />Copy profile</Button><Button disabled={mutation.isPending || !text?.trim()} onClick={() => perform(async () => { const imported = await api.importSimulationProfile({ characterId: character.id, text: text! }); setSavedProfileText(text!); notify(imported.matchesCurrent ? 'Profile saved for this baseline' : 'Profile saved with a baseline mismatch') })}>Save imported profile</Button><Button variant="quiet" disabled={mutation.isPending} onClick={() => perform(async () => { await api.clearSimulationProfile({ characterId: character.id }); setText(null); await profile.refetch() })}>Use current export</Button></div>
      {exported?.reasons.length ? <details className="simulation-details"><summary>{exported.reasons.length} fields need attention before local execution</summary><ul>{exported.reasons.map(reason => <li key={reason}>{reason}</li>)}</ul></details> : null}
      {data?.profile && <p className="muted">Saved import: {data.profile.matchesCurrent ? 'matches the recorded baseline' : 'does not match the recorded baseline'} · {new Date(data.profile.createdAt).toLocaleString()}</p>}
    </section>
    <section className="surface simulation-section" aria-label="Local simulation controls">
      <div className="simulation-heading"><h2>Local engine</h2><Badge tone={data?.configured ? 'green' : 'neutral'}>{data?.configured ? data.executableName : 'Not configured'}</Badge></div>
      <p className="muted">Choose your installed SimulationCraft executable · One job runs at a time, with CPU and time limits</p>
      <div className="simulation-options"><Field label="Scenario"><AppSelect label="Simulation scenario" value={scenario} options={Object.entries(simulationScenarios).map(([value, preset]) => ({ value, label: `${preset.label} · ${preset.description}` }))} onValueChange={value => setScenario(value as SimulationScenarioId)} /></Field><Field label="CPU threads"><AppSelect label="Simulation threads" value={String(threads)} options={[1, 2, 4, 8].map(value => ({ value: String(value), label: `${value} threads` }))} onValueChange={value => setThreads(Number(value))} /></Field><Field label="Time limit"><AppSelect label="Simulation time limit" value={String(timeoutMinutes)} options={[1, 5, 15, 30, 60, 120].map(value => ({ value: String(value), label: `${value} minutes` }))} onValueChange={value => setTimeoutMinutes(Number(value))} /></Field></div>
      <Toggle pressed={comparePlan} onPressedChange={setComparePlan} aria-label="Compare planned gear">Compare current gear with the saved plan</Toggle>
      <div className="simulation-actions"><Button disabled={mutation.isPending} onClick={() => perform(() => api.chooseSimulationExecutable())}><FolderOpen size={14} />Choose engine</Button><Button variant="primary" disabled={mutation.isPending || !data?.configured || exported?.coverage !== 'complete' || activity === 'pvp'} onClick={start}><Play size={14} />Run simulation</Button></div>
      <p className="muted">{activity === 'pvp' ? 'Simulations model damage in Mythic+ and Raiding scenarios · Switch the activity above to run one' : `Simulating for ${activity === 'raiding' ? 'Raiding' : 'Mythic+'} · Damage results do not measure healing effectiveness, tank survival, or PvP performance`}</p>
    </section>
    <section className="surface simulation-section" aria-label="Simulation jobs"><h2>Results and jobs</h2>{workspace.isPending ? <p role="status">Loading saved jobs…</p> : !data?.jobs.length ? <div className="simulation-empty"><FlaskConical size={25} /><p>No simulations yet</p><span className="muted">Saved results retain their exact baseline, engine identity, scenario, and uncertainty</span></div> : data.jobs.map(job => <Job key={job.id} job={job} disabled={mutation.isPending} onCancel={() => perform(() => api.cancelSimulation({ characterId: character.id, jobId: job.id }))} />)}</section>
    <section className="surface simulation-section" aria-label="External simulation reports"><h2>External reports</h2><p className="muted">Save Raidbots or SimulationCraft report links with notes · Links are bookmarks, not imported simulation evidence</p><Field label="Report URL"><input aria-label="Simulation report URL" type="url" placeholder="https://www.raidbots.com/simbot/report/…" value={reportUrl} maxLength={2048} onChange={event => setReportUrl(event.target.value)} /></Field><Field label="Notes"><textarea aria-label="Simulation report notes" value={notes} maxLength={4000} onChange={event => setNotes(event.target.value)} rows={2} /></Field><Button disabled={mutation.isPending || !reportUrl.trim()} onClick={() => perform(async () => { await api.saveSimulationReport({ characterId: character.id, url: reportUrl, notes }); setReportUrl(''); setNotes('') })}>Save report</Button>{data?.reports.map(report => <div className="simulation-report" key={report.id}><div><strong>{new URL(report.url).hostname}</strong><p>{report.notes || 'No notes'}</p><small className="muted">{report.baselineHash === data.baselineHash ? 'Saved against this baseline' : 'Saved against an older baseline'} · {new Date(report.createdAt).toLocaleString()}</small></div><Button variant="quiet" aria-label="Open saved simulation report" onClick={() => void api.openExternal(report.url).catch(error => notify(errorMessage(error)))}><ExternalLink size={15} /></Button></div>)}</section>
  </div>
}
const dps = (value: number) => `${Math.round(value).toLocaleString()} DPS`
function scenarioLine(job: SimulationJob) {
  const scenario = requestScenario(job.request)
  return [simulationScenarios[job.request.scenarioId].label, scenario.targets && scenario.targets > 1 ? `${scenario.targets} targets` : null, `${Math.round(scenario.fightSeconds / 60 * 10) / 10} min`].filter(Boolean).join(' · ')
}
function Measure({ value, baseline, label }: { value: NonNullable<SimulationJob['result']>['values'][number]; baseline: NonNullable<SimulationJob['result']>['values'][number] | null; label: string }) {
  const comparison = baseline ? compareSimulationValues(baseline, value) : null
  const taken = value.damageTaken && baseline?.damageTaken ? compareSimulationValues(baseline.damageTaken, value.damageTaken) : null
  return <div><span>{label}</span><strong>{dps(value.mean)}</strong><small className="muted">{value.standardError === null ? 'Uncertainty unavailable' : `Standard error ±${value.standardError.toFixed(1)} DPS`}{comparison ? ` · ${comparison.verdict === 'unknown' ? 'Comparison unavailable' : comparison.verdict === 'sidegrade' ? 'Within uncertainty · sidegrade' : `${comparison.difference > 0 ? '+' : ''}${Math.round(comparison.difference).toLocaleString()} DPS`}` : ''}</small>{value.damageTaken && <small className="muted">Damage taken {Math.round(value.damageTaken.mean).toLocaleString()} per second{taken && taken.verdict !== 'unknown' ? ` · ${taken.verdict === 'sidegrade' ? 'about the same' : taken.difference < 0 ? `${Math.round(-taken.difference).toLocaleString()} less` : `${Math.round(taken.difference).toLocaleString()} more`}` : ''}</small>}</div>
}
function Job({ job, onCancel, disabled }: { job: SimulationJob; onCancel: () => void; disabled: boolean }) {
  const result = job.result
  const [all, setAll] = useState(false)
  const baseline = result?.values[0] ?? null
  // Profileset jobs can hold hundreds of candidates, so they are ranked and trimmed
  const ranked = result ? result.values.slice(1).map((value, index) => ({ value, label: job.request.candidateLabels[index] ?? (job.request.mode === 'copy' ? 'Planned gear' : `Candidate ${index + 1}`) })).sort((a, b) => job.request.mode === 'profileset' ? b.value.mean - a.value.mean : 0) : []
  const shown = all ? ranked : ranked.slice(0, 10)
  return <article className="simulation-job"><div className="simulation-heading"><div><strong>{job.label}</strong><p className="muted">{scenarioLine(job)} · {job.request.options.iterations.toLocaleString()} iterations · {new Date(job.createdAt).toLocaleString()}</p></div><Badge tone={job.state === 'completed' && result?.applicability === 'current' ? 'green' : job.state === 'failed' ? 'amber' : 'neutral'}>{job.state}</Badge>{['queued', 'running'].includes(job.state) && <Button disabled={disabled} onClick={onCancel}><X size={14} />Cancel</Button>}</div>{job.failure && <p role={job.state === 'failed' ? 'alert' : undefined}>{job.failure.replace(/\.+$/, '')}</p>}{result && <><p className="muted">SimulationCraft {result.engine.version} · Modeled damage · {result.applicability === 'current' ? 'Applicable to this baseline' : 'Historical or unsupported result'}</p><div className="simulation-values">{baseline && <Measure value={baseline} baseline={null} label="Current gear" />}{shown.map(entry => <Measure key={entry.value.name} value={entry.value} baseline={baseline} label={entry.label} />)}</div>{ranked.length > 10 && <Button variant="quiet" onClick={() => setAll(value => !value)}>{all ? 'Show the top 10' : `Show all ${ranked.length} candidates`}</Button>}{result.reasons.map(reason => <p className="muted" key={reason}>{reason}</p>)}<details className="simulation-details"><summary>Reproduce this result</summary><dl><dt>Baseline</dt><dd>{result.baselineHash}</dd><dt>Scenario</dt><dd>{result.scenarioHash}</dd><dt>Engine SHA-256</dt><dd>{result.engine.executableHash}</dd><dt>Game data</dt><dd>{result.engine.gameBuild ?? 'Unknown'}</dd><dt>Report adapter</dt><dd>SimulationCraft JSON {result.engine.reportVersion}</dd></dl></details></>}</article>
}
