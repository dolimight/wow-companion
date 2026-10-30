-- This addon never opens sockets or writes arbitrary files
-- WoW serializes SavedVariables on normal logout or /reload
local _, ns = ...
local frame = CreateFrame("Frame")
local session = tostring(GetServerTime()) .. "-" .. tostring(math.random(100000, 999999))
local sequence = 0
local requestedItems = {}
local upgradeQuotes={}
local quoteCharacter
local slots = { [1]="head", [2]="neck", [3]="shoulder", [5]="chest", [6]="waist", [7]="legs", [8]="feet", [9]="wrist", [10]="hands", [11]="finger1", [12]="finger2", [13]="trinket1", [14]="trinket2", [15]="back", [16]="mainHand", [17]="offHand" }
local regionNames = { [1]="us", [2]="kr", [3]="eu", [4]="tw", [5]="cn" }
local inventoryTypes = { INVTYPE_HEAD=1,INVTYPE_NECK=2,INVTYPE_SHOULDER=3,INVTYPE_BODY=4,INVTYPE_CHEST=5,INVTYPE_WAIST=6,INVTYPE_LEGS=7,INVTYPE_FEET=8,INVTYPE_WRIST=9,INVTYPE_HAND=10,INVTYPE_FINGER=11,INVTYPE_TRINKET=12,INVTYPE_WEAPON=13,INVTYPE_SHIELD=14,INVTYPE_RANGED=15,INVTYPE_CLOAK=16,INVTYPE_2HWEAPON=17,INVTYPE_TABARD=19,INVTYPE_ROBE=20,INVTYPE_WEAPONMAINHAND=21,INVTYPE_WEAPONOFFHAND=22,INVTYPE_HOLDABLE=23,INVTYPE_RANGEDRIGHT=26 }
local function variantFields(link)
  if not link then return nil,nil end
  local payload=link:match("item:([^|]+)")
  if not payload then return nil,nil end
  local fields={}
  for field in (payload..":"):gmatch("(.-):") do table.insert(fields,field) end
  local count=tonumber(fields[13])
  local bonuses
  if count and count>=0 and count<=128 and #fields>=13+count then
    bonuses={}
    for index=1,count do local id=tonumber(fields[13+index]);if not id then return nil,nil end;table.insert(bonuses,id) end
  end
  local gems
  if #fields>=6 then gems={};for index=3,6 do table.insert(gems,tonumber(fields[index]) or 0) end end
  return bonuses,gems
end
local function observedCurrencies()
  if not (C_CurrencyInfo and C_CurrencyInfo.GetCurrencyListSize and C_CurrencyInfo.GetCurrencyListLink and C_CurrencyInfo.GetCurrencyInfo) then return nil end
  local ok,count=pcall(C_CurrencyInfo.GetCurrencyListSize)
  if not ok or type(count)~="number" or (issecretvalue and issecretvalue(count)) then return nil end
  local result={}
  for index=1,math.min(count,1000) do
    local read,link=pcall(C_CurrencyInfo.GetCurrencyListLink,index)
    local id=read and type(link)=="string" and not (issecretvalue and issecretvalue(link)) and tonumber(link:match("currency:(%d+)"))
    if id then local found,info=pcall(C_CurrencyInfo.GetCurrencyInfo,id);if found and info and type(info.quantity)=="number" and not (issecretvalue and issecretvalue(info.quantity)) and info.quantity>=0 then result[tostring(id)]=info.quantity end end
  end
  if GetMoney then local ok,amount=pcall(GetMoney);if ok and type(amount)=="number" and not (issecretvalue and issecretvalue(amount)) and amount>=0 then result.money=amount end end
  -- Upgrade-vendor quotes may reference currencies hidden from the currency panel
  for _,quote in pairs(upgradeQuotes) do for _,level in ipairs(quote.levels or {}) do
    for _,cost in ipairs(level.currencies or {}) do local ok,info=pcall(C_CurrencyInfo.GetCurrencyInfo,tonumber(cost.currencyId));if ok and info and type(info.quantity)=="number" and not (issecretvalue and issecretvalue(info.quantity)) and info.quantity>=0 then result[cost.currencyId]=info.quantity end end
    for _,cost in ipairs(level.items or {}) do if C_Item and C_Item.GetItemCount then local ok,quantity=pcall(C_Item.GetItemCount,cost.itemId,false,false,false,false);if ok and type(quantity)=="number" and not (issecretvalue and issecretvalue(quantity)) and quantity>=0 then result["item:"..cost.itemId]=quantity end end end
  end end
  return result
