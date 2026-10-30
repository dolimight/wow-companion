# Navigation and workflow redesign

Status: proposed design for review, no application changes made

Companion to [the audited flow map](2026-10-30-user-flow-map.md)

## Intent

Make the app answer three questions before logging in: which character needs attention, how far its gear is from an attainable maximum, and how it compares with relevant players

Preserve the roster overview with a selected-character pane as the launch screen, the established Apple-inspired visual system, pure-black dark mode, and all existing feature capabilities

The proposed grouping is a design recommendation, not a previously approved user requirement

## User clarification: the whole experience is confusing

The user described all of moving through the app as confusing, not one particular sidebar entry
Treat this as an end-to-end interaction redesign within the existing visual identity, rather than relabeling navigation around unchanged feature screens

The primary journey is Characters → Overview → Review a gap → Plan an improvement → Compare or validate → Save → Return to the next action
Tonight remains a separate shortcut into that journey for choosing what to do with available time
Wardrobe remains a distinct appearance workflow and never interrupts gear progression

### Rules for every redesigned screen

- Lead with the question the screen answers and the answer supported by current observations
- Keep the current character, activity where relevant, and source freshness visible without repeating full setup forms
- Give the main task one visually dominant next action, with a concrete destination such as Review head upgrade rather than a generic Continue
- Make navigation persistent and predictable, but let contextual actions carry the character, item, slot, and return location so the player need not reconstruct the workflow
- Show filters, technical evidence, raw profiles, and setup details progressively; retain direct access for experienced use
- A missing prerequisite explains what is missing and offers the relevant repair action in place, then returns to the interrupted task
- Empty states provide a next step rather than requiring the player to choose among unfamiliar tools
- Review actions never imply acquisition, equipping, simulation success, or activity completion

### First meaningful session

1. Open Characters; if empty, offer one dominant Set up WOW Companion action and a secondary Add by name fallback
2. Connect the local game and import any available character observations; optional provider connections remain optional
3. Select a character to see its current gear, supported gap, activity standing, and source coverage in the roster pane
4. Open Overview for the selected character and review one supported gap or next step
5. Follow that gap to its slot evidence, then explicitly stage a compatible target into Plan
6. Save the plan and return to Overview or Tonight with the action context preserved

### Progressive disclosure examples

| Screen | Lead with | Reveal when relevant |
| --- | --- | --- |
| Overview | Current character, gear gap, standing, next step | Full provenance and detailed assumptions |
| Gear → Progress | Supported ceiling and the slots limiting progress | Source exclusions, budgets, crafting restrictions |
| Gear → Plan | Current versus planned item and remaining work | Manual overrides and detailed variant evidence |
| Gear → Simulations | Latest applicable result or one prerequisite repair | Raw profile, CPU settings, reproducibility hashes |
| Performance | Your metric and the named comparison population | Advanced filters, provider evidence, report setup |
| Tonight | Time, goal, recommended character/action | Included characters, estimates, saved decisions |
| Wardrobe | Selected outfit and the slot being edited | Collection details, code transport, snapshot inspection |

### Usability proof beyond visual polish

Acceptance must trace complete journeys, not just show that individual routes render
Exercise first setup → character overview, gap → saved plan, owned item → replacement review, leader sample → candidate plan, Tonight → review → return, and outfit edit → in-game preview instructions
For each, verify the current identity is clear, the next action is named, Back returns to the originating context, and missing data has a specific recovery
Technical acceptance can establish behavior; it cannot establish that the redesigned flow feels understandable to the user, which still needs a walkthrough

## What is broken today

- Eleven primary links combine roster-wide and character-specific tools under one generic workspace heading
- Characters and Character differ by one letter but change scope completely
- Progression, Gear planner, Inventory, and Simulations are four destinations for one upgrade decision
- Standings and Top players split one comparison journey and duplicate population concepts
- The switcher sits above global pages although choosing a character on those pages navigates to Characters
- The sidebar automatically becomes a 64px icon rail at 1000px, hiding the labels just when they are most needed
- The titlebar’s Workspace breadcrumb adds little orientation and its item search also writes directly to the current plan on selection
- Key controls are repeated inside pages, while Settings and sync exist only as small footer icons

## Proposed information architecture

Seven primary destinations, with stable labels and explicit scope

