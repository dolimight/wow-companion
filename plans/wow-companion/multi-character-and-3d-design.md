# Multiple characters and real 3D models

Status: proposed feature design, 2026-10-14

This extends the existing WoW Companion plan and Apple-inspired mocks
Planning uses T3 Code's native planner, with documents and research kept locally
No application code, dependencies, provider authentication, or renderer integration has been created for this extension

## Intent and decisions

Keep one local owner and support their Retail roster, so they can inspect any character without replacing another character's data
Every character retains the current priorities: equipped gear, distance to a validated maximum, then activity-specific standing and useful next actions
Real 3D means a recognizable WoW character with their customization and switchable appearances, rather than rotating a generated illustration

Confirmed by the user: multiple characters, a roster overview plus a selected character, 3D model support, Electron/local operation, Apple design principles, T3 Code planning, and no trailing periods in UI copy
Recommended defaults from this plan: a quick switcher, favorites and a main-character pin, character-specific drafts, and a reusable outfit library
These defaults can change without changing the storage boundary
Multiple Battle.net collection scopes are representable, but automatic multi-account discovery is deferred
Use manual character lookup or addon import first; optional authenticated discovery follows the existing provider-coverage spike

## Roster and navigation

Add Characters above the existing Character, Gear planner, Standings, and Wardrobe navigation
Characters shows a sortable table: portrait, name/realm/region, class/spec, character level, equipped item level, attainable target gap, validated legal ceiling, activity metric, next action, and observation age
Use a compact activity selector for Mythic+, Raiding, and PvP; the selected activity changes its column and filters without creating a combined score
Unknown caps, private ratings, and incomplete snapshots display as unknown, never zero
Weekly objectives appear only with evidence; source coverage and regional reset boundaries stay visible where relevant
Do not compute cross-character upgrade priority until rewards, lockouts, and eligibility are known
Initially order next actions by the user's pinned character and explicit goals, with a reason shown for each action

The switcher lives in the sidebar header, searches name/realm/class, and supports keyboard navigation
Choosing another character retains the section where it makes sense, restores that character's filters and draft, and immediately updates the identity heading
Routes use the immutable local ID: /characters, /characters/$characterId/overview, /gear, /standings, and /wardrobe beneath that character path
Browser back/forward restores character and section together
Default startup opens Characters and restores the last selected character within that overview
The selected row shows a compact detail pane with gear gap, current activity standing, source age, and next action, plus Open character for the full sheet
Selecting a row changes that pane without leaving the roster; Open character enters the character's current detail section
Keep that selection in /characters?selected=$characterId so back/forward and reload restore the overview context
At narrower widths the selected-character details sit below the roster with a clear heading and focus target
An optional startup preference can restore the last full character section instead
The first-run empty state offers Add character and Import addon snapshot

Late responses may update their own character's cache, never the currently visible character's heading or data
Deleting or archiving the active character returns to Characters with a clear next selection
Archive is the initial removal action and preserves history; permanent deletion can follow an explicit local data-management feature
Other characters continue importing while one is selected

## Identity and ownership

Use an app-generated CharacterId as every foreign key
Store namespaced provider references and lookup aliases separately, including edition=retail, region, realm, provider character ID, and addon GUID when known
Neither a character name nor the currently selected UI character determines an import destination
Two identical names on different realms or regions remain separate
An exact existing provider reference can match a character; a rename/transfer that cannot be proven opens a link-review flow instead of silently merging histories
Conflicting provider references block that link, and an audited relink moves all references in one transaction
Public lookup means tracked, not verified owned

Keep SourceProfile separate from CollectionScope
A SourceProfile identifies a WoW installation/export location or provider connection
A CollectionScope identifies the collection population actually supported by its source, with an opaque local ID and evidence for membership
Directory account labels alone do not prove that separate profiles share a collection
Manual lookups start with unknown collection membership; users can explicitly associate a local scope, whose status remains user-declared
Never union all collected appearances across unrelated or unknown scopes
Store collected, not collected, and unknown independently from character eligibility
An absent appearance counts as not collected only in a complete, compatible collection snapshot; partial coverage or an unknown source leaves it unknown

## Per-character and shared state