end
local function timestamp() return date("!%Y-%m-%dT%H:%M:%SZ", GetServerTime()) end
local function isoIn(seconds) if not seconds or seconds <= 0 then return nil end return date("!%Y-%m-%dT%H:%M:%SZ", GetServerTime() + seconds) end
-- Weekly progress is read from the game's own Great Vault, saved-instance, and keystone APIs; each call is optional
local function weekly()
  local result = { vault = {}, lockouts = {}, runs = {} }
  if C_DateAndTime and C_DateAndTime.GetSecondsUntilWeeklyReset then result.weeklyResetAt = isoIn(C_DateAndTime.GetSecondsUntilWeeklyReset()) end
  if C_DateAndTime and C_DateAndTime.GetSecondsUntilDailyReset then result.dailyResetAt = isoIn(C_DateAndTime.GetSecondsUntilDailyReset()) end
  local types = Enum and Enum.WeeklyRewardChestThresholdType
  if types and C_WeeklyRewards and C_WeeklyRewards.GetActivities then
    local kinds = {}
    if types.Activities then kinds[types.Activities] = "dungeon" end
    if types.Raid then kinds[types.Raid] = "raid" end
    if types.World then kinds[types.World] = "world" end
    local ok, activities = pcall(C_WeeklyRewards.GetActivities)
    if ok and activities then
      for _, activity in ipairs(activities) do
        local kind = kinds[activity.type]
        if kind and activity.threshold then table.insert(result.vault, { kind=kind, index=activity.index, threshold=activity.threshold, progress=activity.progress or 0, level=activity.level }) end
      end
    end
  end
  if GetNumSavedInstances and GetSavedInstanceInfo then
    for index = 1, GetNumSavedInstances() do
      local name, _, reset, _, locked, extended, _, isRaid, _, difficultyName, numEncounters, encounterProgress = GetSavedInstanceInfo(index)
      if name and (locked or extended) and reset and reset > 0 then table.insert(result.lockouts, { name=name, difficulty=difficultyName or "", killed=encounterProgress or 0, total=numEncounters or 0, raid=isRaid and true or false }) end
    end
  end
  if C_MythicPlus and C_MythicPlus.GetRunHistory then
    local ok, runs = pcall(C_MythicPlus.GetRunHistory, false, true)
    if ok and runs then
      for _, run in ipairs(runs) do
        if run.thisWeek ~= false then
          local mapName = C_ChallengeMode and C_ChallengeMode.GetMapUIInfo and C_ChallengeMode.GetMapUIInfo(run.mapChallengeModeID)
          table.insert(result.runs, { dungeon=mapName or ("Dungeon " .. tostring(run.mapChallengeModeID)), level=run.level or 0, timed=run.completed and true or false })
        end
      end
    end
  end
  return result
end
local function talentLoadout()
  if not (C_ClassTalents and C_ClassTalents.GetActiveConfigID and C_Traits and C_Traits.GenerateImportString) then return nil end
  local configId = C_ClassTalents.GetActiveConfigID()
  if not configId then return nil end
  local ok, text = pcall(C_Traits.GenerateImportString, configId)
  return ok and type(text) == "string" and text ~= "" and text or nil
