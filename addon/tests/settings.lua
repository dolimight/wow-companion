-- Run from the repository root: lua addon/tests/settings.lua
-- Uses only Lua and a mocked Settings API; the real page still needs a Retail client check
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

-- A small stand-in for Blizzard's Settings API that keeps what the page registers
local function mockSettings(state)
  local function initializer(kind, data)
    local entry = { kind = kind, data = data }
    function entry.SetParentInitializer(self, parent, active) self.parent, self.active = parent, active end
    table.insert(state.controls, entry)
    return entry
  end
  local layout = { AddInitializer = function(_, entry) table.insert(state.controls, entry) end }
  Settings = {
    VarType = { Boolean = "boolean", Number = "number" },
    RegisterVerticalLayoutCategory = function(name)
      state.page = { name = name, GetID = function() return 77 end }
      return state.page, layout
    end,
    RegisterAddOnSetting = function(page, variable, key, tbl, kind, name, default)
      assert(page == state.page, "setting on another page")
      assert(type(tbl) == "table", "setting " .. variable .. " has no saved table")
      local setting = { variable = variable, key = key, tbl = tbl, kind = kind, name = name, default = default }
      function setting.GetValue(self) local value = self.tbl[self.key]; if value == nil then return self.default end return value end
      function setting.SetValue(self, value) self.tbl[self.key] = value; if self.changed then self.changed(self, value) end end
      function setting.SetValueChangedCallback(self, callback) self.changed = callback end
      state.settings[name] = setting
      return setting
    end,
    CreateCheckbox = function(_, setting, tip) local entry = initializer("checkbox", setting); entry.tip = tip; return entry end,
    CreateSliderOptions = function(min, max, step) return { min = min, max = max, step = step, SetLabelFormatter = function(self, _, label) self.label = label end } end,
    CreateSlider = function(_, setting, options, tip) local entry = initializer("slider", setting); entry.options, entry.tip = options, tip; return entry end,
    RegisterAddOnCategory = function(page) state.registered = page; state.registrations = (state.registrations or 0) + 1 end,
    OpenToCategory = function(id) state.opened = id end,
  }
  MinimalSliderWithSteppersMixin = { Label = { Right = 1 } }
  CreateSettingsListSectionHeaderInitializer = function(text) return { kind = "header", text = text } end
  CreateSettingsButtonInitializer = function(name, text, click, tip) return { kind = "button", name = name, text = text, click = click, tip = tip } end
end

local function load(saved, options)
  options = options or {}
  local state = { controls = {}, settings = {}, printed = {}, calls = {} }
  WoWCompanionDB = saved
  print = function(text) table.insert(state.printed, text) end
  InCombatLockdown = function() return state.combat end
  SettingsPanel = {}
  HideUIPanel = function(panel) state.hidden = panel end
  SlashCmdList = { WOWCOMPANIONOUTFIT = function() state.calls.outfit = true end }
  Settings, CreateSettingsListSectionHeaderInitializer, CreateSettingsButtonInitializer = nil, nil, nil
  if not options.noApi then mockSettings(state) end
  local handler
  CreateFrame = function() return { RegisterEvent = function(_, event) state.event = event end, SetScript = function(_, _, fn) handler = fn end } end
  local ns = {
    petSettingChanged = function() state.calls.pet = (state.calls.pet or 0) + 1 end,
    previewSettingsChanged = function() state.calls.preview = (state.calls.preview or 0) + 1 end,
    showExport = function() state.calls.export = true end,
    command = function(message) state.calls.command = message; return true end,
  }
  assert(loadfile("addon/Settings.lua"))("WoWCompanion", ns)
  state.ns = ns
  state.login = function() handler(nil, "PLAYER_LOGIN") end
  return state
end

local function find(state, kind, label)
  for _, entry in ipairs(state.controls) do
    if entry.kind == kind and (entry.text == label or entry.name == label or (entry.data and entry.data.name == label)) then return entry end
  end
end

test("registers one page at login with every setting and action", function()
  local state = load({ characters = { a = {}, b = {} } })
  check(state.event == "PLAYER_LOGIN" and state.page == nil, "registered before login")
  state.login()
  check(state.registered == state.page and state.page.name == "WOW Companion", "page not registered")
  check(find(state, "header", "Version 0.4.9 · 2 characters saved"), "missing version header")
  for _, name in ipairs({ "Auto-summon a favorite pet", "Show previews on hover", "Mounts", "Battle pets", "Appearance sets", "Gear", "Housing decor" }) do
    check(find(state, "checkbox", name), "missing switch " .. name)
  end
  check(find(state, "slider", "Preview size") and find(state, "slider", "Turn speed"), "missing sliders")
  check(find(state, "button", "Export") and find(state, "button", "Outfit preview") and find(state, "button", "Diagnostics"), "missing buttons")
  state.login()
  check(state.registrations == 1, "registered the page twice")
end)

