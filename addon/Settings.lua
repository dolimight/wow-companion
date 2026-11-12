-- The addon's page in the game's options window: Options, AddOns, WOW Companion
-- Every control reads and writes the same saved keys as the /wowcompanion commands, so the two always agree
local _, ns = ...
ns = ns or {}

local VERSION = "0.4.9"
local KINDS = {
  { key = "mounts", name = "Mounts", tip = "The mount an item teaches, and whether you have collected it" },
  { key = "pets", name = "Battle pets", tip = "The pet an item teaches, and how many of it you own" },
  { key = "sets", name = "Appearance sets", tip = "Your character wearing the whole ensemble or arsenal" },
  { key = "items", name = "Gear", tip = "Your character trying on only that piece" },
  { key = "housing", name = "Housing decor", tip = "The furnishing model on its own" },
}
local category

local function say(text) print("WOW Companion: " .. text) end

local function characterCount()
  local count = 0
  for _ in pairs(WoWCompanionDB and WoWCompanionDB.characters or {}) do count = count + 1 end
  return count
end

-- Runs a module's hook only when that module loaded, so one missing file never breaks the page
local function notify(name)
  return function() if ns[name] then ns[name]() end end
end

local function build()
  local api = Settings
  if not (api and api.RegisterVerticalLayoutCategory and api.RegisterAddOnSetting and api.RegisterAddOnCategory) then return nil, "this client has no add-on settings page" end
  if not WoWCompanionDB then return nil, "saved data is not loaded yet" end
  WoWCompanionDB.settings = WoWCompanionDB.settings or {}
  local settings = WoWCompanionDB.settings
  settings.previews = settings.previews or {}
  local types = api.VarType or {}
  local boolean, number = types.Boolean or "boolean", types.Number or "number"
  local checkbox = api.CreateCheckbox or api.CreateCheckBox
  local page, layout = api.RegisterVerticalLayoutCategory("WOW Companion")

  local function header(text)
    if layout and layout.AddInitializer and CreateSettingsListSectionHeaderInitializer then layout:AddInitializer(CreateSettingsListSectionHeaderInitializer(text)) end
  end
  local function register(id, key, tbl, kind, name, default, changed)
    local setting = api.RegisterAddOnSetting(page, "WOWCOMPANION_" .. id, key, tbl, kind, name, default)
    if changed then
      if setting.SetValueChangedCallback then setting:SetValueChangedCallback(changed)
      elseif api.SetOnValueChangedCallback then api.SetOnValueChangedCallback("WOWCOMPANION_" .. id, changed) end
    end
    return setting
  end
  local function toggle(id, key, tbl, name, tip, changed)
    return checkbox(page, register(id, key, tbl, boolean, name, true, changed), tip)
  end
  local function slider(id, key, name, default, min, max, step, label, tip)
    local setting = register(id, key, settings, number, name, default, notify("previewSettingsChanged"))
    local options = api.CreateSliderOptions(min, max, step)
    if options.SetLabelFormatter and MinimalSliderWithSteppersMixin then options:SetLabelFormatter(MinimalSliderWithSteppersMixin.Label.Right, label) end
    return api.CreateSlider(page, setting, options, tip)
  end
  local function button(name, text, click, tip)
    if layout and layout.AddInitializer and CreateSettingsButtonInitializer then layout:AddInitializer(CreateSettingsButtonInitializer(name, text, click, tip, true)) end
  end
  local function under(child, parent, active)
    if child and child.SetParentInitializer then child:SetParentInitializer(parent, active) end
  end

  header("Version " .. VERSION .. " · " .. characterCount() .. " character" .. (characterCount() == 1 and "" or "s") .. " saved")

  header("Companion")
  toggle("AUTO_PET", "autoSummonPet", settings, "Auto-summon a favorite pet",
    "Keeps a favorite Pet Journal companion out when none is. Mark favorites in the Pet Journal; with several, the game picks one at random", notify("petSettingChanged"))

  header("3D previews")
  local master = toggle("PREVIEWS", "mountPreview", settings, "Show previews on hover",
    "A slowly turning 3D model below hovered items in bags, vendors, loot, and chat links", notify("previewSettingsChanged"))
  local function previewsOn() return settings.mountPreview ~= false end
  for _, kind in ipairs(KINDS) do
    under(toggle("PREVIEW_" .. kind.key:upper(), kind.key, settings.previews, kind.name, kind.tip, notify("previewSettingsChanged")), master, previewsOn)
  end
  under(slider("PREVIEW_SIZE", "previewSize", "Preview size", 260, 180, 360, 20,
    function(value) return tostring(math.floor(value + 0.5)) end, "How large the preview window is"), master, previewsOn)
  under(slider("PREVIEW_SPIN", "previewSpin", "Turn speed", 0.6, 0, 1.5, 0.1,
    function(value) return value < 0.05 and "Still" or string.format("%.1f", value) end, "How fast the model turns; all the way left keeps it still"), master, previewsOn)

  header("Desktop app")
  button("Export", "Copy export", function()
    if SettingsPanel and HideUIPanel then pcall(HideUIPanel, SettingsPanel) end
    if ns.showExport then ns.showExport() end
  end, "Opens the JSON export to paste into the app. For file import, use /reload or log out first so the game saves its data")
  button("Outfit preview", "Open", function()
    if SettingsPanel and HideUIPanel then pcall(HideUIPanel, SettingsPanel) end
    if SlashCmdList and SlashCmdList.WOWCOMPANIONOUTFIT then SlashCmdList.WOWCOMPANIONOUTFIT() end
  end, "Try on an outfit code from the app on your character")

  header("Troubleshooting")
  button("Diagnostics", "Print to chat", function()
    if ns.command then ns.command("mount debug") end
    local errors = WoWCompanionDB and WoWCompanionDB.captureErrors
    if not errors or not next(errors) then say("the last capture had no errors") return end
    for field, message in pairs(errors) do say("capture of " .. tostring(field) .. " failed: " .. tostring(message)) end
  end, "Prints what the last preview found and any errors from the last capture")

  api.RegisterAddOnCategory(page)
  return page
end

local function ensure()
  if category then return category end
  local ok, page, reason = pcall(build)
  if ok and page then category = page return category end
  ns.settingsError = ok and reason or page
  return nil
end

-- Registered at login, once the saved data is loaded
local frame = CreateFrame("Frame")
frame:RegisterEvent("PLAYER_LOGIN")
frame:SetScript("OnEvent", function() ensure() end)

function ns.openSettings()
  if InCombatLockdown and InCombatLockdown() then say("leave combat before opening settings") return end
  local page = ensure()
  if not page then say("settings are unavailable: " .. tostring(ns.settingsError)) return end
  if Settings.OpenToCategory then Settings.OpenToCategory(page.GetID and page:GetID() or page.ID) end
end

function ns.settingsCommand(message)
  local word = tostring(message or ""):lower():match("^%s*(%S*)")
  if word ~= "settings" and word ~= "options" and word ~= "config" then return false end
  ns.openSettings()
  return true
end

ns.SettingsPage = { Build = ensure, Kinds = KINDS }