end
-- Read-only inventory observations; unavailable bank/Vault APIs never mean an empty location
-- API contracts: Blizzard_APIDocumentationGenerated/{Container,Bank,Item,WeeklyRewards}Documentation.lua
local bankOpen=false
local equipSlots={INVTYPE_HEAD="head",INVTYPE_NECK="neck",INVTYPE_SHOULDER="shoulder",INVTYPE_CHEST="chest",INVTYPE_ROBE="chest",INVTYPE_WAIST="waist",INVTYPE_LEGS="legs",INVTYPE_FEET="feet",INVTYPE_WRIST="wrist",INVTYPE_HAND="hands",INVTYPE_FINGER="finger1",INVTYPE_TRINKET="trinket1",INVTYPE_WEAPON="mainHand",INVTYPE_SHIELD="offHand",INVTYPE_RANGED="mainHand",INVTYPE_CLOAK="back",INVTYPE_2HWEAPON="mainHand",INVTYPE_WEAPONMAINHAND="mainHand",INVTYPE_WEAPONOFFHAND="offHand",INVTYPE_HOLDABLE="offHand",INVTYPE_RANGEDRIGHT="mainHand"}
local function readable(value) return not (issecretvalue and issecretvalue(value)) end
local function read(fn,...)
  if type(fn)~="function" then return nil end
  local ok,value=pcall(fn,...)
  if ok and readable(value) then return value end
end
local function prepareQuotes()
  local guid=UnitGUID("player")
  if quoteCharacter==guid then return end
  quoteCharacter=guid;upgradeQuotes={}
  local previous=WoWCompanionDB and WoWCompanionDB.characters and WoWCompanionDB.characters[guid]
  if previous then
    for _,item in ipairs(previous.gear or {}) do if item.itemLink and item.observedUpgrade then upgradeQuotes[item.itemLink]=item.observedUpgrade end end
    for _,observation in ipairs(previous.inventoryObservations or {}) do for _,item in ipairs(observation.items or {}) do if item.itemLink and item.observedUpgrade then upgradeQuotes[item.itemLink]=item.observedUpgrade end end end
  end
end
local function captureUpgradeQuote()
  prepareQuotes()
  if not C_ItemUpgrade then return end
  local link=read(C_ItemUpgrade.GetItemHyperlink)
  local info=read(C_ItemUpgrade.GetItemUpgradeItemInfo)
  if type(link)~="string" or type(info)~="table" or type(info.upgradeLevelInfos)~="table" then return end
  for _,key in ipairs({"currUpgrade","maxUpgrade","minItemLevel","maxItemLevel"}) do if not readable(info[key]) or type(info[key])~="number" then return end end
  if not readable(info.itemUpgradeable) or type(info.itemUpgradeable)~="boolean" then return end
  local version,build=GetBuildInfo()
  local quote={observedAt=timestamp(),gameBuild=tostring(version).."."..tostring(build),currentRank=info.currUpgrade,maxRank=info.maxUpgrade,minItemLevel=info.minItemLevel,maxItemLevel=info.maxItemLevel,upgradeable=info.itemUpgradeable,levels={}}
  for _,level in ipairs(info.upgradeLevelInfos) do
    if not readable(level.upgradeLevel) or not readable(level.itemLevelIncrement) or type(level.upgradeLevel)~="number" or type(level.itemLevelIncrement)~="number" or type(level.currencyCostsToUpgrade)~="table" or type(level.itemCostsToUpgrade)~="table" then return end
    local entry={rank=level.upgradeLevel,itemLevelIncrement=level.itemLevelIncrement,currencies={},items={},moneyCost=readable(level.moneyCost) and level.moneyCost or nil,failureMessage=readable(level.failureMessage) and level.failureMessage or nil}
    for _,cost in ipairs(level.currencyCostsToUpgrade) do
      if not readable(cost.currencyID) or not readable(cost.cost) or type(cost.currencyID)~="number" or type(cost.cost)~="number" then return end
      table.insert(entry.currencies,{currencyId=tostring(cost.currencyID),amount=cost.cost})
    end
    for _,cost in ipairs(level.itemCostsToUpgrade) do
      if not readable(cost.itemID) or not readable(cost.cost) or type(cost.itemID)~="number" or type(cost.cost)~="number" then return end
      table.insert(entry.items,{itemId=cost.itemID,amount=cost.cost})
    end
    table.insert(quote.levels,entry)
  end
  upgradeQuotes[link]=quote
