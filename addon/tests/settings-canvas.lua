-- Run from the repository root: lua addon/tests/settings-canvas.lua
-- Checks the designed settings page against mocked frames; how it looks still needs a Retail client check
local passed = 0
local say = print
local function check(condition, message)
  if not condition then error(message, 2) end
end
local function test(name, run)
  run()
  passed = passed + 1
  say("PASS " .. name)
end

-- Every frame, texture, and font string is a recording stand-in; unknown methods do nothing
local function widget(state, kind, template)
  local object = { kind = kind, template = template, scripts = {}, alpha = 1, children = {} }
  local methods = {
    SetScript = function(self, name, fn) self.scripts[name] = fn end,
    HookScript = function(self, name, fn) self.scripts[name] = fn end,
    SetText = function(self, value) self.text = value end,
    GetText = function(self) return self.text end,
    SetTextColor = function(self, r, g, b) self.color = { r, g, b } end,
    SetChecked = function(self, value) self.checked = value and true or false end,
    GetChecked = function(self) return self.checked end,
    SetAlpha = function(self, value) self.alpha = value end,
    SetSize = function(self, w, h) self.width, self.height = w, h end,
    SetHeight = function(self, h) self.height = h end,
    SetTexture = function(self, path) self.texture = path end,
    SetDesaturated = function(self, value) self.desaturated = value end,
    SetBackdropBorderColor = function(self, r, g, b, a) self.border = { r, g, b, a } end,
    EnableMouse = function(self, value) self.mouse = value end,
    GetFrameLevel = function() return 1 end,
    CreateFontString = function(self) local child = widget(state, "FontString"); table.insert(self.children, child); return child end,
    CreateTexture = function(self) local child = widget(state, "Texture"); table.insert(self.children, child); return child end,
  }
  if template == "MinimalSliderWithSteppersTemplate" then
    if state.noStepper then error("no stepper template") end
    methods.Init = function(self, value, min, max, steps, formatters) self.value, self.min, self.max, self.steps, self.formatters = value, min, max, steps, formatters end
    methods.RegisterCallback = function(self, _, fn) self.callback = fn end
    methods.SetValue = function(self, value) self.value = value end
  end
  setmetatable(object, { __index = function(_, key) return methods[key] or function() end end })
  table.insert(state.frames, object)
  return object
end

local function load(saved, options)
  options = options or {}
  local state = { frames = {}, printed = {}, calls = {}, noStepper = options.noStepper }
  WoWCompanionDB = saved
  print = function(text) table.insert(state.printed, text) end
  InCombatLockdown = function() return false end
  GetServerTime = function() return options.now or 0 end
  SettingsPanel = {}
  HideUIPanel = function(panel) state.hidden = panel end
  ReloadUI = function() state.calls.reload = true end
  ToggleCollectionsJournal = function(tab) state.calls.journal = tab end
  SlashCmdList = { WOWCOMPANIONOUTFIT = function() state.calls.outfit = true end }
  C_PetJournal = { HasFavoritePets = function() return options.favorites end }
  MinimalSliderWithSteppersMixin = { Label = { Right = 1 }, Event = { OnValueChanged = "changed" } }
  local handler
  CreateFrame = function(kind, _, _, template)
    local frame = widget(state, kind, template)
    if kind == "Frame" and not template and not state.login then frame.RegisterEvent = function(_, event) state.event = event end; frame.SetScript = function(_, _, fn) handler = fn end end
    return frame
  end
  Settings = {
    RegisterCanvasLayoutCategory = function(panel, name) state.panel, state.pageName = panel, name; state.page = { GetID = function() return 91 end }; return state.page end,
    RegisterAddOnCategory = function(page) state.registered = page end,
    OpenToCategory = function(id) state.opened = id end,
  }
  local ns = {
    petSettingChanged = function() state.calls.pet = (state.calls.pet or 0) + 1 end,
    previewSettingsChanged = function() state.calls.preview = (state.calls.preview or 0) + 1 end,
    showExport = function() state.calls.export = true end,
    command = function(message) state.calls.command = message end,
  }
  assert(loadfile("addon/Settings.lua"))("WoWCompanion", ns)
  state.ns = ns
  state.login = function() handler(nil, "PLAYER_LOGIN") end
  return state
end

local function texts(state)
  local found = {}
  for _, frame in ipairs(state.frames) do if frame.text then found[frame.text] = frame end end
  return found
end
local function byText(state, value)
  for _, frame in ipairs(state.frames) do if frame.text == value then return frame end end
end
-- A tile is the button whose name label reads this
local function tile(state, name)
  for _, frame in ipairs(state.frames) do
    if frame.kind == "Button" and frame.template == "BackdropTemplate" then
      for _, child in ipairs(frame.children) do if child.text == name then return frame end end
    end
  end
end
local function slider(state, index)
  local count = 0
  for _, frame in ipairs(state.frames) do
    if frame.template == "MinimalSliderWithSteppersTemplate" or (frame.kind == "Slider") then count = count + 1; if count == index then return frame end end
  end
end

