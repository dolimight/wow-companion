-- Manual desktop-to-game outfit intent, never Lua source or automated transmog
-- Protocol: WCO1.<base64url canonical JSON>.<CRC32>; checksum detects corruption only
local _, ns = ...
ns = ns or {}
local MAX_BYTES, MAX_CODE = 65536, 87396
local alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_"
local slots = { head=1,neck=2,shoulder=3,shirt=4,chest=5,waist=6,legs=7,feet=8,wrist=9,hands=10,finger1=11,finger2=12,trinket1=13,trinket2=14,back=15,mainHand=16,offHand=17,tabard=19,shoulderLeft=3,shoulderRight=3 }
local visible = {head=true,shoulder=true,shirt=true,chest=true,waist=true,legs=true,feet=true,wrist=true,hands=true,back=true,mainHand=true,offHand=true,tabard=true}
local function readable(value) return not (issecretvalue and issecretvalue(value)) end
local function positive(value) return readable(value) and type(value)=="number" and value>=1 and value<=2147483647 and value==math.floor(value) end
local function xor(a,b)
  if bit and bit.bxor then return bit.bxor(a,b)%4294967296 end
  if bit32 and bit32.bxor then return bit32.bxor(a,b)%4294967296 end
  local value,power=0,1.0
  for _=1,32 do local left,right=a%2,b%2;if left~=right then value=value+power end;a=math.floor(a/2);b=math.floor(b/2);power=power*2 end
  return value
end
local function crc32(text)
  local crc=4294967295
  for index=1,#text do
    crc=xor(crc,text:byte(index))
    for _=1,8 do local odd=crc%2;crc=math.floor(crc/2);if odd==1 then crc=xor(crc,3988292384) end end
  end
  local value,hex=xor(crc,4294967295),""
  local digits="0123456789abcdef"
  for _=1,8 do local digit=value%16;hex=digits:sub(digit+1,digit+1)..hex;value=math.floor(value/16) end
  return hex
