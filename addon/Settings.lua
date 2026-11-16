-- The addon's page in the game's options window: Options, AddOns, WOW Companion
-- Every control reads and writes the same saved keys as the /wowcompanion commands, so the two always agree
local _, ns = ...
ns = ns or {}

local VERSION = "0.5.0"
local KINDS = {
  { key = "mounts", name = "Mounts", tip = "The mount an item teaches, and whether you have collected it", icon = "Interface/Icons/Ability_Mount_RidingHorse" },
  { key = "pets", name = "Battle pets", tip = "The pet an item teaches, and how many of it you own", icon = "Interface/Icons/INV_Box_PetCarrier_01" },
  { key = "sets", name = "Appearance sets", tip = "Your character wearing the whole ensemble or arsenal", icon = "Interface/Icons/INV_Chest_Cloth_17" },
  { key = "items", name = "Gear", tip = "Your character trying on only that piece", icon = "Interface/Icons/INV_Helmet_03" },
  { key = "housing", name = "Housing decor", tip = "The furnishing model on its own", icon = "Interface/Icons/INV_Misc_Lantern_01" },
}
local ICON = "Interface/Icons/INV_Box_PetCarrier_01"
local SIZE = { default = 260, min = 180, max = 360, step = 20 }
local SPIN = { default = 0.6, min = 0, max = 1.5, step = 0.1 }
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

