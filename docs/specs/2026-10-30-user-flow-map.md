# User flow inventory

Audited October 30 against the renderer routes, action handlers, feature components, and current implementation notes

This is a source-based interaction audit, not a claim that every flow was manually exercised in game or against authenticated providers

## Primary journeys

| Job | Current path | Desired completion | Main friction |
| --- | --- | --- | --- |
| Choose an alt | Characters → filter/sort → select → selected pane → Open character | Understand which character needs attention, then open its workspace | Characters and Character look interchangeable |
| Understand distance to max | Character → Progression → choose scope → inspect slot explanation | Distinguish equipped, owned-upgrade, preferred-content, affordable, and legal ceilings | Summary and detailed reasoning feel like unrelated destinations |
| Plan an upgrade | Gear planner → slot → item search → choose → edit enhancements → update slot → save plan | A saved compatible goal for the correct character and activity | Two save levels and many separate navigation destinations |
| Use an item already owned | Inventory → location → search/slot → inspect exact copy; then return to plan | Recognize acquisition separately from upgrades/gems/enchants | Ownership and planning live far apart; new direct-use action needs implementation |
| Decide what to play tonight | Tonight → time/goal → included characters/activities → recommendation → review | A justified activity for a named character within the time budget | Character switcher changes the plan anchor and navigates out of Tonight |
| Finish the week | This week → character → Vault/keys/lockouts → character detail | See missing weekly rewards without confusing estimates with captures | Opening a row loses the selected weekly context |
| Compare competitive standing | Standings → activity/population/filters → evidence | Understand the player’s actual place within a named population | A separate Top players entry overlaps the same job |
| Learn from a leader | Top players → activity/spec → gear/build → copy a compatible item/loadout | Turn an observed difference into a candidate plan | No single continuous comparison-to-plan workspace |
| Validate a gear change | Simulations → complete/import profile → choose engine/scenario → compare saved plan → run → result | An applicable result with uncertainty and baseline provenance | Technical setup and routine decisions have equal weight |
| Build an outfit | Wardrobe → new/select → slot → appearance search → hide/illusion → save | A character-owned outfit and acquisition checklist | Slot editing, collecting, preview transport, and model inspection compete |
| Preview an outfit in game | Saved outfit → copy preview code → WoW addon → paste/preview | A manual in-game preview without changing equipped gear | No desktop socket bridge; handoff needs clear instructions |
| Inspect a desktop model | Wardrobe → Inspect a 3D model → attach → orbit/zoom/animation → reset/detach | Inspect an exported snapshot | Snapshot inspection can be mistaken for a live outfit renderer |

## Supporting and recovery flows

| Flow | Current entry/actions | Required behavior in redesign |
| --- | --- | --- |
| First launch | Empty Characters → Setup → detect game/addon/item data → optional connections | One guided path; optional connections do not block local use |
| Add by name | Characters or switcher → Add character sheet → region/realm/name | Preserve entered values after a recoverable error; return to roster with result selected |
| Discover account characters | Connections → Blizzard credentials → Battle.net sign-in → discover/import | Keep secrets outside renderer, logs, and exports; retain manual-name fallback |
| Sync observations | Startup/focus sync or footer Sync → details → refresh/import fallback | Show source observation age independently of last check; explain /reload or logout |
| Repair missing data | Error/unknown panel → connection or sync details → retry | Return to the interrupted destination with character/slot/activity intact |
| Prepare local item data | Settings/Setup → detected installation → prepare index | Show progress/cancel or failure recovery where supported; explain why search is unavailable |
| Switch characters | Switcher → search → choose | Keep current character tool/tab; never silently discard edits |
| Change activity | Repeated Mythic+/Raiding/PvP controls | One character activity context; separate roster and Tonight scopes |
| Manage roster | Characters → Manage roster → main/favorite/archive/restore | Retain local plans on archive; archived characters stay out of routine choices |
| Delete character | Manage roster → named inline warning → Keep/Delete | Remove associated plans/outfits and prevent addon resurrection; choose valid navigation afterward |
| Browse items | Titlebar Search items or Ctrl/Cmd+K → filters → inspect → select | Browsing is read-only until an explicit Add to plan action; do not add on mere selection |
| Inspect gear | Item hover/focus → recorded/base details; click → editor/details | Hover never consumes click; Escape dismisses; exact-copy data remains available |
| Edit target/enhancements | Gear planner or Progression → target; planner → enchant/gems | Keep personal targets distinct from proven maxima; acquisition never hides unfinished enhancements |
| Tune progression | Progression → sources/difficulties/crafting/exclusions/budget → save → explanation | Keep preferences scoped by character/activity; never invent affordability from stale quotes |
| Manage Tonight decisions | Action → pin/snooze/dismiss/undo; estimate/record duration | Unknown duration does not fit a strict budget; starting an action is not automatic completion |
| Manage simulation evidence | Export/copy/import/reset profile; run/cancel; save/open external report | Complete applicable baseline required; external bookmarks are not parsed simulation results |
| View comparison history | Standings → History population | Preserve source, season, spec, activity, metric, and timestamps |
| Save/import performance report | Standings → Warcraft Logs URL/notes → save/import summary | Connection recovery preserves URL/notes; unsupported event review stays unavailable |
| Manage outfit transport | Outfit tools → import/export code, collection notes, hidden slots, illusions | Validate codes; resolve dirty edits first; unknown ownership remains unknown |
| Leave an unsaved editor | Wardrobe route blocker; gear form/local slot/draft state | Consistent Save / Discard / Stay for character, activity, route, tab, and app-close transitions |
| Configure app | Settings → appearance/motion/sidebar/connections | Always integrated titlebar; Base UI controls; keyboard and resizing remain usable |
| Back up/restore | Settings → Local data → export/import | Preserve existing validation/confirmation; never overwrite live data as part of UI tests |
| Offline/partial source | Any saved workspace with unavailable provider | Saved content remains readable; retry is local to the affected panel |
| Invalid/missing identity | Removed/archived character, unknown spec, unsupported route | Clear recovery to roster or sync; never display another character as the requested one |

## Source anchors

- `src/renderer/App.tsx` — shell, routes, roster, overview, gear editor, Settings, add/manage sheets
- `src/renderer/components/SidebarResize.tsx` — forced 64px rail at widths of 1000px or less
- `src/renderer/features/tonight/TonightPage.tsx` — anchor-scoped session plans and decisions
- `src/renderer/features/week/week.tsx` — roster-wide weekly observations
- `src/renderer/features/progression/progression.tsx` — scoped ceilings and explanations
- `src/renderer/features/inventory/InventoryPage.tsx` — exact-copy observations and talents
- `src/renderer/features/items/items.tsx` — contextual item search and selection
- `src/renderer/features/comparisons/ComparisonPage.tsx` and `features/top/top-players.tsx` — overlapping comparison workflows
- `src/renderer/features/simulations/SimulationsPage.tsx` — profile, engine, jobs, report bookmarks
- `src/renderer/features/outfits/` and `features/model-stage/ModelStage.tsx` — outfit intent and snapshot inspection
- `docs/roadmap-implementation-2026-10-29.md` — verified implementation boundaries and release gates