end
local function decode64(text)
  if #text%4==1 or text:find("[^A-Za-z0-9_%-]") then return nil end
  local output,buffer,bits={},0,0
  for index=1,#text do
    local position=alphabet:find(text:sub(index,index),1,true)
    if not position then return nil end
    buffer=buffer*64+position-1;bits=bits+6
    if bits>=8 then bits=bits-8;local power=2^bits;output[#output+1]=string.char(math.floor(buffer/power));buffer=buffer%power end
  end
  if buffer~=0 then return nil end
  return table.concat(output)
end
local function onlyKeys(value,allowed)
  for key in pairs(value) do if not allowed[key] then return false end end
  return true
end
local function arrayLength(value,maximum)
  if type(value)~="table" then return nil end
  local count=0
  for key in pairs(value) do if type(key)~="number" or key<1 or key~=math.floor(key) then return nil end;count=count+1;if count>maximum then return nil end end
  if count~=#value then return nil end
  return count
end
local function nameLength(value)
  if type(value)~="string" then return nil end
  -- JSON has already validated UTF-8; count UTF-16 code units to match the desktop schema
  local count=0
  for index=1,#value do local byte=value:byte(index);if byte<128 or byte>=192 then count=count+(byte>=240 and 2 or 1) end end
  return count
end
local function validate(value)
  if type(value)~="table" or not onlyKeys(value,{schemaVersion=true,name=true,slots=true,hiddenSlots=true,illusionIds=true}) or value.schemaVersion~=1 then return nil,"Unsupported outfit version or fields" end
  local length=nameLength(value.name)
  if not length or length<1 or length>100 then return nil,"Outfit name must contain 1 to 100 characters" end
  if not arrayLength(value.slots,40) or not arrayLength(value.hiddenSlots,40) or type(value.illusionIds)~="table" then return nil,"Invalid outfit slots" end
  local seen={}
  for _,entry in ipairs(value.slots) do
    if type(entry)~="table" or not onlyKeys(entry,{slot=true,appearanceId=true,modifiedAppearanceId=true,itemId=true}) or not slots[entry.slot] or seen[entry.slot] then return nil,"Unknown or duplicate outfit slot" end
    seen[entry.slot]=true
    for _,key in ipairs({"appearanceId","modifiedAppearanceId","itemId"}) do if entry[key]~=nil and not positive(entry[key]) then return nil,"Invalid appearance or item reference" end end
  end
  seen={}
  for _,slot in ipairs(value.hiddenSlots) do if not slots[slot] or seen[slot] then return nil,"Unknown or duplicate hidden slot" end;seen[slot]=true end
  if not onlyKeys(value.illusionIds,{mainHand=true,offHand=true}) then return nil,"Unknown weapon illusion field" end
  for _,value in pairs(value.illusionIds) do if not positive(value) then return nil,"Invalid weapon illusion" end end
  return value
end
local function decode(code)
  if type(code)~="string" or #code>MAX_CODE then return nil,"Outfit code exceeds 64 KiB" end
  code=code:match("^%s*(.-)%s*$")
  local encoded,checksum=code:match("^WCO1%.([A-Za-z0-9_%-]+)%.([a-f0-9]+)$")
  if not encoded or #checksum~=8 then return nil,"Paste a WOW Companion outfit code beginning with WCO1" end
  local json=decode64(encoded)
  if not json or #json>MAX_BYTES then return nil,"Invalid outfit encoding or size" end
  if crc32(json)~=checksum then return nil,"Outfit code is incomplete or corrupted — copy it again" end
  if not (C_EncodingUtil and C_EncodingUtil.DeserializeJSON) then return nil,"This game client cannot decode outfit JSON" end
  local ok,value=pcall(C_EncodingUtil.DeserializeJSON,json)
  if not ok then return nil,"Outfit code is not valid JSON" end
  return validate(value)
end
local function isSuccess(result)
  if result==false then return false end
  local reasons=Enum and Enum.ItemTryOnReason
  if reasons and reasons.Success~=nil and result~=nil then return result==reasons.Success end
  return result==nil or result==0
end
local function dress(model,value)
  local validated,message=validate(value)
  if not validated then return nil,{message} end
  if InCombatLockdown and InCombatLockdown() then return nil,{"Leave combat before previewing this outfit"} end
  if not (model and model.Undress and model.TryOn) then return nil,{"This game client cannot preview outfits"} end
  local undressed=pcall(model.Undress,model)
  if not undressed then return nil,{"The character model could not be cleared"} end
  local hidden,warnings,applied={},{},0
  for _,slot in ipairs(value.hiddenSlots) do hidden[slot]=true end
  for _,entry in ipairs(value.slots) do
    if not hidden[entry.slot] then
      if not visible[entry.slot] then warnings[#warnings+1]=entry.slot..": independent shoulders or nonvisual slots are not supported by this preview"
      else
        local reference=entry.modifiedAppearanceId or entry.itemId and ("item:"..entry.itemId)
        if not reference then warnings[#warnings+1]=entry.slot..": no verified item or appearance-source reference"
        else
          local hand=entry.slot=="mainHand" and "MAINHANDSLOT" or entry.slot=="offHand" and "SECONDARYHANDSLOT" or nil
          local ok,result=pcall(model.TryOn,model,reference,hand)
          if ok and isSuccess(result) then applied=applied+1 else warnings[#warnings+1]=entry.slot..": appearance could not be applied on this character" end
        end
      end
    end
  end
  -- Applying robes or paired appearances can populate child slots; enforce hidden intent last
  for slot in pairs(hidden) do
    if visible[slot] and model.UndressSlot then pcall(model.UndressSlot,model,slots[slot])
    elseif slot=="shoulderLeft" or slot=="shoulderRight" then warnings[#warnings+1]=slot..": independent shoulder hiding is unsupported" end
  end
  for hand,illusionID in pairs(value.illusionIds) do
    if not hidden[hand] then
      local ok,info=false,nil
      if model.GetItemTransmogInfo then ok,info=pcall(model.GetItemTransmogInfo,model,slots[hand]) end
      if ok and type(info)=="table" and model.SetItemTransmogInfo then
        info.illusionID=illusionID
        local set,result=pcall(model.SetItemTransmogInfo,model,info,slots[hand],true)
        if not set or not isSuccess(result) then warnings[#warnings+1]=hand..": weapon illusion could not be applied" end
      else warnings[#warnings+1]=hand..": weapon illusion preview is unavailable" end
    end
  end
  return applied,warnings
end

local collectionCache
local function captureCollection()
  if collectionCache then return collectionCache end
  local journal=C_TransmogCollection
  if not (journal and journal.GetCategoryAppearances and Enum and Enum.TransmogCollectionType) then return {collectionCoverage="unknown",collectedAppearanceIds={}} end
  if InCombatLockdown and InCombatLockdown() then return {collectionCoverage="unknown",collectedAppearanceIds={}} end
  local ids,seen,read={}, {},false
  for _,category in pairs(Enum.TransmogCollectionType) do
    if positive(category) and category<=100 then
      local ok,appearances=pcall(journal.GetCategoryAppearances,category)
      if ok and type(appearances)=="table" then
        read=true
        for _,appearance in ipairs(appearances) do
          if #ids>=100000 then break end
          if type(appearance)=="table" and readable(appearance.isCollected) and appearance.isCollected==true and positive(appearance.visualID) and not seen[appearance.visualID] then seen[appearance.visualID]=true;ids[#ids+1]=appearance.visualID end
        end
      end
    end
  end
  table.sort(ids)
  -- Respect existing wardrobe filters; never mutate them or claim a complete account collection
  collectionCache={collectionCoverage=read and "partial" or "unknown",collectedAppearanceIds=ids,collectionObservedAt=read and date("!%Y-%m-%dT%H:%M:%SZ",GetServerTime()) or nil}
  return collectionCache
end
ns.CaptureCollectionObservation=captureCollection
local events=CreateFrame("Frame")
events:RegisterEvent("TRANSMOG_COLLECTION_UPDATED");events:RegisterEvent("TRANSMOG_COLLECTION_ITEM_UPDATE")
events:SetScript("OnEvent",function() collectionCache=nil end)

local window
local function build()
  local frame=CreateFrame("Frame","WoWCompanionOutfitPreview",UIParent,"BackdropTemplate")
  frame:SetSize(760,600);frame:SetPoint("CENTER");frame:SetFrameStrata("DIALOG");frame:EnableMouse(true);frame:SetMovable(true);frame:RegisterForDrag("LeftButton");frame:SetScript("OnDragStart",frame.StartMoving);frame:SetScript("OnDragStop",frame.StopMovingOrSizing)
  frame:SetBackdrop({bgFile="Interface/Tooltips/UI-Tooltip-Background",edgeFile="Interface/Tooltips/UI-Tooltip-Border",tile=true,tileSize=16,edgeSize=16,insets={left=4,right=4,top=4,bottom=4}});frame:SetBackdropColor(0.03,0.03,0.03,1)
  local title=frame:CreateFontString(nil,"OVERLAY","GameFontNormalLarge");title:SetPoint("TOPLEFT",20,-20);title:SetText("WOW Companion — Outfit preview")
  local close=CreateFrame("Button",nil,frame,"UIPanelCloseButton");close:SetPoint("TOPRIGHT")
  local instructions=frame:CreateFontString(nil,"OVERLAY","GameFontHighlightSmall");instructions:SetPoint("TOPLEFT",20,-55);instructions:SetWidth(330);instructions:SetJustifyH("LEFT");instructions:SetText("Paste your outfit code, Import it, then choose Preview\nOnly planned pieces are shown on your logged-in character")
  local scroll=CreateFrame("ScrollFrame",nil,frame,"UIPanelScrollFrameTemplate");scroll:SetPoint("TOPLEFT",20,-110);scroll:SetSize(310,155)
  local edit=CreateFrame("EditBox",nil,scroll);edit:SetMultiLine(true);edit:SetFontObject(ChatFontNormal);edit:SetWidth(305);edit:SetAutoFocus(false);edit:SetMaxLetters(MAX_CODE);edit:SetScript("OnEscapePressed",function(self) self:ClearFocus() end);scroll:SetScrollChild(edit);frame.edit=edit
  local status=frame:CreateFontString(nil,"OVERLAY","GameFontHighlightSmall");status:SetPoint("TOPLEFT",20,-365);status:SetWidth(330);status:SetJustifyH("LEFT");frame.status=status
  local model=CreateFrame("DressUpModel",nil,frame);model:SetPoint("TOPLEFT",365,-60);model:SetSize(375,470);frame.model=model
  local function report(applied,warnings) status:SetText(applied and ((frame.current and frame.current.name or "Outfit").."\n"..applied.." pieces previewed"..(#warnings>0 and ("\n"..table.concat(warnings,"\n")) or "\nPreview only — nothing equipped or purchased")) or table.concat(warnings,"\n")) end
  model:SetScript("OnModelLoaded",function(self) if frame.current then report(dress(self,frame.current)) end;if self.RefreshCamera then pcall(self.RefreshCamera,self) end;if self.SetCamDistanceScale then pcall(self.SetCamDistanceScale,self,1.1) end end)
  local import=CreateFrame("Button",nil,frame,"UIPanelButtonTemplate");import:SetSize(140,28);import:SetPoint("TOPLEFT",20,-290);import:SetText("Import")
  local preview=CreateFrame("Button",nil,frame,"UIPanelButtonTemplate");preview:SetSize(140,28);preview:SetPoint("TOPLEFT",180,-290);preview:SetText("Preview");preview:Disable()
  import:SetScript("OnClick",function() local value,reason=decode(edit:GetText());if not value then status:SetText(reason);return end;frame.current=value;preview:Enable();edit:ClearFocus();status:SetText(value.name.."\nImported "..#value.slots.." planned slots\nChoose Preview to try them on") end)
  preview:SetScript("OnClick",function()
    if InCombatLockdown and InCombatLockdown() then status:SetText("Leave combat before previewing this outfit");return end
    if not frame.current then return end
    if model.SetAutoDress then pcall(model.SetAutoDress,model,false) end
    local ok=pcall(model.SetUnit,model,"player")
    if not ok then status:SetText("Your character model could not be loaded");return end
    report(dress(model,frame.current))
  end)
  -- Editing a code invalidates preview intent until the new code validates; failed imports keep the old model
  edit:SetScript("OnTextChanged",function(_,userInput) if userInput then frame.current=nil;preview:Disable() end end)
  local footer=frame:CreateFontString(nil,"OVERLAY","GameFontDisableSmall");footer:SetPoint("BOTTOMLEFT",20,20);footer:SetWidth(710);footer:SetJustifyH("LEFT");footer:SetText("Preview uses this character’s body and customization\nUnsupported appearances are reported above; this does not change transmog or spend gold")
  frame:Hide()
  return frame
end
SLASH_WOWCOMPANIONOUTFIT1="/wowoutfit"
SlashCmdList.WOWCOMPANIONOUTFIT=function()
  if InCombatLockdown and InCombatLockdown() then print("WOW Companion: leave combat before opening outfit preview");return end
  window=window or build();window:Show();window.edit:SetFocus()
end
-- Pure protocol and model adapter exposed only inside the addon's shared namespace for fixtures
ns.OutfitTransport={Decode=decode,Validate=validate,Crc32=crc32,Apply=dress,ReadCollection=captureCollection,InvalidateCollection=function() collectionCache=nil end}
