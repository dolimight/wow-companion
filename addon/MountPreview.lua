-- Shows a slowly turning 3D model below hovered items: the mount or battle pet an item teaches, your character
-- wearing the appearance set an ensemble or arsenal teaches, or your character trying on a piece of gear by itself
-- The game draws the model itself from its own files, so nothing is downloaded or extracted
local _, ns = ...
ns = ns or {}

local SIZE = 260
local WIDTH, HEIGHT = SIZE, SIZE
local SPIN = 0.6
local preview

local function readable(value)
  return value ~= nil and not (issecretvalue and issecretvalue(value))
end

local kinds = { mounts = "mount", pets = "pet", sets = "set", items = "item", housing = "housing" }
-- Tooltips briefly hide and rebuild while item data loads or refreshes; waiting this long before hiding stops flicker
local GRACE = 0.15

local function enabled(kind)
  local settings = WoWCompanionDB and WoWCompanionDB.settings
  if settings and settings.mountPreview == false then return false end
  return not (kind and settings and settings.previews and settings.previews[kind] == false)
end

-- Housing assets are model file IDs, not creature display IDs
local function housingForItem(itemID)
  local catalog = C_HousingCatalog
  if not (catalog and catalog.GetCatalogEntryInfoByItem) then return nil, "housing catalog unavailable" end
  local ok, info = pcall(catalog.GetCatalogEntryInfoByItem, itemID)
  if not ok or type(info) ~= "table" then return nil, "not a housing item" end
  if not (Enum and Enum.HousingCatalogEntryType and readable(info.entryType)
    and info.entryType == Enum.HousingCatalogEntryType.Decor) then return nil, "not housing decor" end
  if not readable(info.asset) or type(info.asset) ~= "number" or info.asset <= 0 then return nil, "housing model unavailable" end
  local sceneID = readable(info.uiModelSceneID) and type(info.uiModelSceneID) == "number" and info.uiModelSceneID > 0 and info.uiModelSceneID or 691
  local owned
  if readable(info.totalNumStored) and type(info.totalNumStored) == "number"
    and readable(info.totalNumPlaced) and type(info.totalNumPlaced) == "number"
    and readable(info.remainingRedeemable) and type(info.remainingRedeemable) == "number" then
    owned = info.totalNumStored + info.totalNumPlaced + info.remainingRedeemable
  end
  return { kind = "housing", key = "housing:" .. tostring(info.asset) .. ":" .. tostring(sceneID),
    asset = info.asset, sceneID = sceneID, name = readable(info.name) and info.name or nil, owned = owned }
end

-- Returns the creature display, mount name, and collection state for an item that teaches a mount
local function mountForItem(itemID)
  local journal = C_MountJournal
  if not (journal and journal.GetMountFromItem and journal.GetMountInfoExtraByID and journal.GetMountInfoByID) then return nil, "mount journal unavailable" end
  local ok, mountID = pcall(journal.GetMountFromItem, itemID)
  if not ok then return nil, "GetMountFromItem failed: " .. tostring(mountID) end
  if not readable(mountID) or mountID == 0 then return nil, "not a mount item" end
  local found, displayID = pcall(journal.GetMountInfoExtraByID, mountID)
  if not found then return nil, "GetMountInfoExtraByID failed: " .. tostring(displayID) end
  if not readable(displayID) or displayID == 0 then return nil, "mount " .. tostring(mountID) .. " has no display" end
  local read, name, _, _, _, _, _, _, _, _, _, collected = pcall(journal.GetMountInfoByID, mountID)
  if not read then name, collected = nil, nil end
  return { kind = "mount", key = "mount:" .. tostring(displayID), displayID = displayID, name = name, collected = collected }
end