test("registers the designed page with a header, every card, and the compartment opener", function()
  local state = load({ characters = { a = { name = "Dolimight", observedAt = "2026-11-16T12:00:00Z" }, b = { name = "Alwin", observedAt = "2026-11-15T12:00:00Z" } } }, { now = 1794830400 + 300 })
  state.login()
  check(state.registered == state.page and state.pageName == "WOW Companion", "page not registered")
  local all = texts(state)
  check(all["Version 0.5.0 · 2 characters saved · last snapshot Dolimight, 5 min ago"], "header summary wrong")
  for _, name in ipairs({ "Companion", "3D previews", "Desktop app", "Troubleshooting", "Auto-summon a favorite pet", "Show previews on hover", "Preview size", "Turn speed", "Copy export", "Save for the app", "Outfit preview", "Print details", "Pet Journal" }) do
    check(all[name], "missing " .. name)
  end
  for _, kind in ipairs(state.ns.SettingsPage.Kinds) do check(tile(state, kind.name), "missing tile " .. kind.name) end
  WoWCompanion_OnAddonCompartmentClick()
  check(state.opened == 91, "compartment button did not open the page")
end)

test("tiles toggle each preview kind, and turning previews off dims them", function()
  local saved = { settings = {} }
  local state = load(saved)
  state.login()
  local mounts = tile(state, "Mounts")
  mounts.scripts.OnClick(mounts)
  check(saved.settings.previews.mounts == false and state.calls.preview == 1, "tile did not turn mounts off")
  check(mounts.border[4] < 0.5, "an off tile still looks on")
  mounts.scripts.OnClick(mounts)
  check(saved.settings.previews.mounts == true, "tile did not turn mounts back on")
  -- The master switch is the second check button on the page
  local checks = {}
  for _, frame in ipairs(state.frames) do if frame.kind == "CheckButton" then table.insert(checks, frame) end end
  checks[2].checked = false
  checks[2].scripts.OnClick(checks[2])
  check(saved.settings.mountPreview == false, "master switch not saved")
  check(mounts.alpha == 0.4 and mounts.mouse == false and slider(state, 1).alpha == 0.4, "tiles and sliders not dimmed")
  -- Turning a kind on also turns previews back on, like the command does
  mounts.scripts.OnClick(mounts)
  mounts.scripts.OnClick(mounts)
  check(saved.settings.mountPreview == true, "turning a kind on left previews off")
end)

test("sliders save rounded values and the stage follows the size", function()
  local saved = { settings = { previewSize = 300 } }
  local state = load(saved)
  state.login()
  local size, spin = slider(state, 1), slider(state, 2)
  check(size.value == 300 and size.min == 180 and size.max == 360 and size.steps == 9, "size slider range")
  check(spin.min == 0 and spin.max == 1.5 and spin.formatters[1](0) == "Still", "turn speed range or label")
  size.callback(nil, 341)
  check(saved.settings.previewSize == 340 and state.calls.preview == 1, "size not rounded to a step")
  check(byText(state, "Preview at 340 px"), "stage caption did not follow")
  spin.callback(nil, 0.94)
  check(math.abs(saved.settings.previewSpin - 0.9) < 1e-9, "speed not rounded")
end)

test("falls back to a plain slider when the stepper template is missing", function()
  local saved = { settings = {} }
  local state = load(saved, { noStepper = true })
  state.login()
  local size = slider(state, 1)
  check(size.kind == "Slider", "no fallback slider")
  size.scripts.OnValueChanged(size, 200)
  check(saved.settings.previewSize == 200, "fallback slider did not save")
end)

test("status lines read favorites and the last capture's errors", function()
  local state = load({ captureErrors = { weekly = "boom", currencies = "nope" } }, { favorites = true })
  state.login()
  local all = texts(state)
  check(all["Favorites are marked · the game picks one at random"], "favorites status missing")
  local report = all["Could not read: currencies, weekly"]
  check(report and report.color[1] == 1, "capture errors not shown in red")
  local clean = load({}, { favorites = false })
  clean.login()
  local cleanTexts = texts(clean)
  check(cleanTexts["No favorites yet · star a pet in the Pet Journal"] and cleanTexts["The last snapshot read everything"], "empty status lines wrong")
end)

test("buttons open the export, reload, outfit, and Pet Journal, and print details", function()
  local state = load({ captureErrors = { weekly = "boom" } })
  state.login()
  local function click(label) local button = byText(state, label); button.scripts.OnClick(button) end
  click("Copy export")
  check(state.calls.export and state.hidden == SettingsPanel, "export not opened over a closed options window")
  click("Save for the app")
  check(state.calls.reload, "reload not requested")
  click("Outfit preview")
  check(state.calls.outfit, "outfit preview not opened")
  click("Pet Journal")
  check(state.calls.journal == 2, "Pet Journal tab not opened")
  click("Print details")
  check(state.calls.command == "mount debug" and state.printed[#state.printed] == "WOW Companion: capture of weekly failed: boom", "details not printed")
end)

test("Defaults restores every setting and tells the modules", function()
  local saved = { settings = { autoSummonPet = false, mountPreview = false, previewSize = 200, previewSpin = 0, previews = { pets = false } } }
  local state = load(saved)
  state.login()
  state.panel.OnDefault()
  local settings = saved.settings
  check(settings.autoSummonPet == nil and settings.mountPreview == nil and settings.previewSize == nil and settings.previewSpin == nil and settings.previews.pets == nil, "defaults not restored")
  check(state.calls.pet == 1 and state.calls.preview == 1, "modules not told")
  check(byText(state, "Preview at 260 px"), "stage did not reset")
end)

say(passed .. " settings canvas tests passed")
