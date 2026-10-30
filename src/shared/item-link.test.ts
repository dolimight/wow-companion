import { describe,expect,it } from 'vite-plus/test'
import { itemLinkVariant } from './item-link'
describe('observed item variants',()=>{
  it('keeps bonus, enchant and socket IDs without confusing instance fields',()=>{
    expect(itemLinkVariant('|cffa335ee|Hitem:42:777:11:0:22:0:0:0:90:250:0:16:2:123:456:0|h[Item]|h|r')).toEqual({enchantId:777,gemIds:[11,0,22,0],bonusIds:[123,456]})
  })
  it('distinguishes an observed empty bonus list from incomplete or malformed links',()=>{
    expect(itemLinkVariant('item:42:0:0:0:0:0:0:0:90:250:0:16:0').bonusIds).toEqual([])
    expect(itemLinkVariant('item:42').bonusIds).toBeNull()
    expect(itemLinkVariant('item:42:0:0:0:0:0:0:0:90:250:0:16:3:123').bonusIds).toBeNull()
    expect(itemLinkVariant('item:42:0:0:0:0:0:0:0:90:250:0:16:999999').bonusIds).toBeNull()
    expect(itemLinkVariant(null)).toEqual({bonusIds:null,enchantId:null,gemIds:null})
  })
})
