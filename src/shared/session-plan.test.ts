import {describe,it,expect} from 'vite-plus/test'
import {buildSessionPlan,type ActionCandidate} from './session-plan'
const at='2026-10-29T12:00:00.000Z'
const action=(key:string,minutes:number|null,benefit=1):ActionCandidate=>({key,characterId:'a',characterName:'A',activity:'mythicPlus',kind:'weekly',title:key,reason:'Observed weekly threshold',prerequisites:[],benefit:{weekly:benefit},duration:minutes===null?null:{min:minutes,max:minutes,source:'manual',samples:1},deadline:null,observedAt:at,state:'supported',evidenceRefs:[],assumptions:[],target:'week'})
const plan=(actions:ActionCandidate[],extra:Partial<Parameters<typeof buildSessionPlan>[0]>={})=>buildSessionPlan({goal:'weekly',actions,budgetMinutes:20,pinnedActionKeys:[],snoozedActionKeys:[],context:{now:at,gameBuild:null,seasonId:null,rulesetId:null},...extra})
describe('Tonight plan',()=>{
  it('does not recommend a different goal when the chosen benefit is unsupported',()=>{expect(plan([action('weekly',10)],{goal:'cosmetics'}).recommended).toBeNull()})
  it('excludes known long activities and leaves unknown duration unscheduled',()=>{const p=plan([action('long',30),action('unknown',null),action('fits',15)]);expect(p.recommended?.key).toBe('fits');expect(p.unscheduled[0]?.key).toBe('unknown');expect(p.excluded[0]?.key).toBe('long')})
  it('keeps a feasible pin stable across unrelated input ordering and score changes',()=>{const a=action('pin',15),b=action('other',10,99);expect(plan([a,b],{pinnedActionKeys:['pin']}).recommended?.key).toBe('pin');expect(plan([b,a],{pinnedActionKeys:['pin']}).recommended?.key).toBe('pin')})
  it('expires reset opportunities and excludes snoozed and dismissed actions',()=>{const expired={...action('old',5),deadline:at};const p=plan([expired,action('snooze',5),action('dismiss',5),action('keep',10)],{snoozedActionKeys:['snooze'],dismissedActionKeys:['dismiss']});expect(p.recommended?.key).toBe('keep');expect(p.excluded).toHaveLength(3)})
  it('uses stable keys for tied choices and never schedules incompatible future observations',()=>{expect(plan([action('b',10),action('a',10)]).recommended?.key).toBe('a');expect(plan([{...action('bad',1),observedAt:'2027-01-01T00:00:00Z'}]).recommended).toBeNull()})
  it('permits unknown duration only without a strict budget',()=>{expect(plan([action('unknown',null)],{budgetMinutes:null}).recommended?.duration).toBeNull();expect(plan([action('unknown',null)],{budgetMinutes:null}).recommended?.key).toBe('unknown')})
})
