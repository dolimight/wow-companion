import { useState } from 'react'
import { useMutation,useQuery,useQueryClient } from '@tanstack/react-query'
import { Copy,ExternalLink,Info,RefreshCw } from 'lucide-react'
import type { Activity,Character } from '../../../shared/domain'
import type { ComparisonInput,ComparisonRecord,ComparisonResult } from '../../../shared/comparisons'
import { AppSelect } from '../../components/AppSelect'
import { Badge,Button,Field } from '../../components/ui/primitives'
import { api } from '../../lib/client'
import { errorMessage,notify } from '../../lib/notify'
import './comparisons.css'
import {ReportImport} from './ProviderSettings'

const date=(at:string|null)=>at?new Date(at).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Unknown'
const number=(value:number|null)=>value===null?'Unknown':value.toLocaleString(undefined,{maximumFractionDigits:1})
const clean=(value:string)=>value.replace(/\.+\s*$/,'')
const label:Record<Activity,string>={mythicPlus:'Mythic+',raiding:'Raiding',pvp:'PvP'}
function Source({url,children}:{url:string|null;children:React.ReactNode}){
  return url?<Button variant="quiet" className="comparison-source-link" onClick={()=>void api.openExternal(url).catch(error=>notify(errorMessage(error)))}>{children}<ExternalLink size={12}/></Button>:<span>{children}</span>
}
function SampleChart({result}:{result:ComparisonResult}){
  if(result.status==='unsupported'||result.player.value===null)return null
  const history=result.population.selectionMethod==='character-history'
  const records=history?result.records.slice(-5):[...result.records].filter(r=>r.value!==null).sort((a,b)=>b.value!-a.value!).slice(0,5)
  const values:ComparisonRecord[]=history?records:[result.player,...records]
  const max=Math.max(1,...values.map(record=>record.value??0))
  return <div className="comparison-chart" role="img" aria-label={`${history?'Recent history':'Displayed sample'} of ${result.player.metricName}`}>
    {values.map((entry,index)=><div className="comparison-chart-row" key={`${entry.id}:${index}`}>
      <span title={entry.name}>{history?date(entry.observedAt):index===0?'You':entry.name}</span>
      <span className="comparison-chart-track"><span className={index===0&&!history?'comparison-chart-bar is-you':'comparison-chart-bar'} style={{width:`${(entry.value??0)/max*100}%`}}/></span>
      <strong>{number(entry.value)}</strong>
    </div>)}
  </div>
}

