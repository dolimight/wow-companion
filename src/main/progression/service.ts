import { createHash } from 'node:crypto'
import { z } from 'zod'
import catalogJson from '../../../data/season-rules/catalog.json'
import candidatesJson from '../../../data/season-rules/candidates.json'
import clientEvidence from '../../../data/season-rules/client-evidence.json'
import type { Activity, Character, GearItem } from '../../shared/domain'
import type { ItemSummary } from '../../shared/gamedata'
import { baselineFromCharacter, inventorySnapshotSchema, itemVariantSchema, toItemVariant, type ItemVariant } from '../../shared/gear-variants'
import { contentPreferencesSchema, resolveSeasonRuleset, seasonRulesCatalogSchema, type ContentPreferences, type SeasonRulesCatalog } from '../../shared/season-rules'
import { evaluateProgression, type ProgressionResult } from '../../shared/progression-evaluation'
import type { DatabaseClient } from '../database'

export type ProgressionRuleBundle={catalog:SeasonRulesCatalog;candidates:Record<string,ItemVariant[]>}
const candidateCatalogSchema=z.record(z.string(),z.array(itemVariantSchema).max(100_000))
let bundled:ProgressionRuleBundle|undefined
export function loadBundledProgressionRules():ProgressionRuleBundle {
  return bundled??={catalog:seasonRulesCatalogSchema.parse(catalogJson),candidates:candidateCatalogSchema.parse(candidatesJson)}
}

