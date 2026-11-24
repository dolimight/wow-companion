# Model inspection

The Model viewer and Wardrobe use models from the local Retail installation and the selected character's synced appearance when available. Open a weapon on the character and choose **Animation** to try the supported ready poses, swings, or shots. In Wardrobe, the same viewer combines planned armor and weapons on the character's base body

Use the in-game outfit preview to check weapon illusions and pieces that are only partially rendered on desktop. Previously attached GLB files remain separate from JSON backups

[wow.export’s character preview](https://github.com/Kruithne/wow.export) is a reference for mapping the game’s customization choices to meshes and texture layers

The in-game addon uses WoW's own rendering APIs for mount, pet, gear, outfit, and housing decor previews
Outfit codes are passed manually to the addon; desktop and addon do not exchange models over a live socket

Source: `src/renderer/features/model-viewer`, `src/main/gamedata`, `addon/MountPreview.lua`, and `addon/OutfitPreview.lua`
The native acceptance harness exercises the new outfit workflow with a fictional character
Exploratory exporter downloads and abandoned converter stubs are not maintained application components
