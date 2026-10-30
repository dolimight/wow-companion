# Roadmap implementation status

Implemented against the six approved workflows, preserving local storage and the existing Electron shell

## Available workflows

- Progression consumes bag and observed personal-bank equipment, exact variants, five build-pinned Mistcrest tracks, base copper/currency costs and fresh per-item upgrade-vendor quotes
- The generated reference catalog includes 4,434 client-listed variants with source table hashes, checked dates and a seven-day review interval
- Inventory separates equipment, bags, observed bank and mutually exclusive unclaimed Vault choices, with raw links, instance identities, talents and independent scan times
- Gear plans track acquisition, rank, enhancements and exact variant completion independently
- Tonight persists character/activity choices, goals, strict time budgets, manual estimates, completed-session duration ranges, pins, snoozing, dismissal and undo
- Simulations export/import bounded profiles, retain external report bookmarks, run a selected local engine with limits/cancellation and retain reproducible baseline/result provenance
- Comparisons separate public Mythic+ leaders, matching tracked peers and local history, preserving source-native rank scope and withholding sampled global percentiles
- Optional official PvP bracket discovery uses the configured Blizzard API key; public Warcraft Logs summaries use separately configured user-owned OAuth credentials
- Wardrobe supports per-character outfits, appearance search, ownership coverage, hidden slots, illusions, acquisition notes and TS/Lua outfit codes with manual in-game preview
- Local React Three Fiber inspection accepts self-contained GLBs, camera controls, available animation clips, reset/recovery and character-owned cached model references

## Explicit remaining release gates

The seasonal catalog remains partial: server acquisition conditions, crafted restrictions, PvP scaling and Ascendant Venomstone eligibility are not all verified
Consequently, a proven absolute legal maximum remains unavailable rather than becoming a guessed number
Base costs are reference data; personal discounts and actual affordability require fresh matching addon/vendor observations

Bag capture covers equippable items and viewed personal-bank tabs, not a complete Warband consumable/material inventory
Unobserved bank/Vault access remains unknown

Local simulation execution needs an installed user-selected SimulationCraft executable and a complete current baseline
Fixture-process tests do not establish a live engine/current-client round trip or tank/healer effectiveness
Planned-set simulations require proven legal equipment restrictions

Public report summaries do not establish event-level defensive/mechanic judgments or a global raid performance ladder
Live authenticated PvP/Warcraft Logs checks require the relevant account credentials

Desktop GLBs are exported snapshots, not dynamic WoW armor/customization assembly
The earlier Alwin, Dolimight and Zaelindra exports remain local under `.local/model-exports`
The addon outfit preview and expanded capture still require actual in-game validation

## Validation

242 unit tests and full TypeScript passed before the final native integration fixes
Production compilation passed with the progression worker, authenticated transport and sandboxed renderer
Fifteen WebSocket/database-worker integration checks pass, including new feature-state isolation
Focused Lua capture and outfit transport tests pass against mocked client APIs
The Electron debugger harness passes all 31 checks, including main/renderer pause-resume, gear hover, Tonight persistence, inventory, simulations, wardrobe, contextual comparisons, actual embedded GLB loading/reset/detach and deletion isolation
Final evidence: `.local/debug-acceptance-1793312070916/acceptance/report.json` and the sibling `debugger.json`

No commits or changes to the user's real roster were used for testing
A consistent SQLite backup was created before launching the updated desktop profile
