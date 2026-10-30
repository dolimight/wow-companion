-- Run from the workspace root with Lua/Fengari; no installed game data is read
local event
local now=1793275200
local vaultVisible=true
WoWCompanionDB=nil
CreateFrame=function()return {RegisterEvent=function()end,SetScript=function(_,_,fn)event=fn end}end
GetServerTime=function()return now end
date=function()return '2026-10-29T12:00:'..string.format('%02d',now-1793275200)..'Z' end
UnitGUID=function()return 'Player-fixture' end
UnitClass=function()return 'Mage' end
UnitRace=function()return 'Human','Human',1 end
GetAverageItemLevel=function()return 100,100 end
local weapon='|Hitem:42:0:0:0:0:0:0:0:90:62:0:16:1:123|h[Weapon]|h'
local ring='|Hitem:43:0:0:0:0:0:0:0:90:62:0:16:1:456|h[Ring]|h'
GetInventoryItemID=function(_,slot)return slot==16 and 42 or nil end
GetInventoryItemLink=function(_,slot)return slot==16 and weapon or nil end
GetCurrentRegion=function()return 1 end
GetRealmName=function()return 'One' end
UnitName=function()return 'Fixture' end
UnitLevel=function()return 90 end
GetBuildInfo=function()return '12.1.5','70575' end
GetMoney=function()return 12345 end
C_Item={GetItemNameByID=function(id)return id==42 and 'Weapon' or 'Ring' end,GetDetailedItemLevelInfo=function()return 100 end,GetItemInfoInstant=function(link)local id=tonumber(link:match('item:(%d+)'));return id,'Weapon','Sword',id==42 and 'INVTYPE_2HWEAPON' or 'INVTYPE_FINGER',1,2,8 end,GetItemGUID=function(location)return 'Item-'..location.bag..'-'..location.slot end,GetItemCount=function()return 7 end}
ItemLocation={CreateFromBagAndSlot=function(_,bag,slot)return {bag=bag,slot=slot}end}
NUM_TOTAL_EQUIPPED_BAG_SLOTS=1
C_Container={GetContainerNumSlots=function(bag)return (bag==0 and 2) or (bag==6 and 1) or 0 end,GetContainerItemID=function(bag,slot)return (bag==0 or bag==6) and 43 or nil end,GetContainerItemLink=function()return ring end}
Enum={BankType={Character=0}}
C_Bank={CanViewBank=function()return true end,FetchPurchasedBankTabIDs=function()return {6}end}
C_WeeklyRewards={HasInteraction=function()return vaultVisible end,HasGeneratedRewards=function()return true end,CanClaimRewards=function()return true end,GetActivities=function()return {{rewards={{itemDBID=111},{itemDBID=222}}}}end,GetItemHyperlink=function()return ring end}
C_CurrencyInfo={GetCurrencyListSize=function()return 0 end,GetCurrencyListLink=function()end,GetCurrencyInfo=function()return {quantity=20}end}
C_Timer={After=function(_,fn)fn()end}
SlashCmdList={}
local collection={collectionCoverage='partial',collectedAppearanceIds={777},collectionObservedAt='2026-10-29T11:00:00Z'}
assert(loadfile('addon/WoWCompanion.lua'))('WoWCompanion',{CaptureCollectionObservation=function()return collection end})
event(nil,'ADDON_LOADED','WoWCompanion')
event(nil,'PLAYER_LOGOUT')
local function current()return WoWCompanionDB.characters['Player-fixture']end
local function observation(location)for _,value in ipairs(current().inventoryObservations)do if value.location==location then return value end end end
local bags=observation('bags')
assert(bags.coverage=='complete' and #bags.items==2,'bag duplicates were lost')
assert(bags.items[1].instanceId~=bags.items[2].instanceId,'item instance identities collapsed')
assert(bags.items[1].bonusIds[1]==456 and bags.items[1].itemLink==ring,'exact bag variant lost')
assert(observation('bank').coverage=='unknown','closed bank claimed observed empty')
assert(#observation('vault').items==2 and observation('vault').items[1].vaultChoiceGroup==observation('vault').items[2].vaultChoiceGroup,'Vault choices not mutually exclusive')
assert(current().collectionObservedAt==collection.collectionObservedAt and current().collectionScopeId=='addon:'..WoWCompanionDB.sourceProfileId,'collection source/time lost')
event(nil,'BANKFRAME_OPENED')
local bank=observation('bank')
assert(bank.coverage=='complete' and #bank.items==1,'viewed bank not captured')
now=now+1;vaultVisible=false;event(nil,'BANKFRAME_CLOSED')
assert(observation('bank').observedAt==bank.observedAt,'closing bank freshened old data')
assert(#observation('vault').items==2,'closing Vault erased known choices')
local upgradeInfo={currUpgrade=1,maxUpgrade=2,minItemLevel=100,maxItemLevel=104,itemUpgradeable=true,upgradeLevelInfos={{upgradeLevel=2,itemLevelIncrement=4,currencyCostsToUpgrade={{currencyID=999,cost=10}},itemCostsToUpgrade={{itemID=888,cost=2}},moneyCost=100}}}
C_ItemUpgrade={GetItemHyperlink=function()return weapon end,GetItemUpgradeItemInfo=function()return upgradeInfo end}
event(nil,'ITEM_UPGRADE_MASTER_SET_ITEM')
local quote=current().gear[1].observedUpgrade
assert(quote and quote.currentRank==1 and quote.maxRank==2 and quote.gameBuild=='12.1.5.70575','vendor quote not captured')
assert(quote.levels[1].currencies[1].amount==10 and quote.levels[1].items[1].itemId==888 and quote.levels[1].moneyCost==100,'vendor cost components lost')
assert(current().progressionResources.currencies.money==12345 and current().progressionResources.currencies['999']==20 and current().progressionResources.currencies['item:888']==7,'cost balances missing')
C_ItemUpgrade=nil;now=now+1;event(nil,'BAG_UPDATE_DELAYED')
assert(current().gear[1].observedUpgrade.observedAt==quote.observedAt,'gear refresh freshened old vendor quote')
print('PASS observed bags, bank retention, mutually exclusive Vault alternatives, collection time, and exact vendor quote capture')
