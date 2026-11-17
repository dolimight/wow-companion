# Bundled dungeon data

One JSON file per Mythic+ season, made by `npm run dungeon-data` and read by the app through `src/main/dungeon-bundle.ts`

Each file holds:
- The season's dungeons with their keystone timers, from Raider.IO's documented `static-data`
- Per dungeon, the +1/+2/+3 timers, the enemy forces needed, and the boss order, from Raider.IO's routes page data
- A snapshot of the route families players run. The app still fetches these live every six hours and falls back to this snapshot when offline
- Every enemy with Keystone Guru's dangerous flag, its type, and the enemy forces it gives, from the public data files its route map loads
- The path of the dungeon's art under `public/assets/dungeons`
- Each enemy's spells, their interrupt and dispel flags, whether stuns work on it, and its creature display, from [Mythic Dungeon Tools](https://github.com/Nnoggie/MythicDungeonTools) (GPL-2.0). Newer MDT files list no stun information, so those enemies leave it unknown
- The path of a render of each listed enemy under `public/assets/npcs`
- The pulls of each dungeon's five most-run drawn routes, each as the NPCs it kills, from the Keystone Guru embed page and the map data it loads; play mode lists the trash before each boss from them
- The season's raids (the newest full tier and the lairs opened since) from Raider.IO's documented raiding `static-data`, for the Raids page, with the path of each raid's art under `public/assets/raids` when it has been extracted

`npm run dungeon-data -- --spells` refreshes only the spells and pictures in the saved bundle, `-- --raids` only its raids, and `-- --pulls` only its route pulls

`strategy/<season>.json` is written by hand: short positioning and per-role lines for each boss and each enemy that threatens groups, summarized from a current dungeon guide named in the file. Each line ends without a period, and `src/renderer/features/dungeons/strategy.test.ts` checks every boss and enemy against the bundle. Raid strategy lives in `data/raids/strategy/<season>.json` in the same style, with Mythic-only lines kept apart, checked by `src/renderer/features/raids/strategy.test.ts`

`encounters/<season>.json` is made by `npm run encounter-data` from a local World of Warcraft install after `dungeon-data` has run: every dungeon's bosses (Mythic+) and every raid's bosses at each difficulty it offers, from the Encounter Journal, with each boss's loot, plus the names, text, and icons of the trash spells. The icons go to `public/assets/icons` and are listed in `encounters/icons.json`. The app never reads these from the player's game files; only an instance missing from the bundle falls back to them. Pass `-- --cache <dir>` to reuse a game data folder that already holds the item index

The app uses the newest bundle whose season hasn't ended, and asks Raider.IO for the live season when none applies
Run the script again when a season starts or Keystone Guru remaps a dungeon, then commit the JSON and any new images
Images already in `public/assets/dungeons` are kept; new ones are saved as downloaded (1800 px wide)