local function buildList()
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
  under(slider("PREVIEW_SIZE", "previewSize", "Preview size", SIZE.default, SIZE.min, SIZE.max, SIZE.step,
    function(value) return tostring(math.floor(value + 0.5)) end, "How large the preview window is"), master, previewsOn)
  under(slider("PREVIEW_SPIN", "previewSpin", "Turn speed", SPIN.default, SPIN.min, SPIN.max, SPIN.step,
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

-- The designed page: cards with icons, preview tiles, a live model that follows the sliders, and status read from saved data
local COLORS = {
  card = { 0.07, 0.07, 0.09, 0.92 }, edge = { 1, 1, 1, 0.08 }, tileOn = { 1, 0.82, 0, 0.55 },
  muted = { 0.62, 0.64, 0.68 }, good = { 0.4, 0.86, 0.5 }, bad = { 1, 0.42, 0.36 },
}
local FLAT = "Interface/Buttons/WHITE8X8"
local GAP, PAD, WIDTH = 14, 16, 620

local function round(value, step) return math.floor(value / step + 0.5) * step end
local function sizeLabel(value) return tostring(math.floor(value + 0.5)) end
local function spinLabel(value) return value < 0.05 and "Still" or string.format("%.1f", value) end

-- How long ago a snapshot's UTC time was, on the server clock the snapshots use
local function ago(iso)
  if type(iso) ~= "string" or not GetServerTime then return nil end
  local y, mo, d, h, mi, se = iso:match("^(%d+)-(%d+)-(%d+)T(%d+):(%d+):(%d+)")
  if not y then return nil end
  -- Days since 1970 from the calendar date, so no time zone or os library is involved
  y, mo = tonumber(y), tonumber(mo)
  if mo <= 2 then y = y - 1 end
  local era = math.floor(y / 400)
  local yoe = y - era * 400
  local doy = math.floor((153 * (mo + (mo > 2 and -3 or 9)) + 2) / 5) + tonumber(d) - 1
  local days = era * 146097 + yoe * 365 + math.floor(yoe / 4) - math.floor(yoe / 100) + doy - 719468
  local utc = days * 86400 + tonumber(h) * 3600 + tonumber(mi) * 60 + tonumber(se)
  local seconds = GetServerTime() - utc
  if seconds < 90 then return "just now" end
  if seconds < 5400 then return math.floor(seconds / 60 + 0.5) .. " min ago" end
  if seconds < 129600 then return math.floor(seconds / 3600 + 0.5) .. " hr ago" end
  return math.floor(seconds / 86400 + 0.5) .. " days ago"
end

local function latestSnapshot()
  local name, at
  for _, character in pairs(WoWCompanionDB and WoWCompanionDB.characters or {}) do
    if type(character) == "table" and type(character.observedAt) == "string" and (not at or character.observedAt > at) then name, at = character.name, character.observedAt end
  end
  return name, at
end

local function text(parent, font, color)
  local label = parent:CreateFontString(nil, "OVERLAY", font)
  label:SetJustifyH("LEFT")
  if color then label:SetTextColor(color[1], color[2], color[3]) end
  return label
end

local function icon(parent, path, size)
  local texture = parent:CreateTexture(nil, "ARTWORK")
  texture:SetSize(size, size)
  texture:SetTexture(path)
  texture:SetTexCoord(0.07, 0.93, 0.07, 0.93)
  return texture
end

local function backdrop(frame, color, edge)
  if not frame.SetBackdrop then return end
  frame:SetBackdrop({ bgFile = FLAT, edgeFile = FLAT, edgeSize = 1 })
  frame:SetBackdropColor(color[1], color[2], color[3], color[4])
  frame:SetBackdropBorderColor(edge[1], edge[2], edge[3], edge[4])
end

local function tooltip(frame, title, body)
  frame:SetScript("OnEnter", function(self)
    if not GameTooltip then return end
    GameTooltip:SetOwner(self, "ANCHOR_RIGHT")
    GameTooltip:SetText(title, 1, 1, 1)
    if body then GameTooltip:AddLine(body, nil, nil, nil, true) end
    GameTooltip:Show()
  end)
  frame:SetScript("OnLeave", function() if GameTooltip then GameTooltip:Hide() end end)
end

local function closeSettings()
  if SettingsPanel and HideUIPanel then pcall(HideUIPanel, SettingsPanel) end
end

local function buildCanvas()
  local api = Settings
  if not WoWCompanionDB then return nil, "saved data is not loaded yet" end
  WoWCompanionDB.settings = WoWCompanionDB.settings or {}
  local settings = WoWCompanionDB.settings
  settings.previews = settings.previews or {}
  local panel = CreateFrame("Frame")
  local refreshers = {}
  local function refresh() for _, update in ipairs(refreshers) do pcall(update) end end

  local scroll = CreateFrame("ScrollFrame", nil, panel, "ScrollFrameTemplate")
  scroll:SetPoint("TOPLEFT", 0, -4)
  scroll:SetPoint("BOTTOMRIGHT", -28, 4)
  local content = CreateFrame("Frame", nil, scroll)
  content:SetSize(WIDTH, 10)
  scroll:SetScrollChild(content)
  local cursor = -PAD

  -- Header: the addon's icon, its name, and what it has saved
  local logo = icon(content, ICON, 44)
  logo:SetPoint("TOPLEFT", PAD, cursor)
  local title = text(content, "GameFontNormalHuge")
  title:SetPoint("TOPLEFT", logo, "TOPRIGHT", 12, -2)
  title:SetText("WOW Companion")
  local summary = text(content, "GameFontHighlightSmall", COLORS.muted)
  summary:SetPoint("TOPLEFT", title, "BOTTOMLEFT", 0, -6)
  table.insert(refreshers, function()
    local count = characterCount()
    local name, at = latestSnapshot()
    local line = "Version " .. VERSION .. " · " .. count .. " character" .. (count == 1 and "" or "s") .. " saved"
    local when = ago(at)
    if name and when then line = line .. " · last snapshot " .. name .. ", " .. when end
    summary:SetText(line)
  end)
  cursor = cursor - 44 - GAP - 4

  -- A card grows as rows are added, then the next card starts below it
  local function card(name, path, description)
    local frame = CreateFrame("Frame", nil, content, "BackdropTemplate")
    backdrop(frame, COLORS.card, COLORS.edge)
    frame:SetPoint("TOPLEFT", PAD, cursor)
    frame:SetWidth(WIDTH - PAD * 2)
    local badge = icon(frame, path, 28)
    badge:SetPoint("TOPLEFT", PAD, -PAD)
    local heading = text(frame, "GameFontHighlightLarge")
    heading:SetPoint("TOPLEFT", badge, "TOPRIGHT", 10, 0)
    heading:SetText(name)
    local blurb = text(frame, "GameFontHighlightSmall", COLORS.muted)
    blurb:SetPoint("TOPLEFT", heading, "BOTTOMLEFT", 0, -3)
    blurb:SetText(description)
    frame.y = -PAD - 28 - 14
    function frame.finish(self)
      self:SetHeight(-self.y + PAD)
      cursor = cursor - (-self.y + PAD) - GAP
    end
    return frame
  end

  local function switch(parent, y, label, detailed, get, set)
    local check = CreateFrame("CheckButton", nil, parent, "UICheckButtonTemplate")
    check:SetSize(26, 26)
    check:SetPoint("TOPLEFT", PAD - 4, y)
    local name = text(parent, "GameFontHighlight")
    name:SetPoint("LEFT", check, "RIGHT", 4, detailed and 7 or 0)
    name:SetText(label)
    local sub
    if detailed then
      sub = text(parent, "GameFontHighlightSmall", COLORS.muted)
      sub:SetPoint("TOPLEFT", name, "BOTTOMLEFT", 0, -2)
    end
    check:SetScript("OnClick", function(self) set(self:GetChecked() and true or false); refresh() end)
    table.insert(refreshers, function() check:SetChecked(get()) end)
    return check, sub
  end

  local function button(parent, label, width, click, tip)
    local widget = CreateFrame("Button", nil, parent, "UIPanelButtonTemplate")
    widget:SetSize(width, 24)
    widget:SetText(label)
    widget:SetScript("OnClick", click)
    if tip then tooltip(widget, label, tip) end
    return widget
  end

  -- A slider that writes one saved number: the game's stepper slider when present, a plain slider otherwise
  local function slider(parent, y, label, key, range, format, changed)
    local name = text(parent, "GameFontHighlightSmall")
    name:SetPoint("TOPLEFT", PAD, y)
    name:SetText(label)
    local function current() return math.max(range.min, math.min(range.max, tonumber(settings[key]) or range.default)) end
    local function write(value)
      value = round(value, range.step)
      if settings[key] == value then return end
      settings[key] = value
      notify("previewSettingsChanged")()
      if changed then changed() end
    end
    local holder
    local stepper = pcall(function()
      holder = CreateFrame("Frame", nil, parent, "MinimalSliderWithSteppersTemplate")
      holder:SetSize(250, 20)
      holder:SetPoint("TOPLEFT", name, "BOTTOMLEFT", 0, -4)
      local formatters = { [MinimalSliderWithSteppersMixin.Label.Right] = format }
      holder:Init(current(), range.min, range.max, math.floor((range.max - range.min) / range.step + 0.5), formatters)
      holder:RegisterCallback(MinimalSliderWithSteppersMixin.Event.OnValueChanged, function(_, value) write(value) end, holder)
    end)
    if stepper then
      table.insert(refreshers, function() holder:SetValue(current()) end)
    else
      holder = CreateFrame("Slider", nil, parent, "BackdropTemplate")
      holder:SetOrientation("HORIZONTAL")
      holder:SetSize(220, 14)
      holder:SetPoint("TOPLEFT", name, "BOTTOMLEFT", 0, -6)
      holder:SetMinMaxValues(range.min, range.max)
      holder:SetValueStep(range.step)
      holder:SetThumbTexture("Interface/Buttons/UI-SliderBar-Button-Horizontal")
      backdrop(holder, { 0, 0, 0, 0.5 }, COLORS.edge)
      local value = text(parent, "GameFontHighlightSmall")
      value:SetPoint("LEFT", holder, "RIGHT", 8, 0)
      holder:SetScript("OnValueChanged", function(_, number) value:SetText(format(number)); write(number) end)
      table.insert(refreshers, function() holder:SetValue(current()); value:SetText(format(current())) end)
    end
    return holder
  end

  -- Companion
  local companion = card("Companion", "Interface/Icons/INV_Box_PetCarrier_01", "Keeps one of your favorite pets out while you play")
  local _, petStatus = switch(companion, companion.y, "Auto-summon a favorite pet", true,
    function() return settings.autoSummonPet ~= false end,
    function(on) settings.autoSummonPet = on; notify("petSettingChanged")() end)
  table.insert(refreshers, function()
    local journal = C_PetJournal
    local color = COLORS.muted
    if journal and journal.HasFavoritePets and journal.HasFavoritePets() then
      petStatus:SetText("Favorites are marked · the game picks one at random"); color = COLORS.good
    else petStatus:SetText("No favorites yet · star a pet in the Pet Journal") end
    petStatus:SetTextColor(color[1], color[2], color[3])
  end)
  local journal = button(companion, "Pet Journal", 120, function()
    closeSettings()
    if ToggleCollectionsJournal then ToggleCollectionsJournal(2) end
  end, "Opens the Pet Journal to choose favorites")
  journal:SetPoint("TOPRIGHT", -PAD, companion.y - 2)
  companion.y = companion.y - 40
  companion:finish()

  -- 3D previews: a master switch, one tile per kind, two sliders, and a live model
  local previews = card("3D previews", "Interface/Icons/Ability_Mount_RidingHorse", "A turning model below hovered items in bags, vendors, loot, and chat links")
  local function previewsOn() return settings.mountPreview ~= false end
  switch(previews, previews.y, "Show previews on hover", false, previewsOn, function(on) settings.mountPreview = on; notify("previewSettingsChanged")() end)
  previews.y = previews.y - 36
  local dimmed = {}
  local columns, tileWidth, tileHeight = 3, 168, 40
  for index, kind in ipairs(KINDS) do
    local tile = CreateFrame("Button", nil, previews, "BackdropTemplate")
    tile:SetSize(tileWidth, tileHeight)
    local column, row = (index - 1) % columns, math.floor((index - 1) / columns)
    tile:SetPoint("TOPLEFT", PAD + column * (tileWidth + 8), previews.y - row * (tileHeight + 8))
    local art = icon(tile, kind.icon, 24)
    art:SetPoint("LEFT", 9, 0)
    local name = text(tile, "GameFontHighlight")
    name:SetPoint("LEFT", art, "RIGHT", 9, 0)
    name:SetText(kind.name)
    local function on() return settings.previews[kind.key] ~= false end
    tile:SetScript("OnClick", function()
      settings.previews[kind.key] = not on()
      if settings.previews[kind.key] then settings.mountPreview = true end
      notify("previewSettingsChanged")()
      refresh()
    end)
    tooltip(tile, kind.name, kind.tip)
    table.insert(refreshers, function()
      backdrop(tile, on() and { 0.16, 0.13, 0.04, 0.9 } or { 0, 0, 0, 0.35 }, on() and COLORS.tileOn or COLORS.edge)
      art:SetDesaturated(not on())
      art:SetAlpha(on() and 1 or 0.5)
    end)
    tile.previewKind = kind.key
    table.insert(dimmed, tile)
  end
  previews.y = previews.y - math.ceil(#KINDS / columns) * (tileHeight + 8) - 12

  -- The stage on the right shows your character at the chosen size and turn speed
  local stage = CreateFrame("Frame", nil, previews, "BackdropTemplate")
  stage:SetSize(150, 150)
  stage:SetPoint("TOPRIGHT", -PAD, previews.y)
  backdrop(stage, { 0, 0, 0, 0.45 }, COLORS.edge)
  local model = CreateFrame("PlayerModel", nil, stage)
  model:SetPoint("CENTER")
  local caption = text(previews, "GameFontDisableSmall")
  caption:SetPoint("TOP", stage, "BOTTOM", 0, -5)
  local facing = 0
  local function restage()
    local size = math.max(SIZE.min, math.min(SIZE.max, tonumber(settings.previewSize) or SIZE.default))
    local edge = math.floor(146 * size / SIZE.max + 0.5)
    model:SetSize(edge, edge)
    caption:SetText("Preview at " .. sizeLabel(size) .. " px")
  end
  model:SetScript("OnShow", function(self) if self.SetUnit then self:SetUnit("player") end; restage() end)
  model:SetScript("OnUpdate", function(self, elapsed)
    local speed = math.max(SPIN.min, math.min(SPIN.max, tonumber(settings.previewSpin) or SPIN.default))
    facing = (facing + elapsed * speed) % (2 * math.pi)
    if self.SetRotation then self:SetRotation(facing) end
  end)
  table.insert(refreshers, restage)
  ns.settingsModel = model

  local size = slider(previews, previews.y, "Preview size", "previewSize", SIZE, sizeLabel, restage)
  local spin = slider(previews, previews.y - 56, "Turn speed", "previewSpin", SPIN, spinLabel)
  table.insert(dimmed, size)
  table.insert(dimmed, spin)
  table.insert(refreshers, function()
    local on = previewsOn()
    for _, widget in ipairs(dimmed) do
      widget:SetAlpha(on and 1 or 0.4)
      if widget.EnableMouse then widget:EnableMouse(on) end
      if widget.SetEnabled then pcall(widget.SetEnabled, widget, on) end
    end
    stage:SetAlpha(on and 1 or 0.4)
  end)
  previews.y = previews.y - 150 - 26
  previews:finish()

  -- Desktop app
  local desktop = card("Desktop app", "Interface/Icons/INV_Misc_Note_01", "Hand your characters to WOW Companion on your PC")
  local export = button(desktop, "Copy export", 130, function() closeSettings(); if ns.showExport then ns.showExport() end end,
    "Opens the JSON export to paste into the app")
  export:SetPoint("TOPLEFT", PAD, desktop.y)
  local save = button(desktop, "Save for the app", 140, function() if ReloadUI then ReloadUI() end end,
    "Reloads the interface so the game writes your saved data, which the app's file import and watcher read")
  save:SetPoint("LEFT", export, "RIGHT", 8, 0)
  local outfit = button(desktop, "Outfit preview", 130, function()
    closeSettings()
    if SlashCmdList and SlashCmdList.WOWCOMPANIONOUTFIT then SlashCmdList.WOWCOMPANIONOUTFIT() end
  end, "Try on an outfit code from the app on your character")
  outfit:SetPoint("LEFT", save, "RIGHT", 8, 0)
  desktop.y = desktop.y - 34
  desktop:finish()

  -- Troubleshooting: the last capture's errors, right on the page
  local trouble = card("Troubleshooting", "Interface/Icons/INV_Misc_Gear_01", "What the last snapshot could not read")
  local report = text(trouble, "GameFontHighlightSmall")
  report:SetPoint("TOPLEFT", PAD, trouble.y - 4)
  report:SetWidth(WIDTH - PAD * 4 - 140)
  local diagnostics = button(trouble, "Print details", 120, function()
    if ns.command then ns.command("mount debug") end
    local errors = WoWCompanionDB and WoWCompanionDB.captureErrors
    if not errors or not next(errors) then say("the last capture had no errors") return end
    for field, message in pairs(errors) do say("capture of " .. tostring(field) .. " failed: " .. tostring(message)) end
  end, "Prints what the last preview found and any capture errors to chat")
  diagnostics:SetPoint("TOPRIGHT", -PAD, trouble.y)
  table.insert(refreshers, function()
    local lines = {}
    for field in pairs(WoWCompanionDB and WoWCompanionDB.captureErrors or {}) do table.insert(lines, tostring(field)) end
    table.sort(lines)
    local color = COLORS.good
    if #lines == 0 then report:SetText("The last snapshot read everything")
    else report:SetText("Could not read: " .. table.concat(lines, ", ")); color = COLORS.bad end
    report:SetTextColor(color[1], color[2], color[3])
  end)
  trouble.y = trouble.y - 30
  trouble:finish()

  content:SetHeight(-cursor + PAD)
  panel:SetScript("OnShow", refresh)
  -- The options window calls these from its Defaults button and when it opens or closes the page
  panel.OnRefresh = refresh
  panel.OnCommit = function() end
  panel.OnDefault = function()
    settings.autoSummonPet, settings.mountPreview, settings.previewSize, settings.previewSpin = nil, nil, nil, nil
    for key in pairs(settings.previews) do settings.previews[key] = nil end
    notify("petSettingChanged")()
    notify("previewSettingsChanged")()
    refresh()
  end
  refresh()
  local page = api.RegisterCanvasLayoutCategory(panel, "WOW Companion")
  api.RegisterAddOnCategory(page)
  ns.settingsPanel = panel
  return page
end

-- The designed page when the client can host one, the plain settings list otherwise
local function build()
  local api = Settings
  if api and api.RegisterCanvasLayoutCategory and api.RegisterAddOnCategory then return buildCanvas() end
  return buildList()
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

-- The addon compartment (the puzzle piece by the minimap) opens the same page
function WoWCompanion_OnAddonCompartmentClick() ns.openSettings() end
