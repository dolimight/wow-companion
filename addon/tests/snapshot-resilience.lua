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
C_CurrencyInfo={GetCurrencyListSize=function()return 2 end,GetCurrencyListLink=function(index)return index==1 and '|Hcurrency:999:0|h[Fixture crest]|h' or nil end,GetCurrencyInfo=function(id)return {quantity=id==3446 and 7 or 20} end}
C_Timer={After=function(_,fn)fn()end}
C_ChallengeMode={GetOverallDungeonScore=function()return 2475.5 end,GetMapTable=function()return {501,502,503} end,GetMapUIInfo=function(id)if id==503 then return nil end return id==501 and 'Fixture Halls' or 'Fixture Vault',id,1800 end}
C_MythicPlus={GetCurrentSeason=function()return 17 end,GetSeasonBestForMap=function(id)if id==501 then return {level=12,durationSec=1500},{level=13,durationSec=1950} end return nil,{level=9,durationSec=2000} end}
SlashCmdList={}
-- Newer clients return the slot's visual info as one table; comparing it with a number used to abort the whole snapshot
Enum={TransmogType={Appearance=0},TransmogModification={Main=0}}
TransmogUtil={GetTransmogLocation=function(slotId)return {slot=slotId} end}
C_Transmog={GetSlotVisualInfo=function(location)return {baseSourceID=100+location.slot,appliedSourceID=location.slot==1 and 555 or 0} end}
C_TransmogCollection={GetSourceInfo=function(source)return {itemID=source*10,name='Look '..source} end}
-- A capture that throws must leave its field empty and record why, not lose the character
C_Traits={GenerateImportString=function()return 'LOADOUT' end}
C_ClassTalents={GetActiveConfigID=function()error('talent config unavailable')end}
assert(loadfile('addon/WoWCompanion.lua'))()
event(nil,'ADDON_LOADED','WoWCompanion')
event(nil,'PLAYER_LOGOUT')
local character=WoWCompanionDB.characters['Player-fixture']
assert(character,'snapshot lost when an optional capture failed')
assert(character.progressionResources.currencies['3446']==7 and character.progressionResources.currencies['3443']==20,'crest balances missing from the snapshot')
assert(character.shownLook and character.shownLook.slots.head.modifiedAppearanceId==555,'applied appearance not read from the table form')
assert(character.shownLook.slots.shoulder.modifiedAppearanceId==103,'base appearance not used when nothing is applied')
assert(character.shownLook.slots.head.itemId==5550,'appearance item not read')
assert(character.talentLoadout==nil and WoWCompanionDB.captureErrors and WoWCompanionDB.captureErrors.talentLoadout:find('talent config unavailable'),'failed capture not recorded')
assert(character.mythicPlus.score==2475.5,'captures after a failure must still run')
print('PASS snapshot survives table-shaped transmog info and a failing capture, and keeps crest balances')

-- A later healthy snapshot clears diagnostics and still supports the older tuple return
C_ClassTalents.GetActiveConfigID=function()return 1 end
C_Transmog.GetSlotVisualInfo=function(location)return 100+location.slot,200,location.slot==1 and 555 or 0 end
event(nil,'PLAYER_LOGOUT')
character=WoWCompanionDB.characters['Player-fixture']
assert(character.talentLoadout=='LOADOUT' and WoWCompanionDB.captureErrors==nil,'capture failure did not recover')
assert(character.shownLook.slots.head.modifiedAppearanceId==555 and character.shownLook.slots.shoulder.modifiedAppearanceId==103,'legacy visual return lost')

C_Transmog.GetSlotVisualInfo=function()error('visual unavailable')end
event(nil,'PLAYER_LOGOUT')
character=WoWCompanionDB.characters['Player-fixture']
assert(character.progressionResources.currencies['3443']==20,'a failing appearance capture lost currency data')
assert(character.shownLook==nil,'failed appearance capture must remain unknown')
