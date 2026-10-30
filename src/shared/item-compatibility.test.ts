import {describe,expect,it} from 'vite-plus/test'
import {getItemCompatibility} from './item-compatibility'
import type {ItemSearchCharacter,ItemSummary} from './gamedata'

const character=(className:string,specId:number|null):ItemSearchCharacter=>({className,specId,level:90})
const weapon=(subclassId:number,inventoryType=17,primaryStats:ItemSummary['primaryStats']=['strength']):ItemSummary=>({id:42,name:'Fixture weapon',quality:4,itemLevel:300,requiredLevel:90,slot:'Weapon',inventoryType,armor:null,icon:null,expansion:12,sources:[],classId:2,subclassId,allowableClassMask:-1,specIds:[],primaryStats})
const armor=(armor:ItemSummary['armor']):ItemSummary=>({...weapon(4),classId:4,inventoryType:1,armor,subclassId:['cloth','leather','mail','plate'].indexOf(armor!)+1,primaryStats:['strength','agility','intellect']})

describe('character and specialization equipment checks',()=>{
  it('checks Blood two-hand weapons and disallows off-hand equipment',()=>{
    expect(getItemCompatibility(weapon(8),character('Death Knight',250),{slot:'mainHand'})).toMatchObject({compatible:true,verified:true})
    expect(getItemCompatibility(weapon(7,13),character('Death Knight',250),{slot:'mainHand'}).compatible).toBe(false)
    expect(getItemCompatibility(weapon(8),character('Death Knight',250),{slot:'offHand'}).compatible).toBe(false)
  })
  it('allows Fury two-hand offhand weapons while other specs retain restrictions',()=>{
    expect(getItemCompatibility(weapon(8),character('Warrior',72),{slot:'offHand'}).compatible).toBe(true)
    expect(getItemCompatibility(weapon(8),character('Warrior',71),{slot:'offHand'}).compatible).toBe(false)
  })
  it('keeps shields with shield specs and caster holdables with caster specs',()=>{
    const shield={...armor('plate'),inventoryType:14,subclassId:6,armor:null,primaryStats:['strength' as const]}
    expect(getItemCompatibility(shield,character('Paladin',66),{slot:'offHand'}).compatible).toBe(true)
    expect(getItemCompatibility(shield,character('Paladin',70),{slot:'offHand'}).compatible).toBe(false)
    const holdable={...shield,inventoryType:23,subclassId:0,primaryStats:['intellect' as const]}
    expect(getItemCompatibility(holdable,character('Mage',62),{slot:'offHand'}).compatible).toBe(true)
    expect(getItemCompatibility(holdable,character('Death Knight',250),{slot:'offHand'}).compatible).toBe(false)
  })
  it('distinguishes ranged hunters from Survival',()=>{
    expect(getItemCompatibility(weapon(2,15,['agility']),character('Hunter',253),{slot:'mainHand'}).compatible).toBe(true)
    expect(getItemCompatibility(weapon(2,15,['agility']),character('Hunter',255),{slot:'mainHand'}).compatible).toBe(false)
    expect(getItemCompatibility(weapon(6,17,['agility']),character('Hunter',255),{slot:'mainHand'}).compatible).toBe(true)
    expect(getItemCompatibility(weapon(6,17,['agility']),character('Hunter',254),{slot:'mainHand'}).compatible).toBe(false)
  })
  it('checks class armor, masks and required levels',()=>{
    expect(getItemCompatibility(armor('plate'),character('Mage',62)).compatible).toBe(false)
    expect(getItemCompatibility({...armor('cloth'),allowableClassMask:32},character('Mage',62)).compatible).toBe(false)
    expect(getItemCompatibility(armor('cloth'),{...character('Mage',62),level:80}).compatible).toBe(false)
  })
  it('keeps unknown/zero/wrong-class specs partial instead of treating them as verified',()=>{
    for (const specId of [null,0,250]) expect(getItemCompatibility(armor('cloth'),character('Mage',specId))).toMatchObject({compatible:true,verified:false})
    expect(getItemCompatibility({...armor('cloth'),allowableClassMask:null,specIds:null,primaryStats:null},character('Mage',62))).toMatchObject({compatible:true,verified:false})
  })
  it('honors explicit overrides and only infers primary-stat suitability when absent',()=>{
    const trinket={...armor(null),inventoryType:12,subclassId:0,primaryStats:['agility' as const],specIds:[250]}
    expect(getItemCompatibility(trinket,character('Death Knight',250)).compatible).toBe(true)
    expect(getItemCompatibility(trinket,character('Death Knight',251)).compatible).toBe(false)
    expect(getItemCompatibility({...trinket,specIds:[]},character('Death Knight',250)).compatible).toBe(false)
  })
})