test("switches use the same saved keys as the commands", function()
  local saved = { settings = { autoSummonPet = false, previews = { pets = false } } }
  local state = load(saved)
  state.login()
  local pet, pets, master = state.settings["Auto-summon a favorite pet"], state.settings["Battle pets"], state.settings["Show previews on hover"]
  check(pet.tbl == saved.settings and pet.key == "autoSummonPet" and pet:GetValue() == false, "pet switch not reading the saved value")
  check(pets.tbl == saved.settings.previews and pets:GetValue() == false, "pet preview switch not reading the saved value")
  check(master.key == "mountPreview" and master:GetValue() == true, "previews should default to on")
  -- A command writes the table directly, and the page reads the same table
  saved.settings.autoSummonPet = true
  check(pet:GetValue() == true, "command change not visible on the page")
end)

test("changing a switch tells the module so it acts right away", function()
  local saved = { settings = {} }
  local state = load(saved)
  state.login()
  state.settings["Auto-summon a favorite pet"]:SetValue(true)
  check(saved.settings.autoSummonPet == true and state.calls.pet == 1, "pet module not told")
  state.settings["Gear"]:SetValue(false)
  check(saved.settings.previews.items == false and state.calls.preview == 1, "preview module not told")
  state.settings["Preview size"]:SetValue(300)
  check(saved.settings.previewSize == 300 and state.calls.preview == 2, "size change not passed on")
end)

test("kind switches and sliders gray out while previews are off", function()
  local saved = { settings = {} }
  local state = load(saved)
  state.login()
  local master = find(state, "checkbox", "Show previews on hover")
  for _, name in ipairs({ "Mounts", "Housing decor" }) do
    local entry = find(state, "checkbox", name)
    check(entry.parent == master and entry.active() == true, name .. " not under the master switch")
  end
  local size = find(state, "slider", "Preview size")
  check(size.parent == master, "size slider not under the master switch")
  saved.settings.mountPreview = false
  check(size.active() == false, "size slider still active while previews are off")
end)

test("sliders offer the documented ranges and labels", function()
  local state = load({})
  state.login()
  local size, speed = find(state, "slider", "Preview size"), find(state, "slider", "Turn speed")
  check(size.options.min == 180 and size.options.max == 360 and size.data.default == 260, "size range")
  check(speed.options.min == 0 and speed.options.max == 1.5 and speed.data.default == 0.6, "speed range")
  check(speed.options.label(0) == "Still" and speed.options.label(0.6) == "0.6", "speed labels")
end)

test("buttons open the export and outfit windows and print diagnostics", function()
  local saved = { captureErrors = { weekly = "boom" } }
  local state = load(saved)
  state.login()
  find(state, "button", "Export").click()
  check(state.calls.export and state.hidden == SettingsPanel, "export not opened over a closed options window")
  find(state, "button", "Outfit preview").click()
  check(state.calls.outfit, "outfit preview not opened")
  find(state, "button", "Diagnostics").click()
  check(state.calls.command == "mount debug", "preview debug not printed")
  check(state.printed[#state.printed] == "WOW Companion: capture of weekly failed: boom", "capture errors not printed")
end)

test("the settings command opens the page and leaves other commands alone", function()
  local state = load({})
  state.login()
  check(state.ns.settingsCommand("settings") == true and state.opened == 77, "page not opened")
  check(state.ns.settingsCommand("options") == true and state.ns.settingsCommand("config") == true, "aliases missing")
  check(state.ns.settingsCommand("") == false and state.ns.settingsCommand("pet off") == false, "took over another command")
  state.opened = nil
  state.combat = true
  state.ns.settingsCommand("settings")
  check(state.opened == nil and state.printed[#state.printed] == "WOW Companion: leave combat before opening settings", "opened in combat")
end)

test("a client without the settings page keeps the commands working", function()
  local state = load({}, { noApi = true })
  state.login()
  check(state.ns.settingsCommand("settings") == true, "command not handled")
  check(state.printed[#state.printed] == "WOW Companion: settings are unavailable: this client has no add-on settings page", "no explanation printed")
end)

test("a failing Settings API never escapes login", function()
  local state = load({})
  Settings.RegisterAddOnSetting = function() error("changed signature") end
  state.login()
  check(state.registered == nil, "registered a broken page")
  state.ns.settingsCommand("settings")
  check(state.printed[#state.printed]:find("changed signature"), "error not reported")
end)

say(passed .. " tests passed")
