import {describe,expect,it} from 'vite-plus/test'
import {compatibilityMetadata} from './item-metadata'

describe('indexed item restrictions',()=>{
  it('retains class masks, explicit overrides and adaptive primary stats',()=>{
    expect(compatibilityMetadata({AllowableClass:-1,StatModifier_bonusStat:[71,32,-1]},[250,251])).toEqual({allowableClassMask:-1,specIds:[250,251],primaryStats:['strength','agility','intellect']})
    expect(compatibilityMetadata({AllowableClass:32,StatModifier_bonusStat:[4,4,5]},[])).toEqual({allowableClassMask:32,specIds:[],primaryStats:['strength','intellect']})
  })
  it('keeps unavailable metadata unknown and explicitly statless items empty',()=>{
    expect(compatibilityMetadata({},null)).toEqual({allowableClassMask:null,specIds:null,primaryStats:null})
    expect(compatibilityMetadata({AllowableClass:Number.MAX_SAFE_INTEGER+1,StatModifier_bonusStat:[-1,0,32]},[])).toEqual({allowableClassMask:null,specIds:[],primaryStats:[]})
  })
})
