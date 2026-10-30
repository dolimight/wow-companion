import { z } from 'zod'

export const evidenceRefSchema = z.object({ id:z.string().min(1),contentHash:z.string().min(1) })
export type EvidenceRef = z.infer<typeof evidenceRefSchema>
export const evaluationContextSchema = z.object({now:z.string().datetime(),gameBuild:z.string().nullable(),seasonId:z.string().nullable(),rulesetId:z.string().nullable(),region:z.string().optional()})
export type EvaluationContext = z.infer<typeof evaluationContextSchema>
export const evidenceRecordSchema = z.object({
  id:z.string().min(1),schemaVersion:z.literal(1),subjectType:z.enum(['character','account','catalog']),subjectId:z.string().min(1),field:z.string().min(1),
  kind:z.enum(['observed','derived','simulated','manual','unknown']),source:z.enum(['addon','blizzard','raiderio','warcraftlogs','local-game-data','simulationcraft','manual','companion']),
  sourceUrl:z.string().url().nullable(),observedAt:z.string().datetime().nullable(),retrievedAt:z.string().datetime(),gameBuild:z.string().nullable(),
  coverage:z.enum(['complete','partial','unknown']),value:z.unknown(),contentHash:z.string().min(1),parentEvidenceRefs:z.array(evidenceRefSchema).default([]),
})
export type EvidenceRecord = z.infer<typeof evidenceRecordSchema>
export type EvidenceState = {status:'current'|'stale'|'incompatible'|'unknown';reasons:string[];evaluatedAt:string}
export type FreshnessPolicy = {id:string;version:number;maxAgeMs:number|null;requireBuildMatch?:boolean;validFrom?:string|null;validUntil?:string|null}
export function evaluateEvidence(record:EvidenceRecord,policy:FreshnessPolicy,context:EvaluationContext):EvidenceState {
  const reasons:string[]=[]
  const output=(status:EvidenceState['status']):EvidenceState=>({status,reasons,evaluatedAt:context.now})
  if(policy.requireBuildMatch&&(!record.gameBuild||!context.gameBuild)){reasons.push('The game build is unknown');return output('unknown')}
  if(policy.requireBuildMatch&&record.gameBuild!==context.gameBuild){reasons.push('This observation belongs to another game build');return output('incompatible')}
  if(record.kind==='unknown'||!record.observedAt){reasons.push('The observation time is unknown');return output('unknown')}
  const now=Date.parse(context.now),at=Date.parse(record.observedAt)
  if(!Number.isFinite(now)||!Number.isFinite(at)){reasons.push('The observation time cannot be evaluated');return output('unknown')}
  if(at>now+5*60_000){reasons.push('The observation is in the future');return output('incompatible')}
  if(at>now)reasons.push('The observation clock is slightly ahead')
  if((policy.validFrom&&now<Date.parse(policy.validFrom))||(policy.validUntil&&now>=Date.parse(policy.validUntil))){reasons.push('This observation is outside its applicable interval');return output('stale')}
  if(policy.maxAgeMs!==null&&now-at>policy.maxAgeMs){reasons.push('The observation is older than the freshness policy');return output('stale')}
  if(record.coverage!=='complete'){reasons.push('The observation is incomplete');return output('unknown')}
  return output('current')
}
