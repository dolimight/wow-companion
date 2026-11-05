local event
WoWCompanionDB=nil
CreateFrame=function() return {RegisterEvent=function() end,SetScript=function(_,_,fn)event=fn end} end
GetServerTime=function() return 1793102400 end
date=function()return '2026-10-27T12:00:00Z' end
UnitGUID=function()return 'Player-fixture' end
UnitClass=function()return 'Death Knight' end
UnitRace=function()return 'Human','Human',1 end
GetAverageItemLevel=function()return 100,100 end
GetInventoryItemID=function(_,slot)return slot==16 and 42 or nil end
GetInventoryItemLink=function(_,slot)return slot==16 and '|Hitem:42:777:11:0:22:0:0:0:90:250:0:16:2:123:456:0|h[Fixture]|h' or nil end
GetCurrentRegion=function()return 1 end
GetRealmName=function()return 'Fixture Realm' end
UnitName=function()return 'Fixture' end
UnitLevel=function()return 90 end
GetBuildInfo=function()return '12.1.5','70575' end
C_Item={GetItemNameByID=function()return 'Fixture weapon' end,GetDetailedItemLevelInfo=function()return 100 end,GetItemInfoInstant=function()return 42,'Weapon','Sword','INVTYPE_2HWEAPON',1,2,8 end}
C_CurrencyInfo={GetCurrencyListSize=function()return 2 end,GetCurrencyListLink=function(index)return index==1 and '|Hcurrency:999:0|h[Fixture crest]|h' or nil end,GetCurrencyInfo=function()return {quantity=20} end}
C_Timer={After=function(_,fn)fn()end}
C_ChallengeMode={GetOverallDungeonScore=function()return 2475.5 end,GetMapTable=function()return {501,502,503} end,GetMapUIInfo=function(id)if id==503 then return nil end return id==501 and 'Fixture Halls' or 'Fixture Vault',id,1800 end}
C_MythicPlus={GetCurrentSeason=function()return 17 end,GetSeasonBestForMap=function(id)if id==501 then return {level=12,durationSec=1500},{level=13,durationSec=1950} end return nil,{level=9,durationSec=2000} end}
SlashCmdList={}
assert(loadfile('addon/WoWCompanion.lua'))()
event(nil,'ADDON_LOADED','WoWCompanion')
event(nil,'PLAYER_LOGOUT')
local character=WoWCompanionDB.characters['Player-fixture']
assert(character.gameBuild=='12.1.5.70575','full game build missing')
local item=character.gear[1]
assert(item.inventoryType==17 and item.classId==2 and item.subclassId==8,'weapon metadata missing')
assert(#item.bonusIds==2 and item.bonusIds[1]==123 and item.bonusIds[2]==456,'bonus identifiers lost')
assert(#item.gemIds==4 and item.gemIds[1]==11 and item.gemIds[3]==22 and item.enchantId==777,'enhancement identifiers lost')
assert(item.variantCoverage=='partial','capture overstated variant certainty')
assert(character.progressionResources.currencies['999']==20,'currency quantity missing')
assert(character.progressionResources.discountCoverage=='unknown','discounts must remain unknown')
assert(character.progressionResources.observedAt==character.observedAt,'resource observation time mismatch')
assert(#character.seasonRuns==2,'season bests should skip dungeons without a name')
local halls=character.seasonRuns[1]
assert(halls.dungeon=='Fixture Halls' and halls.timeLimitSec==1800 and halls.timed.level==12 and halls.timed.durationSec==1500 and halls.overtime.level==13,'season best for a timed dungeon missing')
assert(character.seasonRuns[2].timed==nil and character.seasonRuns[2].overtime.level==9,'overtime-only dungeon misreported')
assert(character.mythicPlus.score==2475.5 and character.mythicPlus.season==17 and character.mythicPlus.observedAt==character.observedAt,'in-game Mythic+ score missing')
print('PASS progression capture preserves variant identifiers, weapon metadata, currency observation, and full build')
