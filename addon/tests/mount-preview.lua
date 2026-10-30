-- Run from the repository root: lua addon/tests/mount-preview.lua
-- Uses only Lua and mocked WoW APIs; never reads installed addon data
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

local function region(name)
  local frame = { name = name, points = {}, shown = true, scripts = {}, hooks = {} }
  local methods = {}
  function methods.SetSize(self, width, height) self.width, self.height = width, height end
  function methods.SetFrameStrata() end
  function methods.SetBackdrop() end
  function methods.SetBackdropColor() end
  function methods.SetPoint(self, ...) table.insert(self.points, { ... }) end
  function methods.ClearAllPoints(self) self.points = {} end
  function methods.SetWidth() end
  function methods.RegisterEvent() end
  function methods.SetAllPoints() end
  function methods.SetFrameLevel() end
  function methods.GetFrameLevel() return 1 end
  function methods.IsMouseOver(self) return self.hovered ~= false end
  function methods.IsShown(self) return self.shown end
  function methods.IsVisible(self) return self.shown end
  function methods.GetLeft(self) return self.points[1] and self.points[1][4] or nil end
  function methods.GetTop(self) return self.points[1] and self.points[1][5] or nil end
  function methods.GetWidth(self) return self.width or 240 end
  function methods.GetHeight(self) return self.height or 290 end
  function methods.GetRect(self) if self.rect then return self.rect[1], self.rect[2], self.rect[3], self.rect[4] end end
  function methods.GetOwner(self) return self.owner end
  function methods.GetItem(self) return "name", self.link, 1 end
  function methods.SetCamDistanceScale(self, scale) self.cameraDistance = scale end
  function methods.RefreshCamera(self) self.refreshed = (self.refreshed or 0) + 1 end
  function methods.SetPortraitZoom(self, zoom) self.zoom = zoom end
  function methods.GetName(self) return self.name end
  function methods.GetEffectiveAlpha() return 1 end
  function methods.GetNumPoints(self) return #self.points end
  function methods.SetText(self, text) self.text = text end
  function methods.Show(self) self.shown = true end
  function methods.Hide(self) self.shown = false end
  function methods.SetScript(self, event, callback) self.scripts[event] = callback end
  function methods.HookScript(self, event, callback) self.hooks[event] = callback end
  function methods.CreateFontString() return region() end
  function methods.ClearModel(self) self.cleared = (self.cleared or 0) + 1 end
  function methods.SetDisplayInfo(self, id) self.display = id end
  function methods.SetUnit(self, unit) self.unit = unit; self.worn = {} end
  function methods.Undress(self) self.undressed = true end
  function methods.SetAnimation(self, id) self.animation = id end
  function methods.FreezeAnimation(self) self.frozen = true end
  function methods.SetPaused(self, paused) self.paused = paused end
  function methods.TryOn(self, source) table.insert(self.worn, source) end
  function methods.SetPosition() end
  function methods.SetRotation(self, value) self.rotation = value end
  function methods.GetEffectiveScale() return 1 end
  function methods.IsForbidden() return false end
  return setmetatable(frame, { __index = methods })
end