| Sidebar section | Destination | Contents |
| --- | --- | --- |
| Workspace | Characters | Roster, selected-character summary, add/manage |
| Workspace | Tonight | Multi-character session planning |
| Workspace | This week | Roster-wide Vault, keys, lockouts, weekly opportunities |
| Selected character | Overview | Character identity, gear gap, activity standing, next steps |
| Selected character | Gear | Progress, Plan, Owned, Simulations |
| Selected character | Performance | Your standing, Leaders, History, Reports |
| Selected character | Wardrobe | Saved outfits, acquisition checklist, in-game preview, optional model inspection |
| Footer utilities | Sync status | Last check, observation freshness, source problems, sync details |
| Footer utilities | Settings | Connections, Appearance, Workspace, Local data |

The character switcher belongs directly above the four character links, beneath the three Workspace links

It displays avatar, name, specialization, realm, and region as space permits, with the full identity always available in its popover

When no character exists, replace the character section with a compact Add character call to action instead of eight disabled destinations

### Why this grouping

Keep Tonight and This week separate: one chooses an action within a time budget, the other audits weekly completion

Group tools inside Gear and Performance because their tasks share a subject and context, not just because the sidebar needs fewer rows

A collapsible version of the current eleven-link list would still require the player to understand the same fragmented structure

Putting every character under an expandable sidebar tree would become noisy with many alts and repeat the same tool links

## Shell behavior

- Keep the sidebar full height and resizable using the existing shadcn Base UI Resizable component
- Retain the existing 240px desktop preference and 220–360px bounds where space permits
- Replace forced icon-only collapse at 1000px with a labeled navigation drawer below 1100px, opened by an accessible titlebar button
- The drawer overlays content, closes after successful navigation, supports Escape/focus return, and never overwrites the saved desktop width
- At 820px the app keeps its existing minimum width; tabs may scroll horizontally with visible labels and keyboard focus visibility
- On Windows keep native overlay controls unobstructed; on macOS preserve traffic-light clearance and integrated titlebar behavior
- Global pages show their page title, not a misleading selected-character breadcrumb
- Character pages show character identity, section, and one shared Mythic+ / Raiding / PvP activity control where activity is relevant
- Wardrobe has no activity control because appearances are not an activity-specific gear plan
- Subnavigation uses real links for routes, not ARIA tabs unless actual tabpanel keyboard behavior is implemented
- Selected parent destination remains highlighted across its child views; current child gets a separate quiet selection treatment
- Navigation transitions preserve scroll/filter state on Back and Forward and focus the new page heading after deliberate destination changes

## Character and activity context

The URL determines the character on character routes, never a fallback to another active character

Changing characters from a character page keeps the section and child view: Gear → Plan stays Gear → Plan, Performance → Leaders stays Leaders

Changing the selected character from Characters keeps the roster and changes its selected pane

On Tonight and This week, a row action opens a named character destination explicitly; the sidebar switcher updates the future character workspace without navigating away or silently changing the current planner

Tonight already stores preferences/dispositions under an anchor character ID despite presenting a multi-character view
Preserve that storage model for this redesign, but pin the planner anchor for the active visit and persist it as a separate UI preference `tonightAnchorCharacterId`
Show “Session plan for {character}” in planner settings; an explicit Change plan action switches anchors after any pending save finishes
Changing the general selected character never changes that anchor; deletion of the anchor asks the user to select another existing plan rather than merging histories
This avoids a hidden data migration; truly account-wide session-plan storage is separate future work

Character activity stays per immutable character ID and is shared by Overview, Gear, and Performance
Roster activity is a separate workspace preference, and Tonight keeps its explicit multi-activity inclusion controls
Unsupported activity/provider combinations show a specific limitation, without changing the selected activity or substituting another activity’s score

## Screen designs and continuous journeys

### Characters

Keep the roster and selected-character pane as the launch experience
Lead the table with identity, equipped level, remaining target gap, selected activity standing, weekly attention, and observation age where supported
Existing main/favorite behavior and sorting remain, with archive/delete inside Manage roster
The selected pane offers three explicit exits: Open overview, Review gear, and Compare performance
At narrow widths put the selected summary above the table rather than squeezing a third column into the layout
Weekly attention is derived only from supported observations; unknown coverage does not become a warning count

### Overview

Answer “what is this character right now?” without reproducing every downstream table
Show identity/render, equipped gear, bounded progression summary, selected activity standing, and a short next-step list
Review gear opens Gear → Progress; a standing metric opens Performance → Your standing; a weekly gap opens This week focused on that character
Keep renders subordinate to the facts and clearly distinguish a static character render from 3D inspection

### Gear

