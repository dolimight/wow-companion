-- Run from the repository root: lua addon/tests/empty-snapshot.lua
-- Uses only Lua and mocked WoW APIs; never reads installed addon data
local function loadAddon(saved)
  local state = { now=1000, guid="Player-test", equipped=0, items={}, names={}, levels={}, timers={} }
  local eventHandler
  WoWCompanionDB = saved
  SlashCmdList = {}
  CreateFrame = function()
    return {
      RegisterEvent=function() end,
      SetScript=function(_, event, callback)
        assert(event == "OnEvent")
        eventHandler = callback
      end,
    }
  end
  GetServerTime = function() return state.now end
  date = function(_, time) return "time-" .. tostring(time) end
  UnitGUID = function() return state.guid end
  UnitClass = function() return "Warrior" end
  UnitRace = function() return "Human", "Human", 1 end
  GetSpecialization = nil
  GetAverageItemLevel = function() return state.equipped, state.equipped end
  GetInventoryItemID = function(_, slot) return state.items[slot] end
  GetInventoryItemLink = function(_, slot)
    local itemId = state.items[slot]
    return itemId and ("item:" .. itemId .. ":0:") or nil
  end
  C_Item = {
    GetItemNameByID=function(id) return state.names[id] end,
    GetDetailedItemLevelInfo=function(link) return state.levels[tonumber(link:match("item:(%d+):"))] end,
    RequestLoadItemDataByID=function() end,
  }
  GetCurrentRegion = function() return 1 end
  GetRealmName = function() return "Test Realm" end
  UnitName = function() return "Test Character" end
  UnitLevel = function() return 80 end
  GetBuildInfo = function() return "test", "12345" end
  C_Timer = { After=function(_, callback) table.insert(state.timers, callback) end }
  assert(loadfile("addon/WoWCompanion.lua"))()
  state.event = function(event, name) eventHandler(nil, event, name) end
  state.flush = function()
    local timers = state.timers
    state.timers = {}
    for _, callback in ipairs(timers) do callback() end
  end
  state.event("ADDON_LOADED", "WoWCompanion")
  return state
end

local function check(condition, message) assert(condition, message) end
local tests = 0
local function test(name, run)
  run()
  tests = tests + 1
  print("PASS " .. name)
end

test("empty logout preserves the entire previous observation and export time", function()
  local old = { observedAt="time-100", sequence=9, itemLevel=250, gear={{itemId=42}}, weekly={vault={{progress=3}}} }
  local other = { observedAt="time-50" }
  local saved = {schemaVersion=1, addonVersion="0.2.0", exportedAt="time-100", sourceProfileId="existing", characters={["Player-test"]=old, ["Player-other"]=other}}
  local state = loadAddon(saved)
  state.event("PLAYER_LOGOUT")
  check(WoWCompanionDB == saved, "replaced saved database")
  check(saved.characters["Player-test"] == old, "replaced last good character")
  check(old.observedAt == "time-100" and old.sequence == 9, "refreshed stale observation")
  check(saved.exportedAt == "time-100", "refreshed export time")
  check(saved.characters["Player-other"] == other and saved.sourceProfileId == "existing", "changed unrelated saved data")
  check(saved.addonVersion == "0.4.2" and saved.schemaVersion == 1, "incorrect version")
end)

test("first empty capture creates no authoritative empty character", function()
  local state = loadAddon(nil)
  local exportedAt = WoWCompanionDB.exportedAt
  state.now = 1100
  state.event("PLAYER_LOGIN")
  state.flush()
  state.event("PLAYER_LOGOUT")
  check(next(WoWCompanionDB.characters) == nil, "manufactured empty character")
  check(WoWCompanionDB.exportedAt == exportedAt, "refreshed export time on skipped capture")
end)

test("empty capture is skipped even with positive or unavailable average item level", function()
  local state = loadAddon(nil)
  for _, level in ipairs({250, false}) do
    state.equipped = level or nil
    state.event("PLAYER_LOGOUT")
    check(next(WoWCompanionDB.characters) == nil, "average item level authorized empty gear")
  end
end)

test("valid capture survives empty events and resumes with truthful time and sequence", function()
  local state = loadAddon(nil)
  state.items[1], state.names[42], state.levels[42], state.equipped = 42, "Test Helm", 250, 250
  state.event("PLAYER_LOGOUT")
  local good = WoWCompanionDB.characters[state.guid]
  check(good.gearCoverage == "complete" and #good.gear == 1, "valid gear not captured")
  check(good.sequence == 1 and good.observedAt == "time-1000", "incorrect first observation")
  state.items, state.equipped, state.now = {}, 0, 2000
  state.event("PLAYER_EQUIPMENT_CHANGED")
  state.flush()
  state.event("PLAYER_LOGOUT")
  check(WoWCompanionDB.characters[state.guid] == good, "empty event replaced valid capture")
  check(WoWCompanionDB.exportedAt == "time-1000" and good.observedAt == "time-1000", "empty event refreshed timestamps")
  state.items[16], state.now = 43, 3000
  state.event("ITEM_DATA_LOAD_RESULT")
  state.flush()
  local resumed = WoWCompanionDB.characters[state.guid]
  check(resumed.gear[1].itemId == 43 and resumed.gearCoverage == "partial", "uncached item ID should remain usable")
  check(resumed.sequence == 2, "skipped captures advanced sequence")
  check(resumed.observedAt == "time-3000" and WoWCompanionDB.exportedAt == resumed.observedAt, "incorrect resumed timestamps")
end)

test("missing player identity leaves the saved observation untouched", function()
  local state = loadAddon(nil)
  state.items[1], state.guid, state.now = 42, nil, 2000
  state.event("PLAYER_LOGOUT")
  check(next(WoWCompanionDB.characters) == nil and WoWCompanionDB.exportedAt == "time-1000", "captured unavailable player")
end)

if io.open then
  local toc = assert(io.open("addon/WoWCompanion.toc", "r"))
  local tocText = toc:read("*a")
  toc:close()
  check(tocText:match("## Version: 0%.2%.2[\r\n]"), "TOC version mismatch")
else
  print("TOC file read unavailable in this Lua host; version consistency is checked separately")
end
print(tests .. " tests passed")
