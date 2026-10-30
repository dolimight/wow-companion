import {describe,it,expect} from 'vite-plus/test'
import {createLogsProvider,createPvpProvider,reportCode} from './providers'
import {MemorySecretStore} from '../secrets'
import {characterSchema} from '../../shared/domain'
const character=characterSchema.parse({id:'fixture',region:'us',realm:'Test',name:'Test',className:'Mage',specName:'Arcane',specId:62})
describe('official comparison adapters',()=>{
 it('discovers bracket URLs only from the requested official host and current season',async()=>{const provider=createPvpProvider({api:async()=>({get:async(path:string)=>path.endsWith('pvp-season/index')?{current_season:{id:99}}:{season:{id:99},leaderboards:[{name:'2v2',key:{href:'https://us.api.blizzard.com/data/wow/pvp-season/99/pvp-leaderboard/2v2'}},{name:'foreign',key:{href:'https://evil.example/data/wow/pvp-season/99/pvp-leaderboard/3v3'}}]}} as never)});const result=await provider.brackets({character,region:'us'});expect(result.brackets.map(b=>b.slug)).toEqual(['2v2'])})
 it('keeps rejected OAuth credentials out of secret storage',async()=>{const secrets=new MemorySecretStore(),provider=createLogsProvider({secrets,fetcher:async()=>new Response('{}',{status:401})});await expect(provider.configure({clientId:'fixture',clientSecret:'fixture-secret'})).rejects.toThrow('credentials');expect(await secrets.get('warcraftlogs-client')).toBeNull()})
 it('honors rate-limit retry without making repeated authentication requests',async()=>{let calls=0;const provider=createLogsProvider({secrets:new MemorySecretStore(),now:()=>new Date('2026-10-29T12:00:00Z'),fetcher:async()=>{calls++;return new Response('{}',{status:429,headers:{'retry-after':'60'}})}});await expect(provider.configure({clientId:'fixture',clientSecret:'secret'})).rejects.toThrow('rate limit');await expect(provider.configure({clientId:'fixture',clientSecret:'secret'})).rejects.toThrow('retry');expect(calls).toBe(1)})
 it('rejects arbitrary report hosts before any external request',()=>{expect(()=>reportCode('https://evil.example/reports/AbCdEfGhIjKlMnOp')).toThrow();expect(reportCode('https://www.warcraftlogs.com/reports/AbCdEfGhIjKlMnOp').code).toBe('AbCdEfGhIjKlMnOp')})
})