| State | Scope |
| --- | --- |
| Gear snapshots and current customization | Character + source + observed time + game build |
| Gear builds and drafts | Character + spec + activity + ruleset |
| Ratings, raid progress, goals, and next actions | Character + season + activity, including spec/bracket/encounter where applicable |
| Comparison preferences | Character + activity |
| Outfit library template | Local owner, with explicit appearance variants and no assumed collection ownership |
| Outfit preview draft and camera | Character + outfit |
| Collected appearances | CollectionScope + source + observed time |
| Asset cache | Edition + game build + asset identity + content hash |

A shared outfit template can be tried on any character
Each application rechecks armor/weapon/class/race restrictions, slot legality, and collection status for that character
Saving a character-specific outfit copies the template's appearance choices into a new outfit; later template edits don't rewrite it
Shared gear recommendations and transferable-item advice are deferred until binding and transfer restrictions can be validated

## Imports and refreshes

Use one account-wide addon export table keyed by character GUID, with an envelope carrying schema/addon versions, game build, source profile, and export metadata
Each character record carries its own observedAt, session ID, sequence, payload digest, gear and customization coverage, and optional outfit/collection data
Logging into an alt updates that record without discarding previously observed characters
SavedVariables persistence still depends on normal logout or /reload; a desktop check every 60 seconds does not flush WoW's in-memory state
The addon has no direct WebSocket connection to Electron

The desktop watcher deduplicates by source and record digest, stages complete exports, validates records, then commits valid records with character IDs and revisions
An unreadable or partially written file preserves the last good state and retries on the next change/check
A malformed character record gets an import error; other valid character records can commit, and the import report records the partial result
Within a session, lower sequence values cannot overwrite higher ones; across sessions, preserve history and source observations without trusting sequence as a global clock
Stale provider data cannot replace a more recent authoritative observation
Uncertain ordering or conflicting sources stays visible instead of silently selecting an apparent winner

Emit character.changed only after the database transaction commits, with characterId and revision
The roster summary invalidates once for a committed batch, while detail query keys include characterId plus their existing season/spec/activity/source context
A reconnect fetches persisted revisions; do not require replay of every transient event
Last observed in game, last imported, and last file check remain separate per character/source
Bulk refresh uses a bounded queue with cancellation, per-provider backoff, and partial success; begin with concurrency 2 per provider and honor stricter provider limits

## 3D behavior

Use the same model stage on the Character sheet and in Wardrobe, loaded only when visible
The Character sheet defaults to the observed transmog; a clearly labeled Equipped appearance toggle previews the underlying gear when coverage permits
Wardrobe opens a larger stage with outfit slots, collected-only filtering, missing-piece sources, and save/duplicate actions
Draft changes never modify the imported look or apply changes in WoW

Support rotation, bounded zoom, reset view, front/back presets, pause/play idle animation, lighting presets, and a neutral background
Keep pointer motion attached to the drag, with immediate feedback and interruptible camera changes
Provide buttons/keyboard alternatives to drag and wheel gestures
Automatic rotation starts off; reduced-motion disables camera inertia and starts the model paused
Pause animation while hidden/minimized, and render static scenes on demand
Use the existing system typography, adaptive light/dark colors, and restrained translucent toolbars with opaque accessibility alternatives
Keep fonts and other platform-specific assets within their allowed use; Apple-inspired design doesn't require shipping Apple-only fonts

Appearance data uses source identities and variants, separate from combat item IDs
Represent left/right shoulders independently, hidden-slot choices, supported weapon illusions, and explicit customization option/choice IDs
The adapter maps those source identities to build-specific renderer IDs; it must not equate item ID, appearance ID, display ID, and modified appearance ID
Preserve unresolved identities and show which piece cannot render
Unknown customization prompts a correction with provenance instead of claiming an exact match

The standard equipped humanoid/visage is the first model target
Dracthyr dragon forms, Worgen forms, Mechagnome parts, druid forms, and other special models get explicit capability entries
Unsupported forms stay labeled unavailable and retain the outfit editor; a substituted body cannot appear as an exact preview
Support breadth must follow tests, including the user's actual roster once provided
Screenshot export is a later capability after complete local texture loading is proven
Applying outfits to WoW, mounts/pets, scenes, 3D printing, and arbitrary mesh editing are outside this phase

## Renderer and asset decision

