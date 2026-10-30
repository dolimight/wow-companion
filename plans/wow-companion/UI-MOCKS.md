# WoW Companion UI mocks

Open http://127.0.0.1:8097 while the local mock server is running, or open ui-mocks.html directly
All images live in assets; no remote asset requests are needed
Planning uses T3 Code's native planner, with all artifacts kept locally

## Character roster

The home view shows four fictional Retail characters alongside the selected character's detail pane
Select a row to inspect gear, target/max gaps, activity standing, observation time, and the next action, then use Open character for the full sheet
Search or sort the roster, favorite characters, set a main, add an unimported preview character, and archive/restore characters in Manage roster
The sidebar switcher searches name, realm, or class and retains the current section
Gear drafts, gems, activity filters, ranking search/scope, outfit choices, and model preview settings remain separate for each character during this session
New preview characters show unknown progression until imported, and their import button remains a demo action

## Wardrobe and planned 3D states

The wardrobe shows the intended model-stage layout with front/back, zoom, reset, lighting, and animation controls
Camera and animation controls remain disabled because no real model renderer is connected
The artwork is a static generated concept illustration and does not change when the outfit draft changes
Lighting changes the mock stage background only

Choose Demo model state to review concept artwork, loading, missing assets, an unsupported form, or a graphics interruption
Missing models retain the outfit editor and saved draft state
Choose appearance slots, including separate shoulders, and variants, then hide the cloak in the draft or save an outfit
Slot selections and variants restore when switching slots or characters
Shared outfit templates show character eligibility; the cloth template is a wishlist on other armor classes
Unknown collection membership stays unknown, including an explicit collected-only empty state

## Other review interactions

- Toggle light/dark appearance with the moon control in the sidebar
- Inspect a gear row, change the gem/enchant draft, and save the character's preview build
- Use separate activity tabs and ranking populations, search players, and open a Mythic+ comparison
- Open Import & sync to compare observation times for all characters, the last file check, and the 60-second fallback
- Dismiss panels or the switcher with Escape, and use arrow keys in the switcher

The Raiding and PvP views retain their separate contexts, but detailed player ladder tables for those activities are outside this mock
Preview state lasts for this page session and resets on reload
Names, item levels, caps, items, account scopes, ranks, appearance names, and timestamps are fictional demo data
No live imports, current game rules, simulations, database writes, outfit application, or Electron window controls run here

## Files and verification

- ui-mocks.html: editable, self-contained mock source
- screenshots: reviewed desktop and narrow captures
- assets/ASSETS.md: unchanged image provenance and character-generation prompt location
- ../../DESIGN.md: incumbent Apple-inspired visual system
- multi-character-and-3d-design.md: feature design and real 3D feasibility gate
- ../../.impeccable/review: final review evidence

23 browser interaction checks passed for roster/character isolation, slot memory, collection/eligibility states, model states, search, adding unknown characters, and reversible archiving
The source-rendered screenshots reported no console errors, and the browser image/overflow checks passed
The detector reported no primary findings; its remaining advisories concern documented responsive styles and the existing token inventory
Real 3D compatibility and API integrations remain implementation work

Earlier plan.mdx and canvas.mdx artifacts remain archival; the separate visual-plan viewer is not used