local function load(saved)
  local state = { calls = 0, mounts = { [100] = { mountID = 7, display = 5555, name = "Test Drake", collected = true }, [200] = { mountID = 8, display = 6666, name = "Rare Cat", collected = false } } }
  WoWCompanionDB = saved
  print = function(text) state.printed = text end
  Enum = { TooltipDataType = { Item = 0 }, HousingCatalogEntryType = { Decor = 1 } }
  C_HousingCatalog = nil
  UIParent = region("UIParent")
  UIParent.width, UIParent.height = 1920, 1080
  GetCursorPosition = function() return 500, 400 end
  GetMouseFoci = function() return { state.focus } end
  state.focus = region("HoveredItemButton")
  state.timers = {}
  C_Timer = { After = function(_, callback) table.insert(state.timers, callback) end }
  function state.flush()
    local timers = state.timers
    state.timers = {}
    for _, callback in ipairs(timers) do callback() end
  end
  CreateFrame = function(kind, name, parent, template)
    local frame = region(name)
    frame.kind = kind
    frame.template = template
    if kind == "ModelScene" then
      frame.actor = region()
      function frame.actor:SetModelByFileID(asset) self.asset = asset; self.loads = (self.loads or 0) + 1 end
      function frame.actor:SetYaw(yaw) self.yaw = yaw end
      function frame:SetFromModelSceneID(id) self.sceneID = id end
      function frame:GetActorByTag(tag) if tag == "decor" and not state.missingActor then return self.actor end end
    end
    state.created = (state.created or 0) + 1
    if name then state[name] = frame end
    return frame
  end
  C_MountJournal = {
    GetMountFromItem = function(itemID) local mount = state.mounts[itemID]; return mount and mount.mountID or nil end,
    GetMountInfoExtraByID = function(mountID) for _, mount in pairs(state.mounts) do if mount.mountID == mountID then return mount.display end end end,
    GetMountInfoByID = function(mountID)
      for _, mount in pairs(state.mounts) do
        if mount.mountID == mountID then return mount.name, 1, 1, false, true, 1, false, false, nil, false, mount.collected, mountID end
      end
    end,
  }
  C_Item = { GetItemLearnTransmogSet = function(itemID) return itemID == 300 and 42 or nil end, GetItemNameByID = function() return "Ensemble: Test Guardplate" end, IsDressableItemByID = function(itemID) return itemID == 500 end }
  C_PetJournal = {
    GetPetInfoByItemID = function(itemID) if itemID == 400 then return "Test Whelp", 1, 1, 77, "", "", false, true, true, false, true, 8888, 321 end end,
    GetNumCollectedInfo = function(species) return species == 321 and 1 or 0, 3 end,
  }
  C_TransmogSets = { GetAllSourceIDs = function(setID) return setID == 42 and { 11, 12, 13 } or {} end }
  C_TransmogCollection = {
    GetSourceInfo = function(source) return { isCollected = source == 11 } end,
    GetItemInfo = function() return 1, 99 end,
    PlayerHasTransmogItemModifiedAppearance = function(source) return source == 99 end,
  }
  TooltipDataProcessor = { AddTooltipPostCall = function(kind, callback)
    state.kind = kind
    state.rawCallback = callback
    state.callback = function(tooltip, data) callback(tooltip, data); state.flush() end
  end }
  local ns = {}
  assert(loadfile("addon/MountPreview.lua"))("WoWCompanion", ns)
  state.ns = ns
  -- The addon's own login listener is not part of what the tests count
  state.created = nil
  return state
end

test("registers on item tooltips only", function()
  local state = load({})
  check(state.kind == Enum.TooltipDataType.Item and state.callback, "missing item tooltip hook")
end)

test("shows the mount display beside a mount item tooltip", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 100 })
  check(state.created == 4, "expected a frame, two models, and a label layer")
end)

test("a refreshed tooltip does not reload the model and a second mount does", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  local models = {}
  local original = CreateFrame
  CreateFrame = function(kind, ...)
    local frame = original(kind, ...)
    if kind == "PlayerModel" then models[#models + 1] = frame end
    return frame
  end
  state.callback(tooltip, { id = 100 })
  local model = models[1]
  check(model and model.display == 5555 and model.cleared == 1, "first mount not loaded")
  check(model.frozen and model.paused and model.animation == 0 and model.scripts.OnModelLoaded, "mount still animates")
  state.callback(tooltip, { id = 100 })
  check(model.cleared == 1, "model reloaded on refresh")
  state.callback(tooltip, { id = 200 })
  check(model.display == 6666 and model.cleared == 2, "second mount not loaded")
end)

test("non-mount items and secret values leave tooltips alone", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 999 })
  check(state.created == nil, "frame built for a non-mount item")
  state.callback(tooltip, nil)
  state.callback(nil, { id = 100 })
  issecretvalue = function() return true end
  state.callback(tooltip, { id = 100 })
  issecretvalue = nil
  check(state.created == nil, "secret item id was read")
