import { describe,expect,it } from 'vite-plus/test'
import { gearItemSchema } from './domain'
import { comparePlanCompletion } from './plan-completion'
const item=(input:Record<string,unknown>={})=>gearItemSchema.parse({slot:'head',itemId:42,name:'Helm',itemLevel:100,bonusIds:[123],enchantId:0,gemIds:[],enchantCoverage:'complete',gemsCoverage:'complete',...input})
describe('independent gear plan completion',()=>{
  it('completes acquisition while preserving unfinished rank and enhancements',()=>{
    expect(comparePlanCompletion([item()],[item({itemLevel:110,enchantId:777})])[0]).toMatchObject({acquisition:'complete',rank:'missing',enhancements:'missing',complete:false})
  })
  it('does not treat incomplete same-ID observations as fully completed',()=>{
    const partial=item({bonusIds:null,enchantId:null,gemIds:null,enchantCoverage:'unknown',gemsCoverage:'unknown'})
    expect(comparePlanCompletion([partial],[partial])[0]).toMatchObject({acquisition:'complete',rank:'complete',variant:'unknown',enhancements:'unknown',complete:false})
  })
  it('recognizes exact completed goals including explicit empty enhancements',()=>{
    expect(comparePlanCompletion([item()],[item()])[0]).toMatchObject({complete:true,enhancements:'complete',variant:'complete'})
  })
  it('keeps different bonus variants and socket order distinct',()=>{
    expect(comparePlanCompletion([item({bonusIds:[456],gemIds:[1,2]})],[item({gemIds:[2,1]})])[0]).toMatchObject({acquisition:'complete',variant:'missing',enhancements:'missing',complete:false})
  })
  it('does not acquire a ring in another planned slot or a manual placeholder',()=>{
    expect(comparePlanCompletion([item({slot:'finger1'})],[item({slot:'finger2'})])[0]?.acquisition).toBe('missing')
    expect(comparePlanCompletion([item({itemId:null})],[item({itemId:null})])[0]?.acquisition).toBe('unknown')
  })
  it('can decode explicit enhancement goals from the original raw item link',()=>{
    const link='item:42:777:11:0:0:0:0:0:90:250:0:16:1:123'
    expect(comparePlanCompletion([item({itemLink:link,enchantId:777,gemIds:[11,0,0,0]})],[item({itemLink:link,enchantId:undefined,gemIds:undefined})])[0]?.complete).toBe(true)
  })
})