end
local function inventoryItem(link,key,location)
  if type(link)~="string" or not readable(link) then return nil,false end
  local itemId=tonumber(link:match("item:(%d+)"))
  local instant=C_Item and C_Item.GetItemInfoInstant or GetItemInfoInstant
  if not itemId or type(instant)~="function" then return nil,false end
  local ok,_,_,_,equipLoc,_,classId,subclassId=pcall(instant,link)
  if not ok or not readable(equipLoc) or not equipSlots[equipLoc] then return nil,ok and readable(equipLoc) end
  local name=read(C_Item and C_Item.GetItemNameByID,itemId)
  local level=read(C_Item and C_Item.GetDetailedItemLevelInfo,link)
  local bonusIds,gemIds=variantFields(link)
  local enchantId=tonumber(link:match("item:%d+:(%d+):"))
  local instanceId=location and read(C_Item and C_Item.GetItemGUID,location) or nil
  local gems={}
  if C_Item and C_Item.GetItemGem then for socket=1,4 do local gem=read(C_Item.GetItemGem,link,socket);if type(gem)=="string" then table.insert(gems,gem) end end end
  return {slot=equipSlots[equipLoc],itemId=itemId,name=type(name)=="string" and name or ("Item "..itemId),itemLevel=type(level)=="number" and level or nil,itemLink=link,bonusIds=bonusIds,gemIds=gemIds,enchantId=enchantId,enchant=enchantId and enchantId~=0 and ("Enchant #"..enchantId) or nil,gems=gems,gemsCoverage=gemIds and "complete" or "unknown",enchantCoverage=enchantId and "complete" or "unknown",inventoryType=inventoryTypes[equipLoc],classId=readable(classId) and classId or nil,subclassId=readable(subclassId) and subclassId or nil,instanceId=type(instanceId)=="string" and instanceId or nil,locationKey=key,variantCoverage="partial",observedUpgrade=upgradeQuotes[link]},name~=nil and level~=nil
end
local function containers(location,bagIds,observedAt)
  if not (C_Container and C_Container.GetContainerNumSlots and C_Container.GetContainerItemLink and C_Container.GetContainerItemID) then return {location=location,coverage="unknown",items={}} end
  local result={location=location,coverage="complete",observedAt=observedAt,items={}}
  for _,bag in ipairs(bagIds) do
    local count=read(C_Container.GetContainerNumSlots,bag)
    if type(count)~="number" or count<0 or count>200 then result.coverage="partial"
    else
      if location=="bags" and bag==0 and count==0 then result.coverage="partial" end
      for slot=1,count do
        local ok,id=pcall(C_Container.GetContainerItemID,bag,slot)
        if not ok or not readable(id) then result.coverage="partial"
        elseif type(id)=="number" and id>0 then
          local link=read(C_Container.GetContainerItemLink,bag,slot)
          local itemLocation=ItemLocation and ItemLocation.CreateFromBagAndSlot and read(ItemLocation.CreateFromBagAndSlot,ItemLocation,bag,slot)
          local item,complete=inventoryItem(link,location..":"..bag..":"..slot,itemLocation)
          if item then table.insert(result.items,item) end
          if not complete then result.coverage="partial" end
        elseif id~=nil then result.coverage="partial" end
      end
    end
  end
  return result