end)

test("errors from the game never escape the tooltip hook", function()
  local state = load({})
  CreateFrame = function() error("boom") end
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 100 })
  check(state.ns.mountPreviewError, "error was not recorded")
end)

test("mount command stores the preference and hides the preview", function()
  local saved = {}
  local state = load(saved)
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 100 })
  check(state.ns.command("mount off") == true, "command not handled")
  check(saved.settings.mountPreview == false and state.printed == "WOW Companion mount preview off", "off not saved")
  local created = state.created
  state.callback(tooltip, { id = 100 })
  check(state.created == created, "preview built while off")
  check(state.ns.command("mount") == true and saved.settings.mountPreview == true, "toggle failed")
  check(state.ns.command("export") == false and state.ns.command("") == false, "other commands must fall through")
end)

test("debug reports what the last hover found", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 999 })
  check(state.ns.last == "item 999: housing catalog unavailable, not a mount item, not an appearance set, not a pet item, not wearable", "reason missing")
  state.callback(tooltip, { id = 100 })
  check(state.ns.last == "item 100: mount display 5555", "mount not reported")
  check(state.ns.command("mount debug") == true and state.printed:find("hooked=true", 1, true) and state.printed:find("tooltips seen=2", 1, true), "debug summary wrong")
end)

test("diagnostics are written to the saved data", function()
  local saved = {}
  local state = load(saved)
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 100 })
  check(saved.mountDebug and saved.mountDebug.hooked and saved.mountDebug.shown and saved.mountDebug.getMountFromItem, "debug missing")
  check(saved.mountDebug.last == "item 100: mount display 5555" and saved.mountDebug.point == 1, "debug incomplete")
end)

test("sits below the hovered item, then beside the tooltip, then by the cursor", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  -- The tooltip's owner is the whole vendor window, which must not be mistaken for the item
  tooltip.owner = region("MerchantFrame")
  tooltip.owner.rect = { 50, 400, 340, 600 }
  tooltip.rect = { 100, 600, 300, 120 }
  state.focus = region("MerchantItem3ItemButton")
  state.focus.rect = { 600, 500, 150, 40 }
  state.callback(tooltip, { id = 100 })
  local point = state.WoWCompanionMountPreview.points[1]
  check(point[1] == "TOPLEFT" and point[2] == UIParent and point[3] == "BOTTOMLEFT", "not anchored to the screen")
  check(state.ns.placedBy == "item" and point[4] == 600 and point[5] == 496, "not below the item")
  state.focus.rect = { 600, 100, 150, 40 }
  state.callback(tooltip, { id = 100 })
  check(state.WoWCompanionMountPreview.points[1][5] == 100 + 40 + 4 + 260, "did not open above near the bottom")
  state.ns.hide()
  state.focus = tooltip.owner
  state.callback(tooltip, { id = 100 })
  check(state.ns.placedBy == "tooltip" and state.WoWCompanionMountPreview.points[1][4] == 404, "window treated as the item")
  state.ns.hide()
  tooltip.rect, state.focus = nil, nil
  state.callback(tooltip, { id = 100 })
  check(state.ns.placedBy == "cursor" and state.WoWCompanionMountPreview.points[1][4] == 524, "cursor not used")
end)

test("is square", function()
  local state = load({})
  check(state.WoWCompanionMountPreview == nil, "built before a hover")
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 100 })
  local frame = state.WoWCompanionMountPreview
  check(frame.width == frame.height and frame.width == 260, "not square")
end)

test("follows the item and hides when the tooltip goes away or the cursor leaves", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  state.focus = region("Button")
  state.focus.rect = { 600, 300, 150, 40 }
  tooltip.shown = true
  state.callback(tooltip, { id = 100 })
  local preview = state.WoWCompanionMountPreview
  state.focus.rect = { 700, 300, 150, 40 }
  preview.scripts.OnUpdate(preview, 0.2)
  check(preview.shown and preview.points[1][4] == 700, "did not follow the item")
  state.focus.hovered = false
  preview.scripts.OnUpdate(preview, 0.2)
  check(not preview.shown, "stayed after the cursor left the item")
  state.focus.hovered = true
  state.callback(tooltip, { id = 100 })
  check(preview.shown, "did not return on the next hover")
  tooltip.shown = false
  preview.scripts.OnUpdate(preview, 0.2)
  check(not preview.shown, "stayed after the tooltip hid")
end)