Use one consistent context header and four links: Progress, Plan, Owned, Simulations

**Progress** leads with equipped level and the best verified scope available, with the other ceiling scopes selectable and explained
Slot rows open their detailed evidence and offer Review in plan with the slot preselected
Content restrictions, budget, and advanced assumptions sit beneath the answer, not before it
No unverified absolute maximum or unsupported gain is fabricated

**Plan** keeps current and planned items side by side and the existing Target equipped dimming behavior
Clicking a slot opens its inspector without losing the table selection
Use one page-level Save plan action; slot edits update the local draft immediately, removing the separate Update draft slot step
Show unsaved/saving/saved/error state near the save action, never imply automatic persistence before it succeeds
Acquisition, rank, gems, and enchant remain independent completion dimensions
Dirty plan protection covers route, character, activity, subsection, search handoff, and application close

**Owned** preserves Equipped / Bags / Observed bank / Vault choices, exact copies, observed talents, and separate source times
An explicit Use in plan action carries the exact variant and compatible slot into the local plan draft and opens Plan, without claiming the character equipped it
Vault alternatives use Plan this reward rather than Use owned item and remain mutually exclusive unclaimed choices
This transfer action is new work, not a claim about the current Inventory implementation

**Simulations** leads with current-versus-planned intent and latest applicable result
Keep first-use engine setup and incomplete-profile repair inline; advanced raw profile, CPU settings, and reproducibility details disclose progressively
Do not enable comparisons the current legality/baseline checks cannot prove, or imply that damage models establish healing/tank/PvP effectiveness

### Performance

One activity context and four view links

- Your standing — current metric/rank where supported, named region/season/population, tracked comparable peers and explicit source coverage
- Leaders — searchable player sample and a separate aggregate gear/build section; inspect available evidence in a detail panel and stage compatible sample gear choices into Gear → Plan through an explicit action
- History — the character’s stored observations, with metric/season breaks preserved; no invented global percentile
- Reports — Warcraft Logs bookmarks, notes, supported imported summaries, and provider repair actions

Existing leader-population comparison controls move into Leaders so “leaders” is not duplicated in both Your standing and a separate page
Your standing uses matching tracked peers by default and states the sample size; tracked peers do not represent a global ladder
Carry provider filters only where the adapter supports them, with unsupported results withheld

The current player list contains identity, score, source link, and available talent strings; individual-player gear is not supplied by that contract
A player detail panel shows only those available fields and the source link
Gear popularity stays explicitly labeled as aggregate sample evidence, never as the inspected player's equipment
Individual gear inspection is deferred unless a separate provider-contract enhancement is approved

### Tonight and This week

Tonight leads with time, goal, and the recommended named character/action
Included characters/activities, duration edits, and saved decisions are secondary controls rather than a wall of toggles before the recommendation
Review action carries a return destination and any supported character/slot context to Gear, Performance, Wardrobe, or weekly details
Provide Back to Tonight without marking the action done; completion still requires explicit user input or supporting observations

This week leads with reset context and the roster’s weekly state
Expand a character inline to inspect Vault/keys/lockouts without leaving the roster comparison
An explicit Open character or Review gear action leaves the page; Back restores the expanded row and filter
Keep optional Token information below the core weekly work

### Wardrobe

Saved outfit list on the left, outfit/slot editor in the center, selected appearance details or collection checklist on the right when width allows
On narrow layouts use a list followed by one selected editor and a detail sheet, with no third cramped column
Save, import/export, collection notes, hidden slots, illusions, and deletion stay attached to the current outfit
Preview in WoW gives the code and exact manual handoff steps
Inspect 3D snapshot stays an optional disclosure with explicit snapshot limitations; changing an outfit does not pretend to reassemble an exported model

### Search, Settings, and sync

Keep global Search items and Ctrl/Cmd+K, but selecting a result only opens its detail preview
Add to plan is an explicit action naming character, activity, and destination slot before mutation
Slot-scoped search may still choose directly into an unsaved plan draft because its intent is explicit
Unknown compatibility cannot be relabeled as verified; restore the existing search setup-repair flow when the game index is absent

### Rules for adding or replacing a planned target

All Owned, Vault, Leaders, and Search handoffs use one shared staging policy
They update a local draft and require Save plan before persistence

