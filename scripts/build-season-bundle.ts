/** Explicit maintenance command: npx tsx scripts/build-season-bundle.ts <matching-item-index.sqlite>
 * Reads the installed client's numeric tables and a matching read-only item index
 * It never promotes unresolved server conditions into complete reward coverage
 */
import Database from 'better-sqlite3'
import {createHash} from 'node:crypto'
import {mkdir,writeFile} from 'node:fs/promises'
import {detectInstall} from '../src/main/gamedata/install'
import {LocalCasc} from '../src/main/gamedata/casc'
import {Definitions} from '../src/main/gamedata/definitions'
import {readHeader,readTable,type Row} from '../src/main/gamedata/wdc'
import {seasonRulesetSchema} from '../src/shared/season-rules'
import {gearItemSchema} from '../src/shared/domain'
import {toItemVariant,type ItemVariant} from '../src/shared/gear-variants'
import {gearSlotsForInventoryType} from '../src/shared/gamedata'
const version='12.1.5.70575',install=await detectInstall()
if(!install||install.build.version!==version)throw Error(`This reviewed mapping supports exactly ${version}; review another build before generating its rules`)
if(!process.argv[2])throw Error('Pass the path of the matching item index')
const index=new Database(process.argv[2],{readonly:true,fileMustExist:true})
if((index.prepare("SELECT value FROM meta WHERE key='game_version'").get() as {value:string})?.value!==version)throw Error('The item index belongs to another game build')
const casc=await LocalCasc.open(install),definitions=new Definitions('.local/scratch/gamedata/definitions'),tables=new Map<string,Map<number,Row>>(),hashes:Record<string,string>={}
try{
  for(const name of ['CurrencyTypes','ItemBonusListGroupEntry','ItemExtendedCost','ItemBonus','ItemScalingConfig','ItemXBonusTree','ItemBonusTreeNode','JournalTierXInstance','JournalInstance','JournalEncounter','JournalEncounterItem']){
    const bytes=await casc.file(await definitions.fileDataId(name));hashes[name]=createHash('sha256').update(bytes).digest('hex')
    tables.set(name,readTable(bytes,await definitions.fields(name,casc.version,readHeader(bytes).layoutHash)))
  }
  const table=(name:string)=>tables.get(name)!,rows=(name:string)=>[...table(name).values()]
  const checkedAt=new Date().toISOString(),id=`midnight-s2-${version}`,bonusRanks:Record<string,{trackId:string;rank:number;itemLevel:number}>={}
  const tracks=[614,615,616,617,618].map((group,trackIndex)=>{
    const currencyId=3442+trackIndex,currency=table('CurrencyTypes').get(currencyId)
    if(!currency||!String(currency.Name_lang).endsWith('Mistcrest'))throw Error('The reviewed currency identities changed')
    const entries=rows('ItemBonusListGroupEntry').filter(r=>r.ItemBonusListGroupID===group&&Number(r.SequenceValue)<=6).sort((a,b)=>Number(a.SequenceValue)-Number(b.SequenceValue))
    if(entries.length!==6)throw Error('The reviewed track rank count changed')
    const trackId=`client-group-${group}`
    return {id:trackId,name:String(currency.Name_lang).replace(' Mistcrest',''),ranks:entries.map(entry=>{
      const rank=Number(entry.SequenceValue),bonuses=rows('ItemBonus').filter(b=>b.ParentItemBonusListID===entry.ItemBonusListID)
      const scaling=bonuses.find(b=>b.Type===49),config=scaling&&table('ItemScalingConfig').get((scaling.Value as number[])[0]!)
      if(!config||config.RequiredLevel!==90||config.ItemSquishEraID!==2)throw Error('The reviewed level mapping changed')
      const itemLevel=Number(config.ItemLevel),cost=table('ItemExtendedCost').get(Number(entry.ItemExtendedCostID))
      if(rank>1&&(!cost||(cost.CurrencyID as number[])[0]!==currencyId||(cost.CurrencyCount as number[])[0]!==20))throw Error('The reviewed base upgrade cost changed')
      bonusRanks[String(entry.ItemBonusListID)]={trackId,rank,itemLevel}
      return {rank,itemLevel,cost:rank===1?[]:[{currencyId:String(currencyId),amount:20},{currencyId:'money',amount:Number(cost!.Money)}],discountRequired:rank>1}
    })}
  })
  // Current-season Journal entries carry server availability conditions; retain that boundary
  const instances=new Set(rows('JournalTierXInstance').filter(r=>r.JournalTierID===505&&r.AvailabilityCondition===156363).map(r=>Number(r.JournalInstanceID)))
  const loot=rows('JournalEncounterItem').filter(row=>instances.has(Number(table('JournalEncounter').get(Number(row.JournalEncounterID))?.JournalInstanceID)))
  const nodes=new Map<number,Row[]>(),itemTrees=new Map<number,number[]>(),bonuses=new Map<number,Row[]>()
  for(const row of rows('ItemBonusTreeNode'))nodes.set(Number(row.ParentItemBonusTreeID),[...(nodes.get(Number(row.ParentItemBonusTreeID))??[]),row])
  for(const row of rows('ItemXBonusTree'))itemTrees.set(Number(row.ItemID),[...(itemTrees.get(Number(row.ItemID))??[]),Number(row.ItemBonusTreeID)])
  for(const row of rows('ItemBonus'))bonuses.set(Number(row.ParentItemBonusListID),[...(bonuses.get(Number(row.ParentItemBonusListID))??[]),row])
  const statement=index.prepare('SELECT * FROM items WHERE id=?'),candidates:ItemVariant[]=[]
  for(const reward of loot){
    const itemId=Number(reward.ItemID),item=statement.get(itemId) as Record<string,unknown>|undefined;if(!item)continue
    const slots=gearSlotsForInventoryType(Number(item.inventory_type));if(!slots.length)continue
    const encounter=table('JournalEncounter').get(Number(reward.JournalEncounterID))!,instance=table('JournalInstance').get(Number(encounter.JournalInstanceID))!
    const source={activity:instance.ID===1320||instance.ID===1317||instance.ID===1324?'raiding' as const:'mythicPlus' as const,difficulty:null,method:'dungeon',name:`${instance.Name_lang} · ${encounter.Name_lang}`,url:`https://www.wowhead.com/item=${itemId}`}
    if(source.activity==='raiding')source.method='raid'
    const seen=new Set<number>(),possibilities=new Map<string,{itemLevel:number;trackId:string|null;rank:number|null;bonusIds:number[]}>()
    const visit=(tree:number,depth=0)=>{if(depth>16||seen.has(tree))return;seen.add(tree);for(const node of nodes.get(tree)??[]){
      if(Number(node.ChildItemBonusTreeID))visit(Number(node.ChildItemBonusTreeID),depth+1)
      const list=Number(node.ChildItemBonusListID),matched=bonusRanks[String(list)]
      if(matched)possibilities.set(String(list),{itemLevel:matched.itemLevel,trackId:matched.trackId,rank:matched.rank,bonusIds:[list]})
      const group=Number(node.ChildItemBonusListGroupID)
      if(group>=614&&group<=618)for(const [bonus,rank]of Object.entries(bonusRanks))if(rank.trackId===`client-group-${group}`)possibilities.set(bonus,{itemLevel:rank.itemLevel,trackId:rank.trackId,rank:rank.rank,bonusIds:[Number(bonus)]})
      // This is a catalog reference, not proof the branch's server conditions are met
      for(const bonus of bonuses.get(list)??[])if(bonus.Type===49){const config=table('ItemScalingConfig').get((bonus.Value as number[])[0]!);if(config&&config.RequiredLevel===90&&config.ItemSquishEraID===2)possibilities.set(`scaling:${list}`,{itemLevel:Number(config.ItemLevel),trackId:null,rank:null,bonusIds:[list]})}
    }}
    for(const tree of itemTrees.get(itemId)??[])visit(tree)
    for(const [key,variant]of possibilities)for(const slot of slots)candidates.push(toItemVariant(gearItemSchema.parse({slot,itemId,name:item.name,itemLevel:variant.itemLevel,inventoryType:item.inventory_type,classId:item.class_id,subclassId:item.subclass_id,requiredLevel:item.required_level,allowableClassMask:item.allowable_class_mask,specIds:item.spec_ids?JSON.parse(String(item.spec_ids)):null,primaryStats:item.primary_stats?JSON.parse(String(item.primary_stats)):null,bonusIds:variant.bonusIds,upgradeTrackId:variant.trackId,upgradeRank:variant.rank}),{variantKey:`client:${version}:${itemId}:${key}:${slot}`,owned:false,coverage:'partial',source,availableFrom:checkedAt,currencyCost:null,evidenceRefs:[{id:`client:${version}:journal:${reward.ID}`,contentHash:hashes.JournalEncounterItem!}]}))
  }
  const unique=[...new Map(candidates.map(item=>[item.variantKey,item])).values()]
  const rules=seasonRulesetSchema.parse({schemaVersion:1,id,name:'Midnight Season 2 · installed-client reference',seasonId:'midnight-season-2',builds:{min:version,max:version},regions:['us','eu','kr','tw'],effectiveFrom:checkedAt,effectiveUntil:new Date(Date.parse(checkedAt)+7*86_400_000).toISOString(),status:'active',validated:true,sources:[{title:`Installed Retail ${version} numeric tables · mapping definitions`,url:'https://github.com/wowdev/WoWDBDefs',checkedAt},{title:'Blizzard 12.1.5 content notes',url:'https://news.blizzard.com/en-gb/article/24304162/12-1-5-content-update-notes',checkedAt},{title:'Blizzard hotfixes · Venomstone item-level correction',url:'https://news.blizzard.com/en-gb/article/24307310/hotfixes-october-27-2026',checkedAt}],validationFixtures:['src/main/progression/season-bundle.test.ts'],candidateCoverage:'partial',constraintsCoverage:'partial',upgradeTracks:tracks})
  await mkdir('data/season-rules',{recursive:true})
  await writeFile('data/season-rules/catalog.json',JSON.stringify({schemaVersion:1,rulesets:[rules]},null,2)+'\n')
  await writeFile('data/season-rules/candidates.json',JSON.stringify({[id]:unique},null,2)+'\n')
  await writeFile('data/season-rules/client-evidence.json',JSON.stringify({schemaVersion:1,build:version,checkedAt,tableHashes:hashes,bonusRanks,currencyNames:Object.fromEntries([3442,3443,3444,3445,3446].map(id=>[id,table('CurrencyTypes').get(id)?.Name_lang])),limitations:['Server availability conditions and boss/difficulty branches are not fully resolved','Crafted item caps, embellishment limits, PvP scaling and Ascendant Venomstone eligibility are not validated','These are candidate references, not a proven legal seasonal maximum','Base costs exclude character-specific discounts; fresh addon vendor quotes take precedence']},null,2)+'\n')
  console.log(JSON.stringify({build:version,tracks:tracks.length,rewards:unique.length,coverage:rules.candidateCoverage,absoluteMaximumVerified:false}))
}finally{await casc.close();index.close()}