test("an ensemble is tried on the player and counts collected appearances", function()
  local state = load({})
  local dress
  local original = CreateFrame
  CreateFrame = function(kind, ...)
    local frame = original(kind, ...)
    if kind == "DressUpModel" then dress = frame end
    return frame
  end
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 300 })
  local preview = state.WoWCompanionMountPreview
  check(dress and dress.unit == "player" and dress.undressed, "player not dressed: " .. tostring(state.ns.last) .. " " .. tostring(state.ns.mountPreviewError))
  check(#dress.worn == 3 and dress.worn[1] == 11 and dress.worn[3] == 13, "set not tried on")
  check(dress.shown and not preview.model.shown, "wrong model shown")
  check(preview.title.text == "Ensemble: Test Guardplate", "title missing")
  check(preview.status.text:find("1 of 3 appearances collected", 1, true), "count missing")
  check(state.ns.last == "item 300: set:42 with 3 appearances", "debug missing")
  state.callback(tooltip, { id = 100 })
  check(preview.model.shown and not dress.shown and preview.model.display == 5555, "mount did not replace the set")
end)

test("a pet item shows the pet with how many you own", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 400 })
  local preview = state.WoWCompanionMountPreview
  check(preview.model.shown and preview.model.display == 8888, "pet not shown")
  check(preview.title.text == "Test Whelp" and preview.status.text:find("1 of 3 collected", 1, true), "pet labels wrong")
end)

test("wearable gear is tried on by itself and skips comparison tooltips", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 500, hyperlink = "|Hitem:500::|h[Test Helm]|h" })
  local preview = state.WoWCompanionMountPreview
  check(preview.dress.shown and preview.dress.unit == "player" and preview.dress.undressed, "current gear not removed")
  check(preview.dress.worn[1] == "|Hitem:500::|h[Test Helm]|h", "wrong item tried on")
  check(preview.title.text == "Test Helm" and preview.status.text:find("Appearance collected", 1, true), "item labels wrong")
  local compare = region("ShoppingTooltip1")
  state.callback(compare, { id = 100 })
  check(preview.dress.shown and preview.key == "item:|Hitem:500::|h[Test Helm]|h", "comparison tooltip replaced the preview")
end)

test("each kind can be turned off on its own", function()
  local saved = {}
  local state = load(saved)
  check(state.ns.command("preview items off") == true and saved.settings.previews.items == false, "items not turned off")
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  state.callback(tooltip, { id = 500 })
  check(state.created == nil, "item shown while off")
  state.callback(tooltip, { id = 100 })
  check(state.WoWCompanionMountPreview.shown, "mounts stopped with items")
  check(state.ns.command("preview items on") == true and saved.settings.previews.items == true, "items not turned back on")
end)

test("a tooltip that blinks while rebuilding does not make the preview flicker", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  tooltip.shown = true
  state.callback(tooltip, { id = 100 })
  local preview = state.WoWCompanionMountPreview
  local cleared = preview.model.cleared
  tooltip.shown = false
  preview.scripts.OnUpdate(preview, 0.05)
  check(preview.shown, "hid during a brief rebuild")
  tooltip.shown = true
  state.callback(tooltip, { id = 100 })
  preview.scripts.OnUpdate(preview, 0.05)
  check(preview.shown and preview.model.cleared == cleared, "model reloaded during a rebuild")
  tooltip.shown = false
  preview.scripts.OnUpdate(preview, 0.1)
  preview.scripts.OnUpdate(preview, 0.1)
  check(not preview.shown and state.ns.hideReason == "tooltip hidden", "stayed after the tooltip really closed")
end)

