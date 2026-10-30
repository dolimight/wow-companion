# Model inspection

The desktop app inspects a complete, self-contained GLB attached to a character
React Three Fiber and Three.js provide camera movement, supported animation clips, reset/recovery, and cached model references
Attached models are separate from JSON backups

An exported GLB is a snapshot; changing an outfit draft does not rebuild its armor, body, or customization
Dynamic Retail character assembly is not implemented or proven
Blizzard character renders and the fictional demo illustration are static images

The in-game addon uses WoW's own rendering APIs for mount, pet, gear, outfit, and housing decor previews
Outfit codes are passed manually to the addon; desktop and addon do not exchange models over a live socket

Source: `src/renderer/features/model-stage/ModelStage.tsx`, `src/main/models`, `addon/MountPreview.lua`, and `addon/OutfitPreview.lua`
The native acceptance harness exercises an embedded fictional GLB, not extracted player artwork
Exploratory exporter downloads and abandoned converter stubs are not maintained application components