-- Returns the appearances and collection count for an ensemble or arsenal, which teach a whole appearance set
local function setForItem(itemID)
  local learn = C_Item and C_Item.GetItemLearnTransmogSet
  local sets = C_TransmogSets
  if not (learn and sets and sets.GetAllSourceIDs) then return nil, "appearance sets unavailable" end
  local ok, setID = pcall(learn, itemID)
  if not ok or not readable(setID) or not setID or setID == 0 then return nil, "not an appearance set" end
  local found, sources = pcall(sets.GetAllSourceIDs, setID)
  if not found or type(sources) ~= "table" or #sources == 0 then return nil, "set " .. tostring(setID) .. " has no appearances" end
  local collected, known = 0, 0
  local info = C_TransmogCollection and C_TransmogCollection.GetSourceInfo
  if info then
    for _, source in ipairs(sources) do
      local read, detail = pcall(info, source)
      if read and type(detail) == "table" and readable(detail.isCollected) then
        known = known + 1
        if detail.isCollected then collected = collected + 1 end
      end
    end
  end
  local name = C_Item.GetItemNameByID and C_Item.GetItemNameByID(itemID)
  if not readable(name) then name = nil end
  return { kind = "set", key = "set:" .. tostring(setID), sources = sources, name = name, collected = known == #sources and collected or nil, total = #sources }
end

-- Returns the creature display and collection count for an item that teaches a battle pet
local function petForItem(itemID)
  local journal = C_PetJournal
  if not (journal and journal.GetPetInfoByItemID) then return nil, "pet journal unavailable" end
  local ok, name, _, _, _, _, _, _, _, _, _, _, displayID, speciesID = pcall(journal.GetPetInfoByItemID, itemID)
  if not ok or not readable(displayID) or not displayID or displayID == 0 then return nil, "not a pet item" end
  local collected, limit
  if journal.GetNumCollectedInfo and readable(speciesID) and speciesID then
    local read, count, most = pcall(journal.GetNumCollectedInfo, speciesID)
    if read and readable(count) and readable(most) then collected, limit = count, most end
  end
  return { kind = "pet", key = "pet:" .. tostring(displayID), displayID = displayID, name = readable(name) and name or nil, collected = collected, limit = limit }
end

-- Returns the link for gear that has an appearance so it can be tried on; rings, trinkets, and other gear
-- without a look are skipped
local function gearForItem(itemID, link, tooltip)
  local dressable = C_Item and C_Item.IsDressableItemByID or IsDressableItem
  if not dressable then return nil, "try-on unavailable" end
  local ok, wearable = pcall(dressable, itemID)
  if not ok or not readable(wearable) or not wearable then return nil, "not wearable" end
  -- The exact link keeps the upgrade track and difficulty, which can change the look
  if (not readable(link) or type(link) ~= "string") and tooltip and tooltip.GetItem then
    local read, _, itemLink = pcall(tooltip.GetItem, tooltip)
    if read and readable(itemLink) then link = itemLink end
  end
  if not readable(link) or type(link) ~= "string" then link = "item:" .. tostring(itemID) end
  local collected
  local collection = C_TransmogCollection
  if collection and collection.GetItemInfo then
    local read, _, sourceID = pcall(collection.GetItemInfo, link)
    if not (read and readable(sourceID) and sourceID) then read, _, sourceID = pcall(collection.GetItemInfo, itemID) end
    if read and readable(sourceID) and sourceID then
      -- An appearance counts as collected when any item with the same look is, as in the game's wardrobe
      if collection.GetAppearanceInfoBySource then
        local found, info = pcall(collection.GetAppearanceInfoBySource, sourceID)
        if found and type(info) == "table" and readable(info.appearanceIsCollected) then collected = info.appearanceIsCollected end
      end
      if collected == nil and collection.PlayerHasTransmogItemModifiedAppearance then
        local found, has = pcall(collection.PlayerHasTransmogItemModifiedAppearance, sourceID)
        if found and readable(has) then collected = has end
      end
    end
  end
  local name = link:match("%[(.-)%]") or (C_Item.GetItemNameByID and C_Item.GetItemNameByID(itemID))
  return { kind = "item", key = "item:" .. link, link = link, name = readable(name) and name or nil, collected = collected }
end

-- Holds the model still in its first pose so only the turning moves; models load in the background, so this runs
-- again whenever one finishes loading
local function still(model)
  if model.SetAnimation then pcall(model.SetAnimation, model, 0) end
  if model.FreezeAnimation then pcall(model.FreezeAnimation, model, 0, 0, 0) end
  if model.SetPaused then pcall(model.SetPaused, model, true) end
end

local function call(model, method, ...)
  if model[method] then pcall(model[method], model, ...) end
end

-- Frames the whole model, centred; the game resets the camera when a model finishes loading, so this runs again then
local function frame(model)
  call(model, "SetPortraitZoom", 0)
  call(model, "RefreshCamera")
  call(model, "SetCamDistanceScale", model.distance or 1)
  call(model, "SetPosition", 0, 0, 0)
end

local function loaded(model)
  frame(model)
  still(model)
end

local function build()
  local frame = CreateFrame("Frame", "WoWCompanionMountPreview", UIParent, "BackdropTemplate")
  frame:SetSize(WIDTH, HEIGHT)
  frame:SetFrameStrata("TOOLTIP")
  frame:SetBackdrop({ bgFile = "Interface/Tooltips/UI-Tooltip-Background", edgeFile = "Interface/Tooltips/UI-Tooltip-Border", tile = true, tileSize = 16, edgeSize = 16, insets = { left = 4, right = 4, top = 4, bottom = 4 } })
  frame:SetBackdropColor(0.05, 0.05, 0.07, 0.95)
  frame:Hide()
  local model = CreateFrame("PlayerModel", nil, frame)
  model:SetPoint("TOPLEFT", 6, -6)
  model:SetPoint("BOTTOMRIGHT", -6, 6)
  frame.model = model
  model:SetScript("OnModelLoaded", loaded)
  -- Appearance sets are tried on your own character, the way the game's dressing room does
  local dress = CreateFrame("DressUpModel", nil, frame)
  dress:SetPoint("TOPLEFT", 6, -6)
  dress:SetPoint("BOTTOMRIGHT", -6, 6)
  dress:Hide()
  dress.distance = 1.1
  dress:SetScript("OnModelLoaded", loaded)
  frame.dress = dress
  -- The model is a child frame, so its labels live on a frame above it
  local labels = CreateFrame("Frame", nil, frame)
  labels:SetAllPoints(frame)
  labels:SetFrameLevel(math.max(model:GetFrameLevel(), dress:GetFrameLevel()) + 2)
  frame.title = labels:CreateFontString(nil, "OVERLAY", "GameFontNormal")
  frame.title:SetPoint("BOTTOM", 0, 22)
  frame.title:SetWidth(WIDTH - 20)
  frame.status = labels:CreateFontString(nil, "OVERLAY", "GameFontHighlightSmall")
  frame.status:SetPoint("BOTTOM", 0, 9)
  frame.facing = 0
  frame:SetScript("OnUpdate", function(self, elapsed)
    self.facing = (self.facing + elapsed * SPIN) % (2 * math.pi)
    if self.housingActor then self.housingActor:SetYaw(self.facing)
    elseif self.active then self.active:SetRotation(self.facing) end
    -- The tooltip is followed every frame: it can move, and its own hide events are not always delivered
    local owner = self.owner
    local gone = (not owner or not owner:IsShown()) and "tooltip hidden"
    -- The tooltip can stay shown after the cursor leaves, so the item under the cursor decides
    local button = not gone and (self.item or (owner.GetOwner and owner:GetOwner()))
    if button and button.IsMouseOver then
      local ok, away = pcall(function() return button:IsMouseOver() == false end)
      if ok and away then gone = "cursor left the item" end
    end
    if gone then
      self.goneFor = (self.goneFor or 0) + elapsed
      if self.goneFor >= GRACE then ns.hideReason = gone ns.hide() end
      return
    end
    self.goneFor = 0
    -- A frame script error would repeat every frame, so placement problems are recorded instead
    local ok, err = pcall(self.place, owner)
    if not ok then ns.mountPreviewError = err end
  end)
  return frame
end

-- A frame's rectangle in screen units, or nothing when the game has not positioned it or hides its size
local function rect(frame)
  if not frame or not frame.GetRect then return nil end
  local ok, left, bottom, width, height = pcall(frame.GetRect, frame)
  if not ok or not readable(left) or not readable(bottom) or not readable(width) or not readable(height) then return nil end
  local scale = frame:GetEffectiveScale() / UIParent:GetEffectiveScale()
  return left * scale, bottom * scale, width * scale, height * scale
end

-- The frame under the cursor when the tooltip opened, if it is item sized; tooltip owners can be a whole window
local function hoveredItem(tooltip)
  local focus
  if GetMouseFoci then
    local foci = GetMouseFoci()
    focus = foci and foci[1]
  elseif GetMouseFocus then
    focus = GetMouseFocus()
  end
  if not focus or focus == WorldFrame or focus == UIParent or focus == tooltip or focus == preview then return nil end
  local _, _, width, height = rect(focus)
  if not width or width > 400 or height > 200 then return nil end
  return focus
end

local function overlaps(x, top, left, bottom, width, height)
  return x < left + width and x + WIDTH > left and top > bottom and top - HEIGHT < bottom + height
end

-- The preview is placed in screen coordinates instead of being anchored to the tooltip, because some tooltips
-- have no readable position; it sits just below the hovered item unless the tooltip covers that spot, then beside
-- the tooltip, then by the cursor
local function place(tooltip)
  local screenWidth, screenHeight = UIParent:GetWidth(), UIParent:GetHeight()
  local x, top, source
  local left, bottom, width, height = rect(preview.item)
  local tipLeft, tipBottom, tipWidth, tipHeight = rect(tooltip)
  ns.tooltipRect = tipLeft and "readable" or "unreadable"
  if left then
    x, top, source = left, bottom - 4, "item"
    -- Opens above the item when there is no room below it
    if top - HEIGHT < 0 then top = bottom + height + 4 + HEIGHT end
    x = math.max(0, math.min(x, screenWidth - WIDTH))
    if tipLeft and overlaps(x, top, tipLeft, tipBottom, tipWidth, tipHeight) then left = nil end
  end
  if not left then
    left, bottom, width, height = tipLeft, tipBottom, tipWidth, tipHeight
    if left then
      x, top, source = left + width + 4, bottom + height, "tooltip"
      if x + WIDTH > screenWidth then x = left - WIDTH - 4 end
    else
      local cursorX, cursorY = GetCursorPosition()
      local scale = UIParent:GetEffectiveScale()
      x, top, source = cursorX / scale + 24, cursorY / scale - 24, "cursor"
    end
  end
  x = math.max(0, math.min(x, screenWidth - WIDTH))
  top = math.max(HEIGHT, math.min(top, screenHeight))
  preview:ClearAllPoints()
  preview:SetPoint("TOPLEFT", UIParent, "BOTTOMLEFT", x, top)
  ns.placedBy = source
end

local function hide(tooltip)
  if preview and (not tooltip or preview.owner == tooltip) then
    ns.hides = (ns.hides or 0) + 1
    preview.owner, preview.item, preview.key = nil, nil, nil
    preview:Hide()
  end
end

ns.hide = hide

local function show(tooltip, found)
  preview = preview or build()
  preview.place = place
  preview.owner = tooltip
  preview.goneFor = 0
  -- Tooltips refresh while hovered; the item is only looked up when the cursor is over one
  preview.item = hoveredItem(tooltip) or preview.item
  place(tooltip)
  preview:Show()
  -- Tooltips refresh while hovered; the model is only reloaded when what it shows changes
  if preview.key ~= found.key then
    preview.key = found.key
    preview.facing = 0
    preview.housingActor = nil
    if preview.housing then preview.housing:Hide() end
    if found.kind == "housing" then
      preview.model:Hide()
      preview.dress:Hide()
      preview.active = nil
      if not preview.housing then
        preview.housing = CreateFrame("ModelScene", nil, preview, "NonInteractableModelSceneMixinTemplate")
        preview.housing:SetPoint("TOPLEFT", 6, -6)
        preview.housing:SetPoint("BOTTOMRIGHT", -6, 42)
      end
      -- Match Blizzard's catalog scene and its normalized decor actor/camera
      preview.housing:SetFromModelSceneID(found.sceneID, true)
      local actor = preview.housing:GetActorByTag("decor")
      if not actor then error("Housing preview scene has no decor actor") end
      if actor:SetModelByFileID(found.asset) == false then error("Housing preview model could not load") end
      actor:SetYaw(0)
      preview.housingActor = actor
      preview.housing:Show()
    elseif found.kind == "mount" or found.kind == "pet" then
      preview.dress:Hide()
      preview.active = preview.model
      preview.model:Show()
      preview.model:ClearModel()
      preview.model:SetDisplayInfo(found.displayID)
      preview.model:SetPosition(0, 0, 0)
    else
      preview.model:Hide()
      preview.active = preview.dress
      preview.dress:Show()
      preview.dress:SetUnit("player")
      -- Your own gear is removed so only the set or the hovered piece is shown
      preview.dress:Undress()
      if found.kind == "set" then
        for _, source in ipairs(found.sources) do pcall(preview.dress.TryOn, preview.dress, source) end
      else
        pcall(preview.dress.TryOn, preview.dress, found.link)
      end
    end
    if preview.active then
      preview.active:SetRotation(0)
      loaded(preview.active)
    end
  end
  preview.title:SetText(found.name or "")
  if found.kind == "housing" then
    preview.status:SetText(found.owned == nil and "Housing decor · Ownership unknown" or (tostring(found.owned) .. " owned"))
  elseif found.kind == "set" then
    preview.status:SetText(found.collected and ("|cffaaaaaa" .. found.collected .. " of " .. found.total .. " appearances collected|r") or "")
  elseif found.kind == "pet" then
    preview.status:SetText(found.collected and found.limit and ((found.collected > 0 and "|cff66dd88" or "|cffaaaaaa") .. found.collected .. " of " .. found.limit .. " collected|r") or "")
  elseif found.kind == "item" then
    preview.status:SetText(found.collected == nil and "" or found.collected and "|cff66dd88Appearance collected|r" or "|cffaaaaaaAppearance not collected|r")
  elseif found.collected == nil then
    preview.status:SetText("")
  elseif found.collected then
    preview.status:SetText("|cff66dd88Collected|r")
  else
    preview.status:SetText("|cffaaaaaaNot collected|r")
  end
  ns.shows = (ns.shows or 0) + 1
end

-- Kept in the saved data so a problem can be read after a reload without needing chat
local function record()
  if not WoWCompanionDB then return end
  local journal = C_MountJournal
  WoWCompanionDB.mountDebug = {
    hooked = ns.hooked == true, hovers = ns.hovers or 0, last = ns.last, error = ns.mountPreviewError and tostring(ns.mountPreviewError) or nil,
    secretApi = issecretvalue ~= nil, getMountFromItem = journal and journal.GetMountFromItem ~= nil or false,
    getMountInfoExtra = journal and journal.GetMountInfoExtraByID ~= nil or false, getMountInfo = journal and journal.GetMountInfoByID ~= nil or false,
    tooltipProcessor = TooltipDataProcessor ~= nil, itemType = Enum and Enum.TooltipDataType and Enum.TooltipDataType.Item or nil,
    shown = preview and preview:IsShown() or false, point = preview and preview:GetNumPoints() or 0, shows = ns.shows or 0, hides = ns.hides or 0,
    visible = preview and preview:IsVisible() or false, left = preview and preview:GetLeft() or nil, top = preview and preview:GetTop() or nil,
    alpha = preview and preview:GetEffectiveAlpha() or nil, scale = preview and preview:GetEffectiveScale() or nil, placedBy = ns.placedBy,
    screenWidth = UIParent and UIParent:GetWidth() or nil, item = preview and preview.item and preview.item.GetName and preview.item:GetName() or nil,
    hideReason = ns.hideReason, tooltip = ns.tooltipName, tooltipRect = ns.tooltipRect,
  }
  ns.debug = WoWCompanionDB.mountDebug
end

local function onItem(tooltip, data)
  ns.hovers = (ns.hovers or 0) + 1
  if not tooltip or (tooltip.IsForbidden and tooltip:IsForbidden()) then ns.last = "tooltip unavailable" return end
  local itemID = data and data.id
  if not readable(itemID) then ns.last = "item id hidden or missing" hide(tooltip) return end
  if not enabled() then ns.last = "turned off" hide(tooltip) return end
  -- Comparison tooltips describe what you already wear, so they never replace the hovered item's preview
  local name = tooltip.GetName and tooltip:GetName()
  if readable(name) and type(name) == "string" and name:find("Shopping", 1, true) then return end
  ns.tooltipName = readable(name) and name or nil
  local found, reasons = nil, {}
  local lookups = {
    { "housing", function() return housingForItem(itemID) end },
    { "mounts", function() return mountForItem(itemID) end },
    { "sets", function() return setForItem(itemID) end },
    { "pets", function() return petForItem(itemID) end },
    { "items", function() return gearForItem(itemID, data.hyperlink, tooltip) end },
  }
  for _, lookup in ipairs(lookups) do
    if enabled(lookup[1]) then
      local result, why = lookup[2]()
      if result then found = result break end
      table.insert(reasons, tostring(why))
    end
  end
  ns.last = "item " .. tostring(itemID) .. ": " .. (found and (found.kind == "mount" and ("mount display " .. tostring(found.displayID)) or found.kind == "set" and (found.key .. " with " .. found.total .. " appearances") or found.key) or table.concat(reasons, ", "))
  if found then show(tooltip, found) else hide(tooltip) end
  record()
end

if TooltipDataProcessor and TooltipDataProcessor.AddTooltipPostCall and Enum and Enum.TooltipDataType then
  ns.hooked = true
  local pending = setmetatable({}, { __mode = "k" })
  local function isHovered(frame)
    if not frame or frame == UIParent or frame == WorldFrame or frame == preview or not frame.IsMouseOver then return false end
    local ok, over = pcall(frame.IsMouseOver, frame)
    return ok and readable(over) and over == true
  end
  local function hasIntent(tooltip)
    -- ItemRefTooltip is explicitly opened by clicking a chat item link
    local name = tooltip.GetName and tooltip:GetName()
    if readable(name) and name == "ItemRefTooltip" then return true end
    local owner = tooltip.GetOwner and tooltip:GetOwner()
    if isHovered(owner) then return true end
    local foci = GetMouseFoci and GetMouseFoci() or { GetMouseFocus and GetMouseFocus() }
    for _, focus in ipairs(foci or {}) do
      if focus ~= tooltip and isHovered(focus) then return true end
    end
    return false
  end
  -- A preview problem must never break the game's own tooltips
  TooltipDataProcessor.AddTooltipPostCall(Enum.TooltipDataType.Item, function(tooltip, data)
    if not tooltip or (tooltip.IsForbidden and tooltip:IsForbidden()) then return end
    local request = {}
    pending[tooltip] = request
    -- Post-calls run before Blizzard calls Show; wait one tick rather than
    -- suppressing legitimate first hovers whose tooltip is still being built
    C_Timer.After(0, function()
      if pending[tooltip] ~= request then return end
      pending[tooltip] = nil
      local ok, err = pcall(function()
        if tooltip.IsForbidden and tooltip:IsForbidden() then return end
        if not tooltip:IsVisible() or not hasIntent(tooltip) then
          ns.last = "tooltip not visible or not hovered"
          hide(tooltip)
          return
        end
        onItem(tooltip, data)
      end)
      if not ok then
        pcall(hide, tooltip)
        ns.last = "failed while showing"
        ns.mountPreviewError = err
        pcall(record)
        if not ns.errorShown then ns.errorShown = true print("WOW Companion mount preview error: " .. tostring(err)) end
      end
    end)
  end)
end

local loader = CreateFrame("Frame")
loader:RegisterEvent("PLAYER_LOGIN")
loader:SetScript("OnEvent", record)

local function say(text) print("WOW Companion " .. text) end

-- /wowcompanion mount [on|off|debug] turns every preview on or off
-- /wowcompanion preview <mounts|pets|sets|items|housing> [on|off] turns one kind on or off
function ns.command(message)
  local word, argument, value = tostring(message or ""):lower():match("^%s*(%S*)%s*(%S*)%s*(%S*)")
  if word ~= "mount" and word ~= "preview" then return false end
  if argument == "debug" then
    record()
    local d = ns.debug or {}
    say("preview frame: shows=" .. tostring(d.shows) .. ", hides=" .. tostring(d.hides) .. ", shown=" .. tostring(d.shown) .. ", visible=" .. tostring(d.visible) .. ", left=" .. tostring(d.left) .. ", top=" .. tostring(d.top) .. ", placedBy=" .. tostring(d.placedBy) .. ", item=" .. tostring(d.item) .. ", tooltip=" .. tostring(d.tooltip) .. ", tooltip position=" .. tostring(d.tooltipRect) .. ", hidden because=" .. tostring(d.hideReason))
    say("mount preview: hooked=" .. tostring(ns.hooked == true) .. ", tooltips seen=" .. tostring(ns.hovers or 0) .. ", last=" .. tostring(ns.last or "none") .. ", error=" .. tostring(ns.mountPreviewError or "none"))
    return true
  end
  if not WoWCompanionDB then return true end
  WoWCompanionDB.settings = WoWCompanionDB.settings or {}
  local settings = WoWCompanionDB.settings
  local kind = kinds[argument] and argument
  if word == "preview" and not kind and argument ~= "" and argument ~= "on" and argument ~= "off" then
    say("previews: use /wowcompanion preview mounts, pets, sets, items, or housing, with on or off")
    return true
  end
  local on
  local choice = kind and value or argument
  if kind then
    settings.previews = settings.previews or {}
    if choice == "on" then on = true elseif choice == "off" then on = false else on = not enabled(kind) end
    settings.previews[kind] = on
    if on then settings.mountPreview = true end
    if not on and preview and preview.key and preview.key:find("^" .. kinds[kind] .. ":") then hide() end
    say(kind .. " preview " .. (on and "on" or "off"))
    return true
  end
  if choice == "on" then on = true elseif choice == "off" then on = false else on = not enabled() end
  settings.mountPreview = on
  if not on then hide() end
  say((word == "mount" and "mount" or "item") .. " preview " .. (on and "on" or "off"))
  return true
end
