import {useState} from 'react'
import { FightReview } from './FightReview'
import { Check, Cpu, Download, KeyRound } from 'lucide-react'
import {useQuery,useQueryClient} from '@tanstack/react-query'
import {api} from '../../lib/client'
import {Badge,Button,Field} from '../../components/ui/primitives'
import {notify,errorMessage} from '../../lib/notify'
import { Card } from '../../components/ui/card'
/** Settings: the local SimulationCraft engine and the player's own Warcraft Logs client, in the shared row layout */
export function ProviderSettings() {
  const cache = useQueryClient()
  const status = useQuery({ queryKey: ['logs-status'], queryFn: api.logsStatus })
  const [clientId, setId] = useState('')
  const [clientSecret, setSecret] = useState('')
  const [busy, setBusy] = useState(false)
  const connected = !!status.data?.configured
  async function save(clear = false) {
    setBusy(true)
    try {
      if (clear) await api.clearLogs(); else await api.configureLogs({ clientId, clientSecret })
      setSecret('')
      await cache.invalidateQueries({ queryKey: ['logs-status'] })
      notify(clear ? 'Warcraft Logs disconnected' : 'Warcraft Logs connected')
    } catch (e) { notify(errorMessage(e)) } finally { setBusy(false) }
  }
  return (
    <section className="settings-section" aria-labelledby="integrations-heading">
      <h2 id="integrations-heading">Integrations</h2>
      <p>Local simulations and public Warcraft Logs report summaries</p>
      <Card className="settings-section-body">
        <div className="setting-row">
          <div>
            <h3>SimulationCraft</h3>
            <p>Choose the SimulationCraft program installed on this computer to run supported simulations locally</p>
          </div>
          <Button onClick={() => void api.chooseSimulationExecutable().then(value => { if (value) notify(`Selected ${value.name}`) }).catch(e => notify(errorMessage(e)))}><Cpu size={14} aria-hidden="true" />Choose program</Button>
        </div>
        <div className="setting-row integrations-logs">
          <div>
            <h3>Warcraft Logs {connected ? <Badge tone="green"><Check size={11} aria-hidden="true" />Connected</Badge> : <Badge>Not connected</Badge>}</h3>
            <p>Your own client ID and secret enable public report summaries. They are encrypted on this computer and left out of backups</p>
            {!connected && <div className="integrations-fields">
              <Field label="Client ID"><input autoComplete="off" value={clientId} onChange={e => setId(e.target.value)} maxLength={200} /></Field>
              <Field label="Client secret"><input type="password" autoComplete="new-password" value={clientSecret} onChange={e => setSecret(e.target.value)} maxLength={500} /></Field>
            </div>}
            {status.isError && <p className="error small" role="alert">{errorMessage(status.error)}</p>}
          </div>
          {connected
            ? <Button variant="quiet" disabled={busy} onClick={() => void save(true)}>Disconnect</Button>
            : <Button variant="primary" disabled={busy || !clientId || !clientSecret} onClick={() => void save()}><KeyRound size={14} aria-hidden="true" />{busy ? 'Connecting…' : 'Connect'}</Button>}
        </div>
      </Card>
    </section>
  )
}

export function ReportImport({characterId,url}:{characterId:string;url:string}){const [result,setResult]=useState<Awaited<ReturnType<typeof api.reportSummary>>|null>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false);return <div className="comparison-report-import"><Button disabled={busy} onClick={()=>{setBusy(true);setError('');void api.reportSummary({characterId,url}).then(setResult,e=>setError(errorMessage(e))).finally(()=>setBusy(false))}}><Download size={14} aria-hidden="true" />{busy?'Importing…':'Import public summary'}</Button>{error&&<p role="alert">{error}</p>}{result&&<><h3>{result.title}</h3><p>Player match: {result.actorMatch} · {result.coverage} coverage</p><ul className='comparison-report-fights'>{result.fights.map(f=><li key={f.id}><span>{f.name} · {f.kill?'Kill':'Attempt'} · Difficulty {f.difficulty??'unknown'} · {f.participated===true?'Player present':f.participated===false?'Player absent':'Participation unknown'}</span>{f.participated===true&&<FightReview characterId={characterId} url={url} fightId={f.id} />}</li>)}</ul>{result.limitations.map(v=><p key={v} className="secondary small">{v}</p>)}</>}</div>}
