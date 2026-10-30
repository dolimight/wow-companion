import {useState} from 'react'
import {useQuery,useMutation,useQueryClient} from '@tanstack/react-query'
import {ArrowRight,Clock,Pin,Undo2,RefreshCw} from 'lucide-react'
import type {Character,Activity} from '../../../shared/domain'
import type {ActionCandidate,SessionPreferences,SessionGoal} from '../../../shared/session-plan'
import {api} from '../../lib/client'
import {Badge,Button,EmptyState,Field} from '../../components/ui/primitives'
import {AppSelect} from '../../components/AppSelect'
import {Toggle} from '../../components/ui/toggle'
import {errorMessage,notify} from '../../lib/notify'
import './tonight.css'

const goals=[{value:'gear',label:'Gear progression'},{value:'weekly',label:'Weekly rewards'},{value:'score',label:'Activity score'},{value:'raidPreparation',label:'Raid preparation'},{value:'cosmetics',label:'Cosmetics'}]
const activities:Array<{value:Activity;label:string}>=[{value:'mythicPlus',label:'Mythic+'},{value:'raiding',label:'Raiding'},{value:'pvp',label:'PvP'}]
export function TonightPage({characters,selectedCharacterId,onOpen}:{characters:Character[];selectedCharacterId:string|null;onOpen:(id:string,section:ActionCandidate['target'])=>void}){
  const anchor=characters.find(c=>c.id===selectedCharacterId&&!c.archived)?.id??characters.find(c=>!c.archived)?.id,cache=useQueryClient()
  const workspace=useQuery({queryKey:['tonight',anchor],queryFn:()=>api.sessionWorkspace({characterId:anchor!}),enabled:!!anchor,refetchInterval:60_000})
  const [busy,setBusy]=useState(false)
  const refresh=async(task:()=>Promise<unknown>)=>{setBusy(true);try{await task();await cache.invalidateQueries({queryKey:['tonight',anchor]})}catch(e){notify(errorMessage(e))}finally{setBusy(false)}}
  const preferences=workspace.data?.state.preferences
  const change=(patch:Partial<SessionPreferences>)=>preferences&&void refresh(()=>api.saveSessionPreferences({characterId:anchor!,preferences:{...preferences,...patch}}))
  const action=(value:ActionCandidate)=>({
    pinned:workspace.data?.state.dispositions.some(d=>d.key===value.key&&d.kind==='pin')??false,
    onOpen:()=>onOpen(value.characterId,value.target),
    onPin:()=>void refresh(()=>api.setSessionDisposition({characterId:anchor!,key:value.key,kind:'pin',until:null})),
    onSnooze:()=>void refresh(()=>api.setSessionDisposition({characterId:anchor!,key:value.key,kind:'snooze',until:value.deadline??new Date(Date.now()+86_400_000).toISOString()})),
    onDismiss:()=>void refresh(()=>api.setSessionDisposition({characterId:anchor!,key:value.key,kind:'dismiss',until:value.deadline})),
    onDuration:(minutes:number,completed=false)=>void refresh(()=>api.setSessionDuration({characterId:anchor!,key:value.key,minutes,completed})),
  })
  if(!anchor)return <EmptyState icon={Clock} title="Plan your next session" description="Add a character to build a plan from your saved gear and weekly observations" />
  const plan=workspace.data?.plan
  return <><div className="page-heading"><div><h1>Tonight</h1><p>A useful next step for the time you have</p></div><Button disabled={workspace.isFetching} onClick={()=>void workspace.refetch()}><RefreshCw size={15}/>Refresh plan</Button></div>
    {workspace.isPending?<p role="status">Reviewing your saved observations…</p>:workspace.isError?<div className="error-surface" role="alert">{errorMessage(workspace.error)}<Button onClick={()=>void workspace.refetch()}>Try again</Button></div>:preferences&&plan&&<>
    <section className="surface tonight-controls" aria-label="Session preferences">
      <div className="tonight-selects"><Field label="Session goal"><AppSelect label="Session goal" value={preferences.goal} options={goals} onValueChange={v=>change({goal:v as SessionGoal})} disabled={busy}/></Field><Field label="Available time"><AppSelect label="Available time" value={String(preferences.budgetMinutes??'any')} options={[{value:'any',label:'No strict time limit'},...[20,30,60,90,120].map(n=>({value:String(n),label:`${n} minutes`}))]} onValueChange={v=>change({budgetMinutes:v==='any'?null:Number(v)})} disabled={busy}/></Field></div>
      <div className="tonight-toggles" aria-label="Included characters">{characters.filter(c=>!c.archived).map(c=><Toggle key={c.id} pressed={preferences.characterIds.includes(c.id)} disabled={busy} onPressedChange={on=>change({characterIds:on?[...preferences.characterIds,c.id]:preferences.characterIds.filter(id=>id!==c.id)})}>{c.name}</Toggle>)}</div>
      <div className="tonight-toggles" aria-label="Included activities">{activities.map(a=><Toggle key={a.value} pressed={preferences.activities.includes(a.value)} disabled={busy} onPressedChange={on=>change({activities:on?[...preferences.activities,a.value]:preferences.activities.filter(v=>v!==a.value)})}>{a.label}</Toggle>)}</div>
    </section>
    {plan.recommended?<ActionCard key={plan.recommended.key} value={plan.recommended} featured busy={busy} {...action(plan.recommended)}/>:<section className="surface tonight-empty"><h2>{plan.unscheduled.length?'Add a duration to schedule a next step':'No supported next step yet'}</h2><p>{plan.unscheduled.length?'Your saved goals are below — estimate their duration or choose no strict time limit':'Sync current weekly progress, save a gear goal, or include another character or activity'}</p></section>}
    {!!plan.alternatives.length&&<section aria-label="Other options"><h2 className="tonight-section-title">Other options</h2><div className="tonight-actions">{plan.alternatives.map(v=><ActionCard key={v.key} value={v} busy={busy} {...action(v)}/>)}</div></section>}
    {!!plan.unscheduled.length&&<section aria-label="Unscheduled opportunities"><h2 className="tonight-section-title">Needs a time estimate</h2><p className="secondary small">These opportunities have no established duration, so they do not count as fitting your time budget</p><div className="tonight-actions">{plan.unscheduled.map(v=><ActionCard key={v.key} value={v} busy={busy} {...action(v)}/>)}</div></section>}
    {!!workspace.data.state.dispositions.length&&<section className="surface tonight-history"><h2>Saved decisions</h2>{workspace.data.state.dispositions.map(d=><div key={d.key}><span>{d.kind==='pin'?'Pinned':d.kind==='dismiss'?'Dismissed':'Snoozed'} · {d.key.split(':').slice(-1)[0]}</span><Button variant="quiet" disabled={busy} onClick={()=>void refresh(()=>api.undoSessionDisposition({characterId:anchor!,key:d.key}))}><Undo2 size={14}/>Undo</Button></div>)}</section>}
    <p className="secondary small">Based on saved observations · Updated {new Date(plan.evaluatedAt).toLocaleTimeString()} · Unknown rewards and combat gains are not estimated</p>
    </>}
  </>
}
function ActionCard({value,featured=false,pinned,busy,onOpen,onPin,onSnooze,onDismiss,onDuration}:{value:ActionCandidate;featured?:boolean;pinned:boolean;busy:boolean;onOpen:()=>void;onPin:()=>void;onSnooze:()=>void;onDismiss:()=>void;onDuration:(minutes:number,completed?:boolean)=>void}){
  const [minutes,setMinutes]=useState('')
  return <article className={`surface tonight-action ${featured?'tonight-recommended':''}`}>
    <div className="tonight-action-meta"><span>{value.characterName} · {activities.find(a=>a.value===value.activity)?.label}</span>{featured&&<Badge tone="blue">Recommended next</Badge>}{pinned&&<Badge>Pinned</Badge>}</div>
    <h2>{value.title}</h2><p>{value.reason}</p>
    <div className="tonight-facts"><span><Clock size={14}/>{value.duration?`${value.duration.min===value.duration.max?value.duration.max:`${value.duration.min}–${value.duration.max}`} min · ${value.duration.source==='manual'?'Your estimate':`${value.duration.samples} completed sessions`}`:'Duration unknown'}</span><span>{value.deadline?`Before ${new Date(value.deadline).toLocaleString()}`:'No established deadline'}</span><span>{value.observedAt?`Observed ${new Date(value.observedAt).toLocaleString()}`:'Observation time unknown'}</span></div>
    <details><summary>Why this action</summary><ul>{[...value.prerequisites,...value.assumptions].map((s,i)=><li key={i}>{s}</li>)}</ul></details>
    <div className="tonight-action-buttons"><Button variant={featured?'primary':'secondary'} onClick={onOpen}>Review action<ArrowRight size={14}/></Button><Button disabled={busy||pinned} onClick={onPin}><Pin size={14}/>Pin</Button><Button variant="quiet" disabled={busy} onClick={onSnooze}>Snooze</Button><Button variant="quiet" disabled={busy} onClick={onDismiss}>Dismiss</Button></div>
    <div className="tonight-duration"><Field label="Duration in minutes"><input type="number" min={1} max={1440} step={1} aria-label={`Duration for ${value.title}`} value={minutes} onChange={e=>setMinutes(e.target.value)} placeholder="Your estimate"/></Field><Button disabled={busy||!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>1440} onClick={()=>onDuration(Number(minutes))}>Save estimate</Button><Button variant="quiet" disabled={busy||!Number.isInteger(Number(minutes))||Number(minutes)<1||Number(minutes)>1440} onClick={()=>onDuration(Number(minutes),true)}>Record completed session</Button></div>
  </article>
}
