# Outfit planning and in-game preview

The wardrobe saves per-character appearance plans, hidden slots, optional weapon illusion references, and acquisition notes

Collection labels distinguish observed collected appearances, absence from a complete observation, and unknown ownership
The addon reads collected appearances from the current wardrobe category results without changing the player's filters, so these captures are deliberately partial
The collection scan has its own observation time; a later gear snapshot does not make that scan newer
Account-scope reuse requires explicit matching local collection membership

## Desktop to addon

1. Save or edit an outfit in Wardrobe
2. Open Preview this outfit in WoW and copy its code
3. In WoW, use `/wowoutfit`, paste the code and choose Import
4. Choose Preview outside combat

The addon starts from the logged-in character, clears current gear, and previews only the plan
It does not equip items, apply transmog, buy anything, or communicate with a desktop server
Appearance-source IDs are preferred over item IDs; an unresolved appearance is reported instead of silently substituted
Independent left/right shoulder references remain explicitly unsupported in this preview until their orientation and installed-client behavior are tested
Weapon illusions use the client's item-transmog model interface when available and report failures

Outfit codes contain versioned canonical JSON, unpadded base64url, and CRC32
The checksum detects accidental corruption and is not authentication
Decoded payloads are limited to 64 KiB, forty unique slots, recognized fields and bounded identifiers
Addon JSON is deserialized through `C_EncodingUtil.DeserializeJSON`, never evaluated as Lua
Only the appearance intent crosses the bridge; the selected desktop character and draft retain their identities

## Desktop rendering capability

The current workspace has no live character-assembly renderer or model attachment boundary
Wardrobe retains the official observed character render where available and clearly labels that it does not change with the plan
The shared `evaluateModelCapability` gate requires two real-character references, customization, dynamic armor swaps, weapon attachments, body variants, animation, local assets, and missing-asset recovery
An animated flattened GLB cannot pass that gate
See [model inspection](model-inspection.md) for the shipped renderer boundary; historical extraction experiments are not part of the application

## Verification

`npx vp test src/shared/outfits.test.ts` checks transport round trips, a shared Lua fixture, corruption/size/schema/ID rejection, character isolation, partial collection semantics and the model gate

`npm exec --yes --package=fengari-node-cli -- fengari addon/tests/outfit-transport.lua` checks the same protocol bytes, bounded validation, clear-before-preview ordering, combat rejection, unsupported shoulders and cached partial collection capture

The Lua harness mocks the client JSON parser and model APIs; an actual installed-client import/preview and two-character reload/logout capture remain required

## Primary API references checked

- [Retail DressUpModel generated API declarations](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/FrameAPIDressUpModelDocumentation.lua)
- [Retail encoding declarations](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/EncodingUtilDocumentation.lua)
- [Retail collection declarations](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/TransmogItemsDocumentation.lua)
- [Retail dressing-room implementation](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_UIPanels_Game/Mainline/DressUpFrames.lua)