Preferred investigation: a local WoW-aware model/texture/customization pipeline, using wow.export's current renderer and data handling as a candidate for reuse behind an adapter
Its upstream README reports Retail support and model export, while recent release notes report equipment previews and customization improvements [wow.export](https://github.com/Kruithne/wow.export), [release notes](https://github.com/Kruithne/wow.export/releases)
Those features make it promising research material; they do not demonstrate an embeddable SDK or compatibility with this application
Its code license does not establish permission to redistribute Blizzard/Wowhead assets
Record code provenance, license obligations, and the selected asset access route before integration

Evaluate these routes in this order

1. Local compatible game data plus a reusable WoW-aware assembly/rendering adapter, with conversion work isolated from Electron's UI
2. Explicit local model bundles as an initial inspection path; Three.js can load glTF, but a flattened exported character cannot satisfy live gear swaps or customization [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader)
3. A provider-backed web renderer only if its supported access and current Retail coverage are established; the Miorey wrapper depends on Wowhead scripts/data and describes a replica server, so it is not the default production dependency [wrapper requirements](https://github.com/Miorey/wow-model-viewer#-requirements)

Do not disable Electron web security or embed unreviewed remote executable scripts to make a renderer work
The renderer receives app-owned asset handles, not arbitrary filesystem access or credentials
Conversion workers read only the configured asset source and write the versioned cache
If a particular asset is encrypted or unavailable through the supported route, report it as missing
First-run extraction may need network metadata; offline guarantees cover only already resolved cached assets and complete local bundles

### Feasibility gate

Run a bounded 3D investigation before building the production integration: two working days of implementation effort, then record pass, partial, or fail
This is a scope cap on the investigation, not a delivery estimate or proof that it will succeed
Record exact source commits, asset builds, hardware, screenshots, network dependencies, and unresolved gaps in research/3d/FEASIBILITY.md

The minimum passing vertical slice loads two representative current-Retail characters from distinct races/body models and their actual customization, then swaps armor and weapons without re-exporting a flattened character
It must verify asymmetric shoulders, one hidden slot, one appearance variant, textures/attachments, and character switching during a slow load
Use a supported special form as an additional capability test; failure keeps that form out of the supported matrix
Compare against in-game reference captures or a trusted reference from the same build
Record animation, illusion, and special-form support separately so a static mesh cannot count as animation success

Provisional acceptance budgets on the recorded development machine: cached initial stage ready within 3 seconds, cached slot swap within 500 ms, and at least 30 FPS during rotation at 1280 × 900
Measure ten warm loads/swaps and report median/p95; first extraction has separate progress and timings
After 20 character switches, live scene/resource counts must return to their prior baseline after disposal; monitor process memory for unbounded growth
Missing textures, a mismatched game build, offline requests, and WebGL context loss must show recoverable states while preserving the draft
Cached bundles must work with network disabled

If the gate fails, continue the roster and 2D outfit editor, report the exact blocked capability, and leave real 3D unfinished
A static image or imported flattened model can provide an explicitly labeled fallback, not completion of the interactive wardrobe requirement
New custom M2/CASC renderer work requires a separately sized proposal based on the failed experiment

## Delivery sequence and completion

The base Electron/SQLite/provider foundation from the original plan is still a prerequisite, not existing software
Build roster identity, persistence, and imports before tying saved outfits to characters
The 3D feasibility work can run independently of roster UI implementation, but production integration waits for a passed asset route
Then add the model stage, outfit mapping, and character-switch lifecycle

The roster release is complete when multiple characters survive restart, imports cannot cross identities, each activity stays separate, and switching characters restores their own drafts and source timestamps
The 3D release is complete only when real supported characters render from the selected source, editable outfits change the correct models, saved outfits reload, and failure/offline behavior passes the capability matrix
Current HTML mocks remain unchanged and illustrative

## Local planning artifacts

- [Roster implementation plan](multi-character-implementation.md)
- [3D implementation plan](3d-model-implementation.md)
- [Plan overview](multi-character-and-3d-overview.html)

## Evidence and limits

An independent builder check found no important unanswered planning questions; renderer compatibility and asset access remain evidence for the explicit feasibility gate
Research checked 2026-10-14, without authenticated API calls or a runnable model test
Blizzard announced appearance and transmog collection endpoints, including item appearance links; this establishes metadata discovery, not a complete 3D asset pipeline [official announcement](https://us.forums.blizzard.com/en/blizzard/t/item-appearance-and-transmog-apis/51532)
The current developer portal could not be fetched in this session, so endpoint payload coverage, customizations, and account scopes remain verification work
Three.js documents explicit resource disposal, which the switch lifecycle must implement for any Three-based path [cleanup guide](https://threejs.org/manual/pages/cleanup.html)
Known-issues pages can lag release notes; test selected commits rather than treating an old issue list as a definitive current support matrix