end
local function inventoryObservations(gear,gearCoverage,observedAt,resetAt)
  local result={{location="equipped",coverage=gearCoverage,observedAt=observedAt,items=gear}}
  local bagIds={}
  local lastBag=NUM_TOTAL_EQUIPPED_BAG_SLOTS or NUM_BAG_SLOTS or 4
  for id=0,math.min(lastBag,10) do table.insert(bagIds,id) end
  table.insert(result,containers("bags",bagIds,observedAt))
  local bank={location="bank",coverage="unknown",items={}}
  if bankOpen then
    local bankType=Enum and Enum.BankType and Enum.BankType.Character
    local ids=bankType and read(C_Bank and C_Bank.FetchPurchasedBankTabIDs,bankType)
    if type(ids)=="table" and read(C_Bank and C_Bank.CanViewBank,bankType) then bank=containers("bank",ids,observedAt)
    elseif not (C_Bank and C_Bank.FetchPurchasedBankTabIDs) then
      local ids={Enum and Enum.BagIndex and Enum.BagIndex.Bank or -1}
      for id=(NUM_BAG_SLOTS or 4)+1,(NUM_BAG_SLOTS or 4)+(NUM_BANKBAGSLOTS or 7) do table.insert(ids,id) end
      bank=containers("bank",ids,observedAt)
    end
  end
  table.insert(result,bank)
  local vault={location="vault",coverage="unknown",items={}}
  if C_WeeklyRewards and read(C_WeeklyRewards.HasInteraction) and read(C_WeeklyRewards.HasGeneratedRewards) and read(C_WeeklyRewards.CanClaimRewards) then
    local activities=read(C_WeeklyRewards.GetActivities)
    if type(activities)=="table" then
      vault.coverage="complete";vault.observedAt=observedAt;vault.choiceGroup="vault:"..tostring(resetAt or observedAt)
      for _,activity in ipairs(activities) do
        for _,reward in ipairs(type(activity.rewards)=="table" and activity.rewards or {}) do
          if readable(reward.itemDBID) and reward.itemDBID then
            local link=read(C_WeeklyRewards.GetItemHyperlink,reward.itemDBID)
            local item,complete=inventoryItem(link,"vault:"..tostring(reward.itemDBID))
            if item then item.instanceId="vault-choice:"..tostring(reward.itemDBID);item.vaultChoiceGroup=vault.choiceGroup;table.insert(vault.items,item) end
            if not complete then vault.coverage="partial" end
          end
        end
      end
    end
  end
  table.insert(result,vault)
  -- Keep old real bank/Vault observations in the addon too, including their original timestamps
  local previous=WoWCompanionDB.characters[UnitGUID("player")]
  for index,entry in ipairs(result) do if entry.coverage=="unknown" and previous and previous.inventoryObservations then for _,old in ipairs(previous.inventoryObservations) do if old.location==entry.location then result[index]=old;break end end end end
  return result
end
local function snapshot()
  if not WoWCompanionDB or not UnitGUID("player") then return end
  prepareQuotes()
  local className = UnitClass("player")
  local raceName, _, raceId = UnitRace("player")
  local specId, specName
  if GetSpecialization and GetSpecialization() then specId, specName = GetSpecializationInfo(GetSpecialization()) end
  local _, equipped = GetAverageItemLevel()
  local gear = {}
  local gearCoverage = "complete"
  for inventorySlot, slot in pairs(slots) do
    local itemId = GetInventoryItemID("player", inventorySlot)
    local link = GetInventoryItemLink("player", inventorySlot)
    if itemId then
      local name = C_Item and C_Item.GetItemNameByID and C_Item.GetItemNameByID(itemId)
      local itemLevel = link and C_Item and C_Item.GetDetailedItemLevelInfo and C_Item.GetDetailedItemLevelInfo(link) or nil
      if not name or not itemLevel then gearCoverage="partial";if C_Item and C_Item.RequestLoadItemDataByID and not requestedItems[itemId] then requestedItems[itemId]=true;C_Item.RequestLoadItemDataByID(itemId) end end
      local gems = {}
      if link and C_Item and C_Item.GetItemGem then
        for socket=1,4 do
          local gemName = C_Item.GetItemGem(link, socket)
          if gemName then table.insert(gems, gemName) end
        end
      end
      -- Raw enchant IDs are retained without claiming a localized enchant name
      local enchantId = link and link:match("item:%d+:(%d+):")
      local bonusIds,gemIds=variantFields(link)
      local inventoryType,classId,subclassId
      local instant=C_Item and C_Item.GetItemInfoInstant or GetItemInfoInstant
      if instant then local ok,_,_,_,equipLoc,_,class,subclass=pcall(instant,link or itemId);if ok then inventoryType=inventoryTypes[equipLoc];classId=class;subclassId=subclass end end
      table.insert(gear, {slot=slot, itemId=itemId, name=name or ("Item " .. itemId), itemLevel=itemLevel, gems=gems, gemsCoverage=link and C_Item and C_Item.GetItemGem and "complete" or "unknown", enchantCoverage=enchantId and "complete" or "unknown", enchant=enchantId and enchantId~="0" and ("Enchant #"..enchantId) or nil, itemLink=link,bonusIds=bonusIds,gemIds=gemIds,enchantId=tonumber(enchantId),inventoryType=inventoryType,classId=classId,subclassId=subclassId,variantCoverage="partial"})
    end
  end
  -- No item IDs cannot distinguish unequipped gear from unavailable inventory APIs
  -- Keep the previous observation intact, or wait for a usable first capture
  if #gear == 0 then return end
  for _,item in ipairs(gear) do item.observedUpgrade=upgradeQuotes[item.itemLink] end
  sequence = sequence + 1
  local guid = UnitGUID("player")
  local version,build=GetBuildInfo()
  local clientBuild=version and build and (tostring(version).."."..tostring(build)) or tostring(build or "unknown")
  local observedAt = timestamp()
  local weeklyData=weekly()
  local observedInventory=inventoryObservations(gear,gearCoverage,observedAt,weeklyData.weeklyResetAt)
  local collection=ns and ns.CaptureCollectionObservation and read(ns.CaptureCollectionObservation) or nil
  if type(collection)~="table" then collection={collectionCoverage="unknown",collectedAppearanceIds={}} end
  if collection.collectionCoverage~="unknown" then collection.collectionScopeId="addon:"..WoWCompanionDB.sourceProfileId end
  local previous=WoWCompanionDB.characters[guid]
  if collection.collectionCoverage=="unknown" and previous and previous.collectionCoverage~="unknown" then collection={collectionCoverage=previous.collectionCoverage,collectedAppearanceIds=previous.collectedAppearanceIds,collectionScopeId=previous.collectionScopeId,collectionObservedAt=previous.collectionObservedAt} end
  WoWCompanionDB.exportedAt = observedAt
  WoWCompanionDB.characters[guid] = { guid=guid, region=regionNames[GetCurrentRegion()] or "unknown", realm=GetRealmName(), name=UnitName("player"), className=className or "Unknown", raceName=raceName or "Unknown", raceId=raceId, level=UnitLevel("player"), specId=specId, specName=specName or "Unknown", observedAt=observedAt, sessionId=session, sequence=sequence, itemLevel=equipped, gear=gear, gearCoverage=gearCoverage, inventoryObservations=observedInventory, progressionResources={currencies=observedCurrencies(),discountCoverage="unknown",observedAt=observedAt}, customizationCoverage="unknown", gameBuild=clientBuild, customization={}, collectionCoverage="unknown", collectedAppearanceIds={}, weekly=weeklyData, talentLoadout=talentLoadout() }
  local saved=WoWCompanionDB.characters[guid]
  saved.collectionCoverage=collection.collectionCoverage;saved.collectedAppearanceIds=collection.collectedAppearanceIds;saved.collectionScopeId=collection.collectionScopeId;saved.collectionObservedAt=collection.collectionObservedAt
