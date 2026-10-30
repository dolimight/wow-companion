# WOW Companion

A local Windows Electron app for tracking Retail characters, planning gear by name, and comparing separately scoped activity data

## Run

Use Node 24.18 or newer and npm 11 or newer

```powershell
npm ci
npm run dev
```

The app starts empty, stores its SQLite database under Electron's user-data directory, and works offline with saved data
Add a character or import an addon snapshot to begin

An unpacked Windows build is available after running

```powershell
npm run package:win
```

Open `release/win-unpacked/WOW Companion.exe`
Keep that executable with its sibling files; use `npm run dist:win` to produce an installer

## Included

- Roster overview and selected-character details, with search, sorting, main/favorite flags, and reversible archiving
- SQLite persistence for character observations, separate gear plans, gems/enchants, and preferences
- Safe manual JSON or SavedVariables imports, source observation times, deduplication, and a file watcher with a 60-second fallback
- Separate Mythic+, Raiding, and PvP views; public Raider.IO refresh retains its real metric/rank scope and source timestamps
- Local comparison of tracked characters, plus links to provider rankings and source profiles
- Live item search against the local game data index, plus copying popular items from Top players into a gear plan
- Character/spec-aware item search, including class restrictions, required level, primary stats, and weapon configurations before result limits
- Gear progression with five separate views, slot explanations, per-character/activity content preferences, and editable personal targets
- Dated seasonal-rule validation and legal-set calculations in a worker, with shared currency budgets and explicit unknown results when evidence is incomplete
- Local JSON backup export/import, with validation before writes

## Addon

Copy the `addon` folder's addon files into `_retail_/Interface/AddOns/WoWCompanion`
See [addon setup](addon/README.md) for the exact layout and slash commands
Use `/wowcompanion` to copy a JSON export, or let WOW Companion read the addon's saved data automatically (it finds the game folder for you; the manual file picker lives under Sync → Import from a file instead)
WoW writes SavedVariables during `/reload` or normal logout; the desktop watcher cannot force an in-memory flush
The addon cannot open a direct WebSocket to Electron

The addon targets the installed Retail interface version but still needs an actual in-game two-character verification
Missing item details, collections, and customization remain unknown rather than being fabricated

## Current limits

The remaining roadmap workflows and their actual release gates are documented in [the implementation status](docs/roadmap-implementation-2026-10-29.md)
Tonight, Inventory, Simulations and Wardrobe are available from the sidebar
Settings contains SimulationCraft executable selection and the optional encrypted Warcraft Logs connection
The progression reference includes client-derived tracks and item candidates for exactly Retail 12.1.5.70575; incomplete conditions remain visible

Legal seasonal item-level ceilings remain unknown for real characters until a build-compatible ruleset is validated
Personal targets are editable planning goals, and this version makes no simulated DPS or guaranteed reward claims
The app does not currently integrate Blizzard account OAuth, Warcraft Logs, a full external leaderboard dataset, or live PvP rating imports
Provider lookups can fail for private/unindexed characters; a successful live lookup has not been established by the deterministic tests
Imported model assets are separate from JSON backups

## Verify

```powershell
npm run check
npm run build
npx tsx scripts/integration.ts
npm run test:desktop
npm run test:debug
```

Unit tests cover identity isolation, stale imports, declarative Lua parsing, persistence, provider coverage, and gear-plan item placement
The integration script tests the actual loopback WebSocket transport and database worker, including rejected origins/tokens and post-commit notifications
The desktop harness uses a fresh isolated `.local` workspace and hidden offscreen Electron window, executes real UI actions, and writes captures plus `report.json` under the printed acceptance path

See the [implementation review](docs/implementation-status.md) for scope and outstanding limitations

`npm run test:debug` starts the app with a loopback-only Node inspector, attaches a debugger to the main process, observes and resumes its startup pause, and keeps uncaught-exception monitoring enabled
The desktop harness also attaches Chromium's debugger to the sandboxed renderer and verifies an actual JavaScript pause/resume before exercising the UI
It writes `debugger.json`, renderer evidence in `acceptance/report.json`, logs, and screenshots to a fresh printed `.local/debug-acceptance-*` directory
Debugger access is enabled only by this explicit test command, never by a normal app launch
To repeat the same test against an unpacked package, set `WOW_COMPANION_DEBUG_EXECUTABLE` to the absolute path of `release/win-unpacked/WOW Companion.exe` before running it
For interactive source breakpoints in VS Code, choose the included `Electron main + renderer` launch configuration
It builds source maps, launches Electron, and attaches the renderer debugger on loopback port 9222

The named execution sub-skills referenced in the planning templates were not installed; implementation used the user's requested native agent team instead

## Engineering notes

Electron main owns dialogs and a narrow preload bridge, while a database worker owns SQLite transactions
The renderer has Node integration disabled, context isolation and sandboxing enabled, and a restricted packaged protocol
tRPC listens only on `127.0.0.1`, checks the renderer origin, and authenticates with a random per-launch token passed in connection parameters
Effect v4 runs service/provider work; TanStack Router, Query, and Table handle navigation, requests, and the roster
Radix-based shadcn-style primitives retain the approved Apple-inspired typography, materials, and adaptive colors

Vite+ is pinned through its documented `vite` dependency alias, so electron-vite and the Vite+ tooling use the same core
The alias's `1.x` package version cannot satisfy electron-vite's nominal Vite semver peer; `.npmrc` records that compatibility exception and the actual combined builds/tests verify it
better-sqlite3 13 ships a Node-API 10 Windows prebuild, verified with both Node and Electron's Node runtime
Its unnecessary source-build install hook is denied and electron-builder's native rebuild is disabled, avoiding a Python/compiler requirement

The browser-only development preview uses a separate `.local/browser` database

```powershell
npm run build
npm run dev:browser
```

Native file dialogs remain desktop-only
The browser preview binds to loopback and must not be exposed as a hosted service

UI mocks and design plans remain in [plans/wow-companion](plans/wow-companion)
The demo illustration's original prompt and provenance remain in [asset notes](plans/wow-companion/assets/ASSETS.md)