/** Evaluations are derived on demand and never overwrite the observed character or personal target */
export function createProgressionService(options:{
  db:Pick<DatabaseClient,'call'>
  items:(ids:number[])=>Promise<ItemSummary[]>
  installedBuild:()=>string|null
  metadataBuild?:()=>string|null
  evaluator?:(input:Parameters<typeof evaluateProgression>[0])=>Promise<ProgressionResult>
  rules?:()=>ProgressionRuleBundle
  now?:()=>Date
}) {
  async function character(characterId:string):Promise<Character> {
    const value=await options.db.call('getCharacter',characterId)
    if(!value) throw new Error('Character was not found')
    return value
  }
  return {
    async getContentPreferences(characterId:string,activity:Activity):Promise<ContentPreferences> {
      return options.db.call('getContentPreferences',characterId,activity)
    },
    async saveContentPreferences(characterId:string,activity:Activity,preferences:ContentPreferences):Promise<ContentPreferences> {
      return options.db.call('setContentPreferences',characterId,activity,contentPreferencesSchema.parse(preferences))
    },
    async evaluate(characterId:string,activity:Activity):Promise<ProgressionResult> {
      const current=await character(characterId)
      const preferences=await options.db.call('getContentPreferences',characterId,activity)
      const now=(options.now?.()??new Date()).toISOString()
      const installedBuild=options.installedBuild()
      const gameBuild=installedBuild??current.gameBuild
      const metadataBuild=options.metadataBuild?.()
      const metadataUsable=!options.metadataBuild||(!!gameBuild&&metadataBuild===gameBuild)
      const observedInventory=(current.inventoryObservations??[]).filter(location=>location.location==='bags'||location.location==='bank')
      const observedOwned=observedInventory.flatMap(location=>location.items)
      const ids=[...new Set([...current.gear,...observedOwned].flatMap(item=>item.itemId?[item.itemId]:[]))]
      const indexed:ItemSummary[]=[]
      if(metadataUsable)for(let offset=0;offset<ids.length;offset+=200)indexed.push(...await options.items(ids.slice(offset,offset+200)).catch(()=>[]))
      const byId=new Map(indexed.map(item=>[item.id,item]))
      function enrich(item:GearItem):GearItem{
        const known=item.itemId?byId.get(item.itemId):undefined
        let value=known?{...item,inventoryType:known.inventoryType,requiredLevel:known.requiredLevel,classId:known.classId,subclassId:known.subclassId,allowableClassMask:known.allowableClassMask,specIds:known.specIds,primaryStats:known.primaryStats}:item
        if(gameBuild===clientEvidence.build&&!value.upgradeTrackId){
          const mappings=(value.bonusIds??[]).map(bonus=>(clientEvidence.bonusRanks as Record<string,{trackId:string;rank:number;itemLevel:number}>)[String(bonus)]).filter(Boolean)
          if(mappings.length===1&&mappings[0]!.itemLevel===value.itemLevel)value={...value,upgradeTrackId:mappings[0]!.trackId,upgradeRank:mappings[0]!.rank}
        }
        return value
      }
      const enriched:Character={...current,gear:current.gear.map(enrich)}
      const baseline=baselineFromCharacter(enriched)
      baseline.gameBuild=gameBuild
      for(const item of baseline.items) {
        const observed=current.gear.find(value=>value.slot===item.slot)
        const contentHash=createHash('sha256').update(JSON.stringify(observed)).digest('hex')
        item.evidenceRefs=[{id:`${current.id}:gear:${item.slot}`,contentHash}]
      }
      baseline.evidenceRefs=baseline.items.flatMap(item=>item.evidenceRefs)
      const bundle=options.rules?.()??loadBundledProgressionRules()
      const catalog=seasonRulesCatalogSchema.parse(bundle.catalog)
      const context={now,gameBuild,seasonId:null as string|null,rulesetId:null as string|null,region:current.region}
      // Reviewed build/date mappings can establish a season; conflicting mappings remain unsupported
      const eligible=catalog.rulesets.filter(rule=>resolveSeasonRuleset({schemaVersion:1,rulesets:[rule]},{...context,seasonId:rule.seasonId})!==null)
      const ruleset=eligible.length===1?eligible[0]!:null
      context.seasonId=ruleset?.seasonId??null
      context.rulesetId=ruleset?.id??null
      const resources=current.progressionResources
      const resourcesCurrent=!!resources?.observedAt&&Date.parse(resources.observedAt)<=Date.parse(now)+300_000&&Date.parse(now)-Date.parse(resources.observedAt)<=86_400_000
      const resourceRefs=resources?[{id:`${current.id}:progression-resources`,contentHash:createHash('sha256').update(JSON.stringify(resources)).digest('hex')}]:[]
      const inventory=inventorySnapshotSchema.parse({
        schemaVersion:1,characterId,items:[...baseline.items,...observedInventory.flatMap(location=>location.items.map(item=>toItemVariant(enrich(item),{owned:true,observedAt:location.observedAt})))],coverage:current.inventoryObservations?.length?(observedInventory.length===2&&observedInventory.every(location=>location.coverage==='complete')&&current.gearCoverage==='complete'?'complete':'partial'):current.gearCoverage,
        currencies:resourcesCurrent?resources?.currencies:null,
        highWaterMarks:resourcesCurrent?resources?.highWaterMarks:null,
        discountCoverage:resourcesCurrent?resources?.discountCoverage:'unknown',
        observedAt:current.gearObservedAt,evidenceRefs:[...baseline.evidenceRefs,...resourceRefs],
      })
      const candidates=ruleset?(options.rules?candidateCatalogSchema.parse(bundle.candidates):bundle.candidates)[ruleset.id]??[]:[]
      const input={baseline,inventory,candidates,ruleset,preferences,context}
      const result=options.evaluator?await options.evaluator(input):evaluateProgression(input)
      if(ruleset)result.seasonReference={tracks:ruleset.upgradeTracks,candidateCount:candidates.length,candidateCoverage:ruleset.candidateCoverage,constraintsCoverage:ruleset.constraintsCoverage,limitations:gameBuild===clientEvidence.build?clientEvidence.limitations:[]}
      if(current.inventoryObservations?.length)result.assumptions.push('Owned candidates include equipped, bag and observed personal-bank items; Vault choices remain mutually exclusive unclaimed rewards')
      if(!ruleset)result.unresolved.push(catalog.rulesets.length?'No uniquely validated ruleset covers this build, date, and region':'No verified seasonal rules are installed for this game build')
      if(!metadataUsable){
        const reason=metadataBuild?'Item restrictions were indexed for a different game build':'Item restrictions have not been indexed for this game build'
        result.unresolved.push(reason)
        for(const key of ['ownedUpgrade','contentScoped','legalMaximum','affordable'] as const){
          const view=result[key]
          view.reasons.push(reason)
          view.itemLevel=null
          if(view.status==='supported')view.status='partial'
        }
      }
      if(!indexed.length)result.assumptions.push('Some item restrictions and weapon configuration are not verified by the local index')
      if(resources?.observedAt&&!resourcesCurrent)result.unresolved.push('Currency observations are stale or have an incompatible timestamp — sync in game before planning spending')
      if(resourcesCurrent)result.assumptions.push(`Currency balances were observed at ${resources!.observedAt}; later in-game spending is not reflected until the next export`)
      if(!current.gearObservedAt)result.assumptions.push('The gear observation time is unknown')
      if(current.gearSource)result.assumptions.push(`Equipped gear source: ${current.gearSource}`)
      // Do not publish a cap or spending plan derived from observations changed during worker work
      const latest=await character(characterId)
      const latestPreferences=await options.db.call('getContentPreferences',characterId,activity)
      if(JSON.stringify(latest)!==JSON.stringify(current)||JSON.stringify(latestPreferences)!==JSON.stringify(preferences)||options.installedBuild()!==installedBuild||options.metadataBuild?.()!==metadataBuild)throw new Error('Character observations or content preferences changed during progression calculation — refresh to use the latest data')
      return result
    },
  }
}
export type ProgressionService=ReturnType<typeof createProgressionService>
