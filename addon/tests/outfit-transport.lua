-- Offline fixture tests; no live account or installed game files are accessed
local fixture=assert(loadfile("addon/tests/outfit-fixture.lua"))()
local namespace,passed={},0
local function check(value,message) if not value then error(message,2) end end
local function test(name,run) run();passed=passed+1;print("PASS "..name) end
local function copy(value) if type(value)~="table" then return value end;local output={};for key,item in pairs(value) do output[key]=copy(item) end;return output end
local parsed=copy(fixture.value)
SlashCmdList={}
CreateFrame=function() return {RegisterEvent=function() end,SetScript=function() end} end
local time=1793275200
GetServerTime=function() return time end
date=function() return "2026-10-29T12:00:00Z" end
local combat=false
InCombatLockdown=function() return combat end
Enum={TransmogCollectionType={Head=1,Shoulder=2},ItemTryOnReason={Success=0}}
C_EncodingUtil={DeserializeJSON=function(json) check(json==fixture.json,"Lua decoded exactly the desktop canonical JSON");return copy(parsed) end}
assert(loadfile("addon/OutfitPreview.lua"))("WoWCompanion",namespace)
local protocol=namespace.OutfitTransport
test("desktop code and standard CRC32 decode in Lua",function()
  check(protocol.Crc32("123456789")=="cbf43926","CRC32 vector")
  local value,error=protocol.Decode(fixture.code)
  check(value and not error,"valid fixture: "..tostring(error))
  check(value.name=="Silver traveler" and value.slots[1].modifiedAppearanceId==300,"exact fixture references")
end)
test("corrupt oversized executable and invalid-version codes cannot replace a plan",function()
  check(not protocol.Decode(fixture.code:sub(1,-2).."0"),"checksum rejection")
  check(not protocol.Decode("WCO1."..string.rep("A",90000)..".00000000"),"size rejection")
  check(not protocol.Decode("loadstring('print(1)')()"),"code is never executed")
  parsed.schemaVersion=2;check(not protocol.Decode(fixture.code),"version rejection");parsed=copy(fixture.value)
  parsed.slots[2]=copy(parsed.slots[1]);check(not protocol.Decode(fixture.code),"duplicate slot rejection");parsed=copy(fixture.value)
  parsed.slots[1].itemId=-1;check(not protocol.Decode(fixture.code),"invalid ID rejection");parsed=copy(fixture.value)
  parsed.run="anything";check(not protocol.Decode(fixture.code),"unknown field rejection");parsed=copy(fixture.value)
  for i=2,41 do parsed.slots[i]=copy(parsed.slots[1]) end;check(not protocol.Decode(fixture.code),"slot count rejection");parsed=copy(fixture.value)
end)
test("manual preview clears current gear and applies exact planned references",function()
  local calls={}
  local model={Undress=function() calls[#calls+1]="clear" end,TryOn=function(_,reference) calls[#calls+1]=reference;return 0 end,UndressSlot=function(_,slot) calls[#calls+1]="hide:"..slot end}
  local count,warnings=protocol.Apply(model,fixture.value)
  check(count==1 and #warnings==0,"one supported appearance")
  check(calls[1]=="clear" and calls[2]==300 and calls[3]=="hide:1","clear, exact source, then hidden intent")
end)
test("combat rejects preview before touching a model",function()
  combat=true
  local count,warnings=protocol.Apply({Undress=function() error("must not change model") end,TryOn=function() end},fixture.value)
  check(count==nil and warnings[1]:find("combat"),"combat reason")
  combat=false
end)
test("unsupported independent shoulder references remain explicit",function()
  local value=copy(fixture.value);value.slots[1].slot="shoulderLeft"
  local count,warnings=protocol.Apply({Undress=function() end,TryOn=function() error("must not silently substitute shoulders") end},value)
  check(count==0 and #warnings==1 and warnings[1]:find("not supported"),"unsupported feature explained")
end)
test("collection capture respects filters and never claims complete absence",function()
  local reads=0
  C_TransmogCollection={GetCategoryAppearances=function(category) reads=reads+1;return {{visualID=44,isCollected=true},{visualID=45,isCollected=false},{visualID=44,isCollected=true}} end}
  local first=protocol.ReadCollection()
  check(first.collectionCoverage=="partial" and #first.collectedAppearanceIds==1 and first.collectedAppearanceIds[1]==44,"only positive observations")
  check(first.collectionObservedAt=="2026-10-29T12:00:00Z","real scan time")
  protocol.ReadCollection();check(reads==2,"cached across unrelated gear snapshots")
  protocol.InvalidateCollection();protocol.ReadCollection();check(reads==4,"collection event invalidates scan")
end)
print("PASS "..passed.." outfit protocol and preview tests")