end
local function escape(value) return '"' .. value:gsub('[%z\1-\31\\"]', function(c) local map={['"']='\\"',['\\']='\\\\',['\n']='\\n',['\r']='\\r',['\t']='\\t'} return map[c] or string.format('\\u%04x', string.byte(c)) end) .. '"' end
local arrayKeys = {gear=true,inventoryObservations=true,items=true,levels=true,gems=true,bonusIds=true,gemIds=true,specIds=true,primaryStats=true,uniqueGroups=true,restrictionGroups=true,customization=true,collectedAppearanceIds=true,vault=true,lockouts=true,runs=true}
local function json(value, key, ownerKey)
  local kind=type(value)
  if kind=="nil" then return "null" end
  if kind=="boolean" or kind=="number" then return tostring(value) end
  if kind=="string" then return escape(value) end
  if kind~="table" then return "null" end
  local result={}
  if arrayKeys[key] or (key=="currencies" and ownerKey=="levels") then for _,v in ipairs(value) do table.insert(result,json(v,nil,key)) end return "["..table.concat(result,",").."]" end
  for k,v in pairs(value) do table.insert(result,escape(tostring(k))..":"..json(v,k,key or ownerKey)) end
  return "{"..table.concat(result,",").."}"
end
local exportFrame
local function showExport()
  snapshot()
  if not exportFrame then
    exportFrame=CreateFrame("Frame", "WoWCompanionExport", UIParent, "BackdropTemplate")
    exportFrame:SetSize(650,420);exportFrame:SetPoint("CENTER");exportFrame:SetFrameStrata("DIALOG")
    exportFrame:SetBackdrop({bgFile="Interface/Tooltips/UI-Tooltip-Background",edgeFile="Interface/Tooltips/UI-Tooltip-Border",tile=true,tileSize=16,edgeSize=16,insets={left=4,right=4,top=4,bottom=4}});exportFrame:SetBackdropColor(0.05,0.05,0.07,1)
    local title=exportFrame:CreateFontString(nil,"OVERLAY","GameFontNormalLarge");title:SetPoint("TOPLEFT",20,-18);title:SetText("WOW Companion — Ctrl+C to copy, then paste in the app")
    local close=CreateFrame("Button",nil,exportFrame,"UIPanelCloseButton");close:SetPoint("TOPRIGHT")
    local scroll=CreateFrame("ScrollFrame",nil,exportFrame,"UIPanelScrollFrameTemplate");scroll:SetPoint("TOPLEFT",20,-55);scroll:SetPoint("BOTTOMRIGHT",-40,20)
    local edit=CreateFrame("EditBox",nil,scroll);edit:SetMultiLine(true);edit:SetFontObject(ChatFontNormal);edit:SetWidth(580);edit:SetAutoFocus(true);edit:SetScript("OnEscapePressed",function() exportFrame:Hide() end);scroll:SetScrollChild(edit);exportFrame.edit=edit
  end
  exportFrame:Show();exportFrame.edit:SetText(json(WoWCompanionDB));exportFrame.edit:HighlightText();exportFrame.edit:SetFocus()