export function ComparisonPage({character,activity}:{character:Character;activity:Activity}){
  return <ComparisonContent key={`${character.id}:${activity}`} character={character} activity={activity}/>
}
function ComparisonContent({character,activity}:{character:Character;activity:Activity}){
  const [bracket,setBracket]=useState('')
  const brackets=useQuery({queryKey:['pvp-brackets',character.id,character.region],queryFn:()=>api.pvpBrackets({characterId:character.id,region:character.region==='eu'?'eu':'us'}),enabled:activity==='pvp'})
  const queryClient=useQueryClient()
  const [population,setPopulation]=useState<ComparisonInput['population']>('peers')
  const [region,setRegion]=useState<'us'|'eu'|'world'>(character.region==='eu'?'eu':character.region==='us'?'us':'world')
  const [keyLevel,setKeyLevel]=useState(''),[encounter,setEncounter]=useState(''),[difficulty,setDifficulty]=useState('any')
  const [filters,setFilters]=useState<{keyLevel:number|null;encounter:string|null;difficulty:string|null}>({keyLevel:null,encounter:null,difficulty:null})
  const [reportUrl,setReportUrl]=useState(''),[notes,setNotes]=useState('')
  const input:ComparisonInput={characterId:character.id,activity,population,region,...filters,pvpBracket:bracket||undefined}
  const query=useQuery({queryKey:['comparisons',character.id,activity,population,region,filters,bracket],queryFn:()=>api.comparePlayers(input),retry:false,staleTime:30_000})
  const reports=useQuery({queryKey:['comparison-reports',character.id],queryFn:()=>api.comparisonReports({characterId:character.id})})
  const save=useMutation({mutationFn:()=>api.saveComparisonReport({characterId:character.id,url:reportUrl.trim(),notes}),onSuccess:()=>{void queryClient.invalidateQueries({queryKey:['comparison-reports',character.id]});setReportUrl('');setNotes('');notify('Report saved locally')}})
  const result=query.data
  const apply=()=>{
    const level=keyLevel.trim()?Number(keyLevel):null
    if(level!==null&&(!Number.isInteger(level)||level<1||level>100)){notify('Choose a key level from 1 to 100');return}
    setFilters({keyLevel:level,encounter:encounter.trim()||null,difficulty:difficulty==='any'?null:difficulty})
  }
  return <section className="comparison-page" aria-label="Contextual player comparisons">
    {activity==='pvp'&&!!brackets.data?.brackets.length&&<AppSelect label="PvP bracket" value={bracket} options={[{value:'',label:'Choose a bracket'},...brackets.data.brackets.map(b=>({value:b.slug,label:b.name}))]} onValueChange={setBracket}/>}
    <div className="comparison-heading"><div><h2>Contextual comparison</h2><p>{label[activity]} · {character.specName} {character.className}</p></div><Button disabled={query.isFetching} onClick={()=>void query.refetch()}><RefreshCw size={14}/>Refresh comparison</Button></div>
    <div className="comparison-toolbar">
      <AppSelect aria-label="Comparison population" value={population} onValueChange={value=>setPopulation(value as ComparisonInput['population'])} options={[{value:'leaders',label:'Public leaders'},{value:'peers',label:'Relevant tracked peers'},{value:'history',label:'Your history'}]}/>
      <AppSelect aria-label="Comparison region" value={region} onValueChange={value=>setRegion(value as typeof region)} options={[{value:'us',label:'North America'},{value:'eu',label:'Europe'},{value:'world',label:'All regions'}]}/>
      <span className="comparison-context-label">Same specialization and rating season</span>
    </div>
    <details className="comparison-filter-details"><summary>Content filters and availability</summary>
      <p>Aggregate ratings support specialization, region, and known season · Encounter, difficulty, and key filters require a content-specific adapter</p>
      <div className="comparison-filter-fields">
        <Field label="Key level"><input type="number" min={1} max={100} value={keyLevel} onChange={event=>setKeyLevel(event.target.value)} placeholder="Any"/></Field>
        <Field label="Encounter"><input value={encounter} maxLength={120} onChange={event=>setEncounter(event.target.value)} placeholder="Any encounter"/></Field>
        <Field label="Difficulty"><AppSelect aria-label="Comparison difficulty" value={difficulty} onValueChange={setDifficulty} options={[{value:'any',label:'Any difficulty'},{value:'normal',label:'Normal'},{value:'heroic',label:'Heroic'},{value:'mythic',label:'Mythic'}]}/></Field>
        <Button onClick={apply}>Apply filters</Button>
      </div>
    </details>
    {query.isPending&&<p className="comparison-notice" role="status">Loading comparable observations</p>}
    {query.isError&&<p className="comparison-notice" role="alert">{clean(errorMessage(query.error))}</p>}
    {result&&<>
      <div className="comparison-metrics">
        <div><span>Your {clean(result.player.metricName)}</span><strong>{number(result.player.value)}</strong><small>Observed {date(result.player.observedAt)}</small></div>
        <div><span>Difference to sample best</span><strong>{number(result.gapToSampleBest)}</strong><small>{result.gapToSampleBest===null?'A compatible, current sample is needed':`${result.player.unit} · displayed observations only`}</small></div>
        <div><span>Native provider rank</span><strong>{result.providerRank?`#${result.providerRank.rank.toLocaleString()}`:'Unknown'}</strong><small>{result.providerRank?.scope??'No provider rank scope recorded'}</small></div>
      </div>
      <div className="comparison-population"><div><h3>{clean(result.population.label)}</h3><p>{result.population.sampleSize} observations · {result.population.provider}</p></div><Badge tone={result.status==='supported'?'green':result.status==='partial'?'amber':'neutral'}>{result.status==='unsupported'?'Unavailable':result.status==='partial'?'Partial coverage':'Supported'}</Badge></div>
      <div className="comparison-source-meta"><span>Season {result.context.seasonId??'unknown'}</span><span>Source observed {date(result.population.observedAt)}</span><span>Retrieved {date(result.population.retrievedAt)}</span><Source url={result.population.sourceUrl}>Open population source</Source></div>
      {(result.reasons.length>0||result.population.unsupportedFilters.length>0)&&<div className="comparison-notice"><Info size={16}/><div>{[...new Set(result.reasons)].map(reason=><p key={reason}>{clean(reason)}</p>)}</div></div>}
      <SampleChart result={result}/>
      <div className="table-wrap"><table className="data-table comparison-table"><thead><tr><th>{population==='history'?'Observation':'Player'}</th><th className="number">{clean(result.player.metricName)}</th><th>Source and context</th><th>Observed</th></tr></thead><tbody>
        {result.records.map((entry,index)=><tr key={`${entry.id}:${index}`}><td><Source url={entry.sourceUrl}>{population==='history'?date(entry.observedAt):entry.name}</Source><small>{entry.realm} · {entry.region.toUpperCase()}</small></td><td className="number">{number(entry.value)}</td><td><span>{entry.source}</span><small>{entry.seasonId??'Season unknown'} · {clean(entry.metricName)}</small></td><td>{date(entry.observedAt)}{!entry.observedAt&&entry.retrievedAt&&<small>Retrieved {date(entry.retrievedAt)}</small>}</td></tr>)}
      </tbody></table>{!result.records.length&&<div className="inline-empty">No observations satisfy the requested comparison</div>}</div>
      <details className="comparison-evidence"><summary>Applied filters and interpretation</summary><dl>{Object.entries(result.population.actualFilters).map(([key,value])=><div key={key}><dt>{key}</dt><dd>{value}</dd></div>)}</dl>{result.assumptions.map(assumption=><p key={assumption}>{clean(assumption)}</p>)}</details>
      {result.gearDifferences.length>0&&<section className="comparison-sample-details"><h3>Observed gear choices</h3><p>Counts describe the provider’s gear sample · Matching acquisition does not establish the correct rank, gems, or enchant</p><div className="comparison-gear-list">{result.gearDifferences.slice(0,12).map(entry=><div key={`${entry.slot}:${entry.itemId}`}><span><small>{entry.slot}</small><Source url={`https://www.wowhead.com/item=${entry.itemId}`}>{entry.name}</Source></span><span>{entry.count}/{entry.sampleSize} players</span>{entry.equipped&&<Badge tone="blue">Item equipped</Badge>}</div>)}</div></section>}
      {result.builds.length>0&&<section className="comparison-sample-details"><h3>Observed talent loadouts</h3><p>Use these as candidates for a compatible simulation</p>{result.builds.map((build,index)=><div className="comparison-build" key={build.loadout}><span>Loadout {index+1} · {build.count}/{build.sampleSize} players</span>{build.equipped&&<Badge tone="blue">Your recorded loadout</Badge>}<Button variant="quiet" onClick={()=>void navigator.clipboard.writeText(build.loadout).then(()=>notify('Talent loadout copied')).catch(()=>notify('Copy unavailable'))}><Copy size={13}/>Copy loadout</Button></div>)}</section>}
    </>}
    <section className="comparison-reports"><h3>Warcraft Logs reports</h3><p>Save public report links and your notes · Encounter summaries and event review require a configured, verified adapter</p>
      <form onSubmit={event=>{event.preventDefault();save.mutate()}}><Field label="Public report URL"><input type="url" required maxLength={2048} value={reportUrl} onChange={event=>setReportUrl(event.target.value)} placeholder="https://www.warcraftlogs.com/reports/…"/></Field><Field label="Your notes"><textarea maxLength={2000} value={notes} onChange={event=>setNotes(event.target.value)} rows={2}/></Field><Button type="submit" disabled={save.isPending||!reportUrl.trim()}>Save report</Button></form>
      {save.isError&&<p role="alert">{clean(errorMessage(save.error))}</p>}{reports.isError&&<p role="alert">{clean(errorMessage(reports.error))}</p>}
      <div className="comparison-report-list">{reports.data?.map(report=><article key={report.id}><div><Source url={report.url}>Open Warcraft Logs report</Source><Badge>Link saved</Badge></div>{report.notes&&<p>{report.notes}</p>}<small>Saved {date(report.updatedAt)} · Report contents have not been imported</small><ReportImport characterId={character.id} url={report.url}/></article>)}</div>
    </section>
  </section>
}
