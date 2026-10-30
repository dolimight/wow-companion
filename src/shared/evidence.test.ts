import { describe,expect,it } from 'vite-plus/test'
import { evidenceRecordSchema,evaluateEvidence } from './evidence'
import { progressionContext } from '../../fixtures/progression'
const record=()=>evidenceRecordSchema.parse({id:'e',schemaVersion:1,subjectType:'character',subjectId:'c',field:'gear',kind:'observed',source:'addon',sourceUrl:null,observedAt:'2026-10-27T11:30:00.000Z',retrievedAt:'2026-10-27T12:00:00.000Z',gameBuild:'12.1.5.70448',coverage:'complete',value:{},contentHash:'hash'})
const policy={id:'test',version:1,maxAgeMs:3_600_000,requireBuildMatch:true}
describe('observation freshness',()=>{
  it('uses observation time rather than retrieval time',()=>{expect(evaluateEvidence({...record(),observedAt:'2026-10-26T10:00:00.000Z'},policy,progressionContext).status).toBe('stale')})
  it('does not turn missing times or partial coverage into current data',()=>{expect(evaluateEvidence({...record(),observedAt:null},policy,progressionContext).status).toBe('unknown');expect(evaluateEvidence({...record(),coverage:'partial'},policy,progressionContext).status).toBe('unknown')})
  it('recognizes build mismatch, future observations and tolerated clock skew',()=>{
    expect(evaluateEvidence({...record(),gameBuild:'12.1.0'},policy,progressionContext).status).toBe('incompatible')
    expect(evaluateEvidence({...record(),observedAt:'2026-10-27T12:06:00.000Z'},policy,progressionContext).status).toBe('incompatible')
    expect(evaluateEvidence({...record(),observedAt:'2026-10-27T12:01:00.000Z'},policy,progressionContext)).toMatchObject({status:'current',reasons:['The observation clock is slightly ahead']})
  })
})
