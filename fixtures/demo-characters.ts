import { characterSchema, type Character } from '../src/shared/domain'
const now = '2026-10-14T12:00:00.000Z'
/** Explicitly fictional examples, loaded only when the user chooses demo data */
export function demoCharacters(): Character[] {
  return [
    { id:'demo-vaelith',name:'Vaelith',className:'Mage',specName:'Frost',specId:64,raceName:'Night Elf',raceId:4,itemLevel:268.4,targetItemLevel:281,maxItemLevel:289,isMain:true,favorite:true,rating:2456 },
    { id:'demo-serath',name:'Serath',className:'Paladin',specName:'Protection',specId:66,raceName:'Blood Elf',raceId:10,itemLevel:261.8,targetItemLevel:281,maxItemLevel:289,isMain:false,favorite:true,rating:1984 },
    { id:'demo-mosswind',name:'Mosswind',className:'Druid',specName:'Restoration',specId:105,raceName:'Tauren',raceId:6,itemLevel:253.1,targetItemLevel:275,maxItemLevel:null,isMain:false,favorite:false,rating:1320 },
  ].map((c,index) => characterSchema.parse({...c,edition:'retail',region:'us',realm:'Demo Realm',level:90,observedAt:now,importedAt:now,demo:true,sourceRefs:[{provider:'demo',edition:'retail',region:'us',realmId:'demo',characterKey:c.id}],gear:[{slot:'head',itemId:1000+index,name:'Illustrative headpiece',itemLevel:c.itemLevel,enchant:null,gems:[]},{slot:'finger1',itemId:2000+index,name:'Illustrative ring',itemLevel:c.itemLevel-5,enchant:null,gems:[]}],ratings:{mythicPlus:{value:c.rating,label:'Demo Mythic+ score',rank:null,population:null,seasonId:'demo',observedAt:now},raiding:{value:index===0?5:2,label:index===0?'5/8 Mythic · demo':'2/8 Mythic · demo',rank:null,population:null,seasonId:'demo',observedAt:now},pvp:null}}))
}
