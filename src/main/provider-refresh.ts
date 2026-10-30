import { Effect, Schedule } from 'effect'
import type { DatabaseClient } from './database'
import { fetchRaiderIoProfile, RaiderIoError } from './providers/raiderio'

/** A provider refresh never rewrites the addon gear observation timestamp */
export function refreshPublicCharacter(db:DatabaseClient,id:string){return Effect.runPromise(Effect.gen(function*(){
  const c=yield* Effect.tryPromise(()=>db.call('getCharacter',id))
  if(!c) return yield* Effect.fail(new Error('Character was not found'))
  if(c.demo)return yield* Effect.fail(new Error('Demo characters use fictional data and cannot refresh from live providers'))
  if(!['us','eu','kr','tw','cn'].includes(c.region.toLowerCase()))return yield* Effect.fail(new Error('Choose a supported character region before refreshing'))
  const profile=yield* Effect.tryPromise({try:signal=>fetchRaiderIoProfile({region:c.region.toLowerCase() as 'us'|'eu'|'kr'|'tw'|'cn',realm:c.realm,name:c.name},signal),catch:e=>e instanceof Error?e:new Error('Public profile refresh failed')}).pipe(Effect.retry({times:2,schedule:Schedule.exponential('1 second'),while:e=>e instanceof RaiderIoError&&e.retryAfterMs!=null&&e.retryAfterMs<=30000}))
  return yield* Effect.tryPromise(()=>db.call('applyProviderProfile',id,profile))
}))}