test("moves beside the tooltip when the tooltip covers the spot below the item", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  state.focus = region("CharacterHeadSlot")
  state.focus.rect = { 60, 800, 40, 40 }
  -- The tooltip opens to the right of the slot and runs down over where the preview would go
  tooltip.rect = { 100, 400, 250, 440 }
  state.callback(tooltip, { id = 100 })
  local point = state.WoWCompanionMountPreview.points[1]
  check(state.ns.placedBy == "tooltip" and point[4] == 354 and point[5] == 840, "overlapped the tooltip")
end)

test("uses the tooltip's exact item link when the data has none", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  tooltip.link = "|Hitem:500::::::::90:250::6:1:1234|h[Hero Helm]|h"
  state.callback(tooltip, { id = 500 })
  local preview = state.WoWCompanionMountPreview
  check(preview.dress.worn[1] == tooltip.link and preview.title.text == "Hero Helm", "base item used instead of the exact one")
  check(preview.dress.cameraDistance == 1.1 and preview.dress.zoom == 0 and preview.dress.refreshed == 1, "camera not framed")
  preview.dress.scripts.OnModelLoaded(preview.dress)
  check(preview.dress.refreshed == 2 and preview.dress.cameraDistance == 1.1 and preview.dress.paused, "camera not reframed after loading")
end)

local function housing(state, changes)
  local info = { entryType = Enum.HousingCatalogEntryType.Decor, asset = 123456, name = "Test Chair", totalNumStored = 2, totalNumPlaced = 1, remainingRedeemable = 3 }
  for key, value in pairs(changes or {}) do info[key] = value end
  C_HousingCatalog = { GetCatalogEntryInfoByItem = function(id) if id == 600 then return info end end }
  local tooltip = region("GameTooltip")
  tooltip.rect = { 100, 600, 300, 120 }
  return tooltip, info
end

test("housing decor uses a model scene file asset and reported ownership", function()
  local state = load({})
  local tooltip = housing(state)
  state.callback(tooltip, { id = 600 })
  local preview = state.WoWCompanionMountPreview
  check(preview.shown and preview.housing.shown and not preview.model.shown and not preview.dress.shown, "wrong model visible")
  check(preview.housing.template == "NonInteractableModelSceneMixinTemplate" and preview.housing.sceneID == 691, "wrong housing scene")
  check(preview.housing.actor.asset == 123456 and preview.housing.actor.loads == 1, "asset treated as a creature display")
  check(preview.title.text == "Test Chair" and preview.status.text == "6 owned", "housing facts incorrect")
  state.callback(tooltip, { id = 600 })
  check(preview.housing.actor.loads == 1, "refresh reloaded decor")
  preview.scripts.OnUpdate(preview, 0.1)
  check(preview.housing.actor.yaw > 0, "decor does not turn")
end)

test("housing honors its custom scene and unknown ownership", function()
  local state = load({})
  local tooltip, info = housing(state, { uiModelSceneID = 777 })
  info.remainingRedeemable = nil
  state.callback(tooltip, { id = 600 })
  local preview = state.WoWCompanionMountPreview
  check(preview.housing.sceneID == 777 and preview.status.text:find("Ownership unknown", 1, true), "guessed ownership or ignored scene")
end)

test("housing does not invent ownership when zero copies are reported", function()
  local state = load({})
  local tooltip = housing(state, { totalNumStored = 0, totalNumPlaced = 0, remainingRedeemable = 0 })
  state.callback(tooltip, { id = 600 })
  check(state.WoWCompanionMountPreview.status.text == "0 owned", "zero treated as unknown")
end)

test("switching between decor mounts and gear hides the previous renderer", function()
  local state = load({})
  local tooltip = housing(state)
  state.callback(tooltip, { id = 600 })
  local preview = state.WoWCompanionMountPreview
  state.callback(tooltip, { id = 100 })
  check(not preview.housing.shown and not preview.housingActor and preview.model.shown, "decor leaked into mount")
  state.callback(tooltip, { id = 600 })
  state.callback(tooltip, { id = 500 })
  check(not preview.housing.shown and preview.dress.shown and not preview.housingActor, "decor leaked into gear")
end)