- An empty slot receives the candidate identity and only source-supported variant/level fields; unknown variant fields stay unknown
- A proven identical exact variant already targeted is a no-op that preserves authored rank, gem, and enchant goals
- A different or unresolved variant in an occupied slot opens a replacement summary naming both items and the goals that will be cleared, with Replace target and Keep current actions
- Confirming replacement clears the old item’s desired rank, gem, and enchant goals rather than silently copying them to the new target
- Incoming observed rank/level and enhancements remain source observations; they do not silently become authored enhancement goals or prove completion of the previous target
- The player can explicitly author enhancements after replacement; broader rules for transferring compatible enhancements are deferred
- Preserve full incoming exact-variant identity where supplied, including instance, bonus, and link evidence; do not reduce an exact owned copy to a bare item ID
- Resolve any pending inspector edits before staging a handoff, and retain their contents if replacement is canceled
- Validate class/spec/slot and multi-slot legality through existing contracts; if legality is unknown, show that state and do not enable a verified planned-set simulation

Settings remains a page, with four anchored sections: Connections, Appearance, Workspace, Local data
Sync becomes a labeled status row at the footer when expanded, retaining an accessible labeled control in the compact drawer
Errors link directly to the affected source and a return path; a successful file check never replaces an old source-observed timestamp

## Route compatibility

Use a centralized typed destination model instead of string splitting across Shell and page callbacks

| Existing location | Proposed canonical location |
| --- | --- |
| `/` and `/characters` | Keep roster, including `selected` query |
| `/tonight`, `/week`, `/settings`, `/setup` | Keep |
| `/characters/:id/overview` | Keep |
| `/characters/:id/progression` | `/characters/:id/gear/progress` |
| `/characters/:id/gear` | `/characters/:id/gear/plan` |
| `/characters/:id/inventory` | `/characters/:id/gear/owned` |
| `/characters/:id/simulations` | `/characters/:id/gear/simulations` |
| `/characters/:id/standings` | `/characters/:id/performance/standing` |
| `/characters/:id/top` | `/characters/:id/performance/leaders` |
| `/characters/:id/wardrobe` | Keep |

The Gear sidebar link defaults to Progress and Performance defaults to Your standing
Old links redirect with replace, preserve compatible character/activity/slot/return context, and never create a redirect loop
New History and Reports locations are `/characters/:id/performance/history` and `/characters/:id/performance/reports`
Unknown section names render a not-found recovery, rather than silently showing Overview
Return destinations must be validated internal destinations, never arbitrary external URLs

## Rollout order

1. Establish typed destinations, route aliases, return context, and regression coverage while keeping old feature screens
2. Replace the shell navigation and responsive drawer; add character context and shared activity controls without changing data storage
3. Assemble Gear and Performance child views from existing components, preserving old workflows and deep links
4. Simplify plan save behavior and add guarded Owned/Leaders → Plan handoffs; centralize draft leave protection
5. Improve Tonight/weekly continuity, Wardrobe hierarchy, Settings anchors, and read-only global search selection
6. Run the full existing test/debug suite plus navigation, dirty-state, accessibility, and responsive acceptance scenarios

Each stage should remain usable on its own and retain the current persistence/provider contracts
No dependency installation, model extraction, game-data rewrite, or new ranking engine is part of this UI redesign

## Acceptance requirements

- Seven primary destinations with separate workspace and character scope; no Character/Characters ambiguity
- Every existing audited capability remains reachable through the new hierarchy
- Roster remains the launch screen with a selected-character pane
- Character changes retain the active tool/view, and global pages do not navigate away on incidental context changes
- Back/Forward and old links restore the correct character, section, supported filters, selected slot/outfit, and return target
- Dirty Plan and Wardrobe state cannot silently disappear on navigation, activity change, character change, or app close
- No duplicate activity selectors within a character screen
- Zero characters, one character, 20+ characters, long names, duplicate names on different realms, archived/deleted identities, and unknown spec all have explicit behavior
- At 1460, 1100, and 820px the visible navigation retains readable labels and content never overflows horizontally
- At 650px window height the sidebar/drawer can scroll while utility controls remain reachable
- Keyboard-only navigation, visible focus, Escape dismissal, route announcements, and reduced motion work in dark and light mode
- Exact item variants, character/activity isolation, Tombstones, source timestamps, partial ownership, and existing verified-limit semantics are unchanged
- Native Windows controls and macOS layout clearance remain intact; macOS runtime validation must be reported separately

## Review boundary

This document proposes interaction and information architecture within the current visual world
It does not replace DESIGN.md or authorize guessed game data
Detailed implementation tasks follow design review; product code is intentionally unchanged in this design pass
