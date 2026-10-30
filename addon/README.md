# WOW Companion addon

Copy this folder's `WoWCompanion.toc`, `WoWCompanion.lua`, `MountPreview.lua`, and `OutfitPreview.lua` into `_retail_/Interface/AddOns/WoWCompanion`

Enable the addon, log into each character you want to track, and use `/wowcompanion` to copy a JSON export for the desktop app
The popup can be copied without a reload
For file import, use `/reload` or normal logout first, then select `WTF/Account/<account>/SavedVariables/WoWCompanion.lua`
The desktop's file watcher and 60-second check read only the last saved file; neither forces WoW to flush current memory

The account-wide table retains characters by player GUID, including observations from previously visited alts
An installation profile ID identifies this export source without claiming Battle.net ownership or a shared appearance collection
This version reports equipped items, available gems, raw enchant IDs, specialization, level, and observation times
Appearance collection, exact transmog/customization coverage, ratings, and legal item-level ceilings remain unknown

The interface marker targets Retail 12.1.5 and the implementation uses guarded contemporary equipment APIs
Real client installation and gear-change verification are still required; this repository's automated tests validate desktop import behavior rather than execution inside WoW
If the client reports the addon as out of date, verify its APIs against the current client before updating the interface marker

## 3D previews

Hovering an item shows a slowly turning 3D model just below it, in vendors, bags, loot, chat links, and anywhere else the game shows an item tooltip
- Mounts: the mount the item teaches, and whether you have collected it
- Battle pets: the pet the item teaches, and how many of it you own
- Ensembles and arsenals: your character wearing the whole set, and how many of its appearances you have collected
- Gear: your character wearing only that piece, and whether you have collected its appearance
- Housing decor: the furnishing model on its own, with the catalog's reported owned count when available

The game draws the models from its own files, so nothing is downloaded and no game files are read
Use `/wowcompanion mount off` or `/wowcompanion mount on` to turn every preview off or on, and `/wowcompanion preview items off` (or mounts, pets, sets, housing) to turn off one kind; choices are saved with your other addon data
Use `/wowcompanion preview housing on` to re-enable housing previews
Housing requires the Retail housing catalog API and a supported model asset; entries without either are skipped rather than displaying another item's model
Housing previews show the catalog's base model, not a placed or dyed house instance, and never place, buy, or consume decor
`/wowcompanion mount debug` prints what the last hover found
The desktop app installs and updates the addon from Settings, Connections
`addon/tests/mount-preview.lua` checks the logic against mocked game calls

Housing API and renderer references: [generated catalog API](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/HousingCatalogUIDocumentation.lua), [Blizzard catalog renderer](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_HousingTemplates/Blizzard_HousingCatalogEntry.lua)
Version 0.4.1 adds housing previews; actual in-game framing and tooltip integration still require a Retail client check
Version 0.4.2 prevents background tooltip processing from opening previews without a visible tooltip and hover intent, while retaining clicked chat-link previews
Tooltip visibility is checked on the next tick because Blizzard processes item tooltip callbacks before showing the tooltip; stale queued item callbacks are discarded