test("housing preference is independent and the global switch still applies", function()
  local saved = {}
  local state = load(saved)
  local tooltip = housing(state)
  state.callback(tooltip, { id = 600 })
  state.ns.command("preview housing off")
  check(saved.settings.previews.housing == false and not state.WoWCompanionMountPreview.shown, "housing off did not hide")
  state.callback(tooltip, { id = 100 })
  check(state.WoWCompanionMountPreview.model.shown, "mounts disabled with housing")
  state.ns.command("preview housing on")
  state.ns.command("mount off")
  state.callback(tooltip, { id = 600 })
  check(not state.WoWCompanionMountPreview.shown, "housing ignored global switch")
end)

test("missing and failing housing APIs preserve ordinary previews", function()
  local state = load({})
  C_HousingCatalog = { GetCatalogEntryInfoByItem = function() error("unavailable") end }
  local tooltip = region("GameTooltip")
  state.callback(tooltip, { id = 100 })
  check(state.WoWCompanionMountPreview.model.display == 5555 and not state.ns.mountPreviewError, "housing error broke mount preview")
end)

test("missing unsupported and secret housing assets never build a preview", function()
  for _, asset in ipairs({ false, 0, "hidden" }) do
    local state = load({})
    local tooltip = housing(state, { asset = asset })
    issecretvalue = function(value) return value == "hidden" end
    state.callback(tooltip, { id = 600 })
    issecretvalue = nil
    check(not state.WoWCompanionMountPreview, "invalid asset reached rendering")
  end
  local state = load({})
  local tooltip = housing(state, { entryType = 99 })
  state.callback(tooltip, { id = 600 })
  check(not state.WoWCompanionMountPreview, "non-decor catalog entry shown")
end)

test("failed decor scene hides stale models and can recover", function()
  local state = load({})
  local tooltip = housing(state)
  state.callback(tooltip, { id = 100 })
  state.missingActor = true
  state.callback(tooltip, { id = 600 })
  check(not state.WoWCompanionMountPreview.shown and state.ns.mountPreviewError, "scene failure left stale preview")
  state.missingActor = false
  state.callback(tooltip, { id = 600 })
  check(state.WoWCompanionMountPreview.housing.shown, "failed scene could not retry")
end)

test("login processing with no UI hover cannot open a preview", function()
  local state = load({})
  state.focus = UIParent
  local tooltip = region("GameTooltip")
  tooltip.owner = UIParent
  state.callback(tooltip, { id = 100 })
  check(not state.WoWCompanionMountPreview, "login opened a preview without a hover")
end)

test("hidden scanning tooltips never open a preview even while hovering UI", function()
  local state = load({})
  local tooltip = region("HiddenScanTooltip")
  tooltip:Hide()
  state.callback(tooltip, { id = 100 })
  check(not state.WoWCompanionMountPreview, "hidden scan opened a preview")
end)

test("first hover waits for tooltip Show and skips stale queued item data", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  tooltip:Hide()
  state.rawCallback(tooltip, { id = 100 })
  check(not state.WoWCompanionMountPreview, "preview opened before tooltip Show")
  state.rawCallback(tooltip, { id = 200 })
  tooltip:Show()
  state.flush()
  check(state.WoWCompanionMountPreview.model.display == 6666 and state.ns.shows == 1, "stale item flashed before latest hover")
end)

test("leaving the item before deferred processing does not show a preview", function()
  local state = load({})
  local tooltip = region("GameTooltip")
  state.rawCallback(tooltip, { id = 100 })
  state.focus = nil
  state.flush()
  check(not state.WoWCompanionMountPreview, "preview opened after hover ended")
end)

test("clicked chat item links still preview without a hovered item", function()
  local state = load({})
  state.focus = nil
  local tooltip = region("ItemRefTooltip")
  state.callback(tooltip, { id = 100 })
  check(state.WoWCompanionMountPreview.model.display == 5555, "clicked chat link lost its preview")
end)

say(passed .. " tests passed")
