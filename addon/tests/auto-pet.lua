-- Run from the repository root: lua addon/tests/auto-pet.lua
local function setup(saved)
  local state = { now = 100, timers = {}, calls = 0, favorites = true }
  local handler
  WoWCompanionDB = saved or { settings = {} }
  CreateFrame = function() return { RegisterEvent = function() end, SetScript = function(_, _, fn) handler = fn end } end
  C_Timer = {
    After = function(_, fn) table.insert(state.timers, fn) end,
    NewTicker = function(interval, fn) assert(interval == 10); state.tick = fn; return {} end,
  }
  GetTime = function() return state.now end
  InCombatLockdown = function() return state.combat end
  UnitIsDeadOrGhost = function() return state.dead end
  IsMounted = function() return state.mounted end
  IsFlying = function() return state.flying end
  UnitOnTaxi = function() return state.taxi end
  UnitInVehicle = function() return state.vehicle end
  IsStealthed = function() return state.stealth end
  UnitCastingInfo = function() return state.casting end
  UnitChannelInfo = function() return state.channeling end
  C_PetBattles = { IsInBattle = function() return state.battle end }
  C_PetJournal = {
    GetSummonedPetGUID = function() return state.summoned end,
    HasFavoritePets = function() return state.favorites end,
    GetSummonBattlePetCooldown = function() return state.cooldownStart or 0, state.cooldownDuration or 0, 1 end,
    SummonRandomPet = function(favoritesOnly) assert(favoritesOnly == true); state.calls = state.calls + 1; if state.fail then error("unavailable") end end,
  }
  local ns = {}
  assert(loadfile("addon/AutoPet.lua"))("WoWCompanion", ns)
  state.event = function(event, unit) handler(nil, event, unit) end
  state.flush = function() local timers = state.timers; state.timers = {}; for _, fn in ipairs(timers) do fn() end end
  state.command = ns.petCommand
  return state
end

local tests = 0
local function test(name, fn) fn(); tests = tests + 1; print("PASS " .. name) end
test("login waits before summoning a favorite and throttles retries", function()
  local s = setup(); s.event("PLAYER_LOGIN"); assert(s.calls == 0); s.flush(); assert(s.calls == 1)
  s.event("COMPANION_UPDATE"); s.flush(); s.tick(); assert(s.calls == 1)
  s.now = 110; s.tick(); assert(s.calls == 2)
end)
test("an existing companion is never replaced or dismissed", function()
  local s = setup(); s.summoned = "any-pet"; s.event("PLAYER_LOGIN"); s.flush(); s.tick(); assert(s.calls == 0)
  s.summoned = nil; s.tick(); assert(s.calls == 1)
end)
test("no favorites means no fallback to non-favorites", function()
  local s = setup(); s.favorites = false; s.event("PLAYER_LOGIN"); s.flush(); assert(s.calls == 0)
  s.favorites = true; s.event("PET_JOURNAL_LIST_UPDATE"); s.flush(); assert(s.calls == 1)
end)
for _, flag in ipairs({ "combat", "dead", "mounted", "flying", "taxi", "vehicle", "stealth", "casting", "channeling", "battle" }) do
  test("defer while " .. flag .. " and recover afterwards", function()
    local s = setup(); s[flag] = true; s.event("PLAYER_LOGIN"); s.flush(); assert(s.calls == 0)
    s[flag] = false; s.now = s.now + 10; s.tick(); assert(s.calls == 1)
  end)
end
test("combat end and repeated events coalesce", function()
  local s = setup(); s.combat = true; s.event("PLAYER_LOGIN"); s.flush()
  s.combat = false; for _ = 1, 20 do s.event("PLAYER_REGEN_ENABLED") end
  assert(#s.timers == 1); s.flush(); assert(s.calls == 1)
end)
test("off persists and cancels a queued summon, on resumes", function()
  local s = setup(); s.event("PLAYER_LOGIN"); assert(s.command("pet off")); s.flush(); assert(s.calls == 0)
  local saved = WoWCompanionDB; s = setup(saved); s.event("PLAYER_LOGIN"); s.flush(); assert(s.calls == 0)
  s.command("pet on"); s.flush(); assert(s.calls == 1)
  assert(not s.command("mount off")); s.command("pet invalid"); assert(WoWCompanionDB.settings.autoSummonPet == true)
end)
test("loading screens block queued work until world entry", function()
  local s = setup(); s.event("PLAYER_LOGIN"); s.event("PLAYER_LEAVING_WORLD"); s.flush(); s.tick(); assert(s.calls == 0)
  s.event("PLAYER_ENTERING_WORLD"); s.flush(); assert(s.calls == 1)
end)
test("cooldown and unavailable APIs do not summon", function()
  local s = setup(); s.cooldownStart = 99; s.cooldownDuration = 10; s.event("PLAYER_LOGIN"); s.flush(); assert(s.calls == 0)
  s.now = 110; s.tick(); assert(s.calls == 1)
  C_PetJournal = nil; s.now = 120; s.tick(); assert(s.calls == 1)
end)
test("journal failures are contained and rate limited", function()
  local s = setup(); s.fail = true; s.event("PLAYER_LOGIN"); s.flush(); s.tick(); assert(s.calls == 1)
end)
print(tests .. " auto-pet tests passed")
