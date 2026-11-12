-- Keep a favorite companion out without replacing an already summoned pet
local _, ns = ...
local frame = CreateFrame("Frame")
local ready, pending, ticker = false, false, nil
local lastAttempt = -math.huge
local INTERVAL = 10

local function enabled()
  return WoWCompanionDB and not (WoWCompanionDB.settings and WoWCompanionDB.settings.autoSummonPet == false)
end

local function summon()
  if not ready or not enabled() then return end
  local journal = C_PetJournal
  if not (journal and journal.GetSummonedPetGUID and journal.HasFavoritePets and journal.SummonRandomPet) then return end
  if InCombatLockdown and InCombatLockdown() then return end
  if UnitIsDeadOrGhost("player") or IsMounted() or IsFlying() or UnitOnTaxi("player") then return end
  if UnitInVehicle("player") or IsStealthed() then return end
  if UnitCastingInfo("player") or UnitChannelInfo("player") then return end
  if C_PetBattles and C_PetBattles.IsInBattle() then return end
  if journal.GetSummonedPetGUID() or not journal.HasFavoritePets() then return end
  local now = GetTime()
  if now - lastAttempt < INTERVAL then return end
  if journal.GetSummonBattlePetCooldown then
    local start, duration, usable = journal.GetSummonBattlePetCooldown()
    if usable == 0 or (start and duration and duration > 0 and now < start + duration) then return end
  end
  lastAttempt = now
  -- A temporarily unavailable journal must not interrupt other addon features
  pcall(journal.SummonRandomPet, true)
end

local function queue()
  if pending then return end
  pending = true
  C_Timer.After(2, function() pending = false; summon() end)
end

for _, event in ipairs({ "PLAYER_LOGIN", "PLAYER_ENTERING_WORLD", "PLAYER_LEAVING_WORLD", "PLAYER_REGEN_ENABLED", "PLAYER_ALIVE", "PLAYER_UNGHOST", "PLAYER_MOUNT_DISPLAY_CHANGED", "UNIT_EXITED_VEHICLE", "PET_BATTLE_CLOSE", "PET_JOURNAL_LIST_UPDATE", "COMPANION_UPDATE" }) do
  frame:RegisterEvent(event)
end
frame:SetScript("OnEvent", function(_, event, unit)
  if event == "PLAYER_LEAVING_WORLD" then ready = false; return end
  if event == "PLAYER_LOGIN" or event == "PLAYER_ENTERING_WORLD" then
    ready = true
    if not ticker then ticker = C_Timer.NewTicker(INTERVAL, summon) end
  end
  if event == "UNIT_EXITED_VEHICLE" and unit ~= "player" then return end
  queue()
end)

-- The settings page calls this after the switch changes, so turning it on summons without waiting for the next check
function ns.petSettingChanged()
  if enabled() then queue() end
end

function ns.petCommand(message)
  local command, choice = tostring(message or ""):lower():match("^%s*(%S*)%s*(%S*)")
  if command ~= "pet" then return false end
  if choice ~= "" and choice ~= "on" and choice ~= "off" then
    print("WOW Companion: use /wowcompanion pet on or off")
    return true
  end
  if not WoWCompanionDB then return true end
  WoWCompanionDB.settings = WoWCompanionDB.settings or {}
  if choice == "on" then WoWCompanionDB.settings.autoSummonPet = true
  elseif choice == "off" then WoWCompanionDB.settings.autoSummonPet = false end
  print("WOW Companion: favorite pet auto-summon " .. (enabled() and "on" or "off"))
  if enabled() then queue() end
  return true
end
