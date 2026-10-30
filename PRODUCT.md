# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Electron desktop shell with a web-based interface, initially targeting Windows

## Stack

User prefers shadcn/ui, TanStack libraries, Effect v4, and Vite+ and delegated the final selection
Built with Electron, React, TypeScript, shadcn/ui (Base UI), Tailwind CSS, TanStack Router / Query / Table, Effect v4, tRPC WebSockets, and local SQLite

## Users

One Retail World of Warcraft player managing their own characters on their own computer
Assume little WoW knowledge and no technical knowledge: nobody should need to know what a file path, an item ID, SavedVariables, or an API is to get value from the app. Anything unavoidably technical (the optional Blizzard key) is a guided, copy-and-paste step

## Product Purpose

Show the player's current character and equipped gear, distance to the legal maximum item level, and competitive standing
The first priority is character and gear progression; the second is comparing with strong players, similarly ranked peers, and the overall activity ladder

## Operating Context

Used before and between WoW sessions to choose upgrades, understand progression, inspect rankings, and plan gear
Mythic+ dungeons and Mythic raids are the primary focus, with separate Mythic+, Raiding, and PvP views
Saved plans and imported snapshots remain local
Live provider refreshes need network access
The app syncs on every launch, and again when the window returns to the front after ten minutes: it finds the game, keeps the addon current, reads the addon's saved data, and refreshes every tracked character. Nobody is asked to locate or choose a file; manual file import exists only as a hidden fallback

## Capabilities and Constraints

Support multiple Retail characters with a roster overview and character switcher
Home opens the roster overview with one selected character's details, as confirmed by the user
Keep gear snapshots, goals, rankings, and builds scoped to immutable local character IDs
Collection scopes remain distinct until membership is established; unknown ownership stays unknown
Import and edit gear sets, gems, enchants, and talents
Search items by name from local game data and copy popular choices from other players into a gear plan
Distinguish equipped item level, the legal season maximum, an attainable target, and combat performance
Compare within a spec, class, peer rating/progression range, and the overall selected activity
Never combine dungeon rating, raid performance, and PvP rating into an invented universal score
Preserve source timestamps and indicate incomplete ranking coverage
Data comes from four layered sources, each optional, and every value names the source it came from:
- The player's own installed game files (read locally, never redistributed): item names, icons, drop sources, and enchant and gem names
- The Blizzard API with a key the player creates themselves, plus Battle.net sign-in: official character renders, gear, stats, talents, raid history, account characters, and the WoW Token price. Secrets stay in the main process and never reach the interface, logs, or backups
- Raider.IO: Mythic+ score and rank, this week's keys, talent strings, and the top players of a specialization (North America by default)
- The companion addon, installed for the player: the exact Great Vault, saved lockouts, this week's keys, gear, and talents through SavedVariables. WoW only writes them on /reload or normal logout, and a desktop check cannot force that
Great Vault progress is shown as live when the addon supplied it and as an estimate otherwise; delve progress is only available from the addon
Weekly resets follow each region's published schedule
Real 3D support is not shipped: the app shows Blizzard's character render and can inspect a model the player attaches. Dynamic armor and weapon swaps on real Retail characters remain unproven feasibility work
Item search uses the local Retail game data index; planners never have to know an item ID

## Brand Commitments

App name: WOW Companion
User prefers shadcn-style interface components
User explicitly requires Apple design principles for the UI mocks, adapted to Electron
Use T3 Code's native planner; do not use visual-plan or the separate Plan viewer
No trailing periods in user-facing UI copy or assistant replies

## Evidence on Hand

Current feature status and release gates: docs/roadmap-implementation-2026-10-29.md
Rendering boundaries: docs/model-inspection.md
Active navigation proposal: docs/specs/2026-10-30-navigation-redesign.md
Audited user flows: docs/specs/2026-10-30-user-flow-map.md
Completed mockups, execution logs, duplicate screenshots, and exploratory downloads are excluded from the maintained repository
Real characters import through Battle.net and the addon, and top-player rankings come from Raider.IO. A verified current-season item-level cap and 3D integration are still unavailable, so those values stay Unknown
UI mocks may use explicitly labeled fictional demo content, without implying that its numbers are current game facts

## Product Principles

Character identity and gear gaps lead the interface
A comparison names its metric and population
Saved state stays local and usable offline
A recent file check never makes an old gear snapshot appear fresh
Keep implementation details out of ordinary product workflows
Estimates are labelled as estimates and live data as live; a missing value stays Unknown rather than being filled in
A popularity or ranking figure always names its population, season, and region