end
frame:RegisterEvent("ADDON_LOADED");frame:RegisterEvent("PLAYER_LOGIN");frame:RegisterEvent("PLAYER_EQUIPMENT_CHANGED");frame:RegisterEvent("PLAYER_SPECIALIZATION_CHANGED");frame:RegisterEvent("PLAYER_LOGOUT");frame:RegisterEvent("ITEM_DATA_LOAD_RESULT");frame:RegisterEvent("WEEKLY_REWARDS_UPDATE");frame:RegisterEvent("UPDATE_INSTANCE_INFO");frame:RegisterEvent("CHALLENGE_MODE_COMPLETED");frame:RegisterEvent("TRAIT_CONFIG_UPDATED")
frame:RegisterEvent("BAG_UPDATE_DELAYED");frame:RegisterEvent("BANKFRAME_OPENED");frame:RegisterEvent("BANKFRAME_CLOSED");frame:RegisterEvent("WEEKLY_REWARDS_ITEM_CHANGED")
frame:RegisterEvent("ITEM_UPGRADE_MASTER_SET_ITEM");frame:RegisterEvent("ITEM_UPGRADE_MASTER_UPDATE")
local pending=false
frame:SetScript("OnEvent",function(_,event,name)
  if event=="BANKFRAME_OPENED" then bankOpen=true elseif event=="BANKFRAME_CLOSED" then bankOpen=false end
  if event=="ITEM_UPGRADE_MASTER_SET_ITEM" or event=="ITEM_UPGRADE_MASTER_UPDATE" then captureUpgradeQuote() end
  if event=="ADDON_LOADED" then
    if name~="WoWCompanion" then return end
    if not WoWCompanionDB or WoWCompanionDB.schemaVersion~=1 then WoWCompanionDB={schemaVersion=1,addonVersion="0.4.2",sourceProfileId="local-"..tostring(GetServerTime()).."-"..tostring(math.random(100000,999999)),exportedAt=timestamp(),characters={}} end
    WoWCompanionDB.addonVersion="0.4.2"
  elseif event=="PLAYER_LOGIN" then
    -- Ask the server for lockouts, vault, and keystone history so the next snapshot can include them
    if RequestRaidInfo then RequestRaidInfo() end
    if C_MythicPlus and C_MythicPlus.RequestMapInfo then C_MythicPlus.RequestMapInfo() end
    if not pending then pending=true;C_Timer.After(2,function() pending=false;snapshot() end) end
  elseif event=="PLAYER_LOGOUT" then snapshot()
  elseif not pending then pending=true;C_Timer.After(0.5,function() pending=false;snapshot() end) end
end)
SLASH_WOWCOMPANION1="/wowcompanion"
-- "/wowcompanion mount" is handled by MountPreview.lua; anything else opens the export
SlashCmdList.WOWCOMPANION=function(message) if ns and ns.command and ns.command(message) then return end showExport() end


