# Multiple Character Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking
> Resolve those execution skills at implementation kickoff; if unavailable, report the missing prerequisite and use the user's chosen available execution method

**Goal:** Persist a Retail roster and safely switch between each character's progression, comparisons, builds, and outfit drafts

**Architecture:** One local SQLite database owns immutable character IDs and namespaced source identities. Effect services commit imports before tRPC notifications, while TanStack routes and query keys preserve character context

**Tech Stack:** Electron, React/TypeScript, shadcn/ui, TanStack Router/Query/Table, Effect v4, tRPC WebSockets, SQLite/Drizzle, Vite+

**Spec:** [Multiple characters and real 3D models](multi-character-and-3d-design.md)

## Global Constraints

- One local owner, Retail, Windows-first, local storage and T3 Code planning
- Use app-generated CharacterId as every foreign key
- Neither a character name nor the currently selected UI character determines an import destination
- SavedVariables persistence still depends on normal logout or /reload; a desktop check every 60 seconds does not flush WoW's in-memory state
- Never union all collected appearances across unrelated or unknown scopes
- Current HTML mocks remain unchanged and illustrative
- No trailing periods in UI copy

## Preconditions and proposed file layout

No scaffold, package manifest, or runtime database exists yet
First complete the original plan's foundation spike: pinned compatible dependencies, Electron main/preload/renderer, restricted app protocol, authenticated loopback tRPC, one database worker, and packaged SQLite round-trip
Establish `vp test` for tests, `vp run dev` for Electron development, `vp run build` for the Electron build, and `vp run package:win` for an unpacked Windows build
These commands are planned contracts, not runnable checks in the current documents-only workspace
Vite+ documents its bundled runner and vite.config.ts test configuration [test guide](https://www.viteplus.dev/guide/test)
Use the original foundation to prove interaction with electron-vite before freezing configuration
Initialize version control at implementation kickoff; commits below assume a repository then exists

The files below are proposed additions to that foundation, not claims about existing source
Keep SQL access in `src/workers/database`, Effect orchestration in `src/main`, wire/domain schemas in `src/shared`, and presentation in `src/renderer`

## Review Focus

1. Identical names, renames, and transfers cannot attach history to the wrong character, tested in Task 1
2. Partial addon writes and stale exports preserve the last usable snapshot, tested in Task 2
3. A slow refresh for A after switching to B cannot change B's visible state, tested in Task 3
4. Unknown collection membership cannot imply collected status, tested in Tasks 1 and 4
5. Offline operation, resets, and archival preserve drafts and do not invent weekly rewards, tested in Tasks 3 and 4

---

### Task 1: Identity, collection boundaries, and durable roster

**Files:** Create `src/shared/roster.ts`, `src/workers/database/roster-repository.ts`, `src/workers/database/migrations/0002-roster.sql`, `src/workers/database/roster-repository.test.ts`

**Interfaces:**

- Define opaque `CharacterId`, `CollectionScopeId`, `SourceProfileId`, and `SnapshotId` string types in roster.ts
- `ProviderRef = { provider: string; edition: 'retail'; region: string; realmId: string; characterKey: string }`, with provider-specific validation before acceptance
- `IdentityInput = { refs: ProviderRef[]; name: string; realmLabel: string; sourceProfileId: SourceProfileId }`
- `resolveIdentity(input: IdentityInput): Promise<{kind:'matched'; characterId:CharacterId} | {kind:'new'} | {kind:'review'; conflictingIds:CharacterId[]}>`
- `RosterRepository.add(input: IdentityInput): Promise<CharacterId>` and `setArchived(id: CharacterId, archived: boolean): Promise<void>`
- `linkIdentity(characterId: CharacterId, input: IdentityInput): Promise<void>` runs in a transaction, rejects conflicting refs, and records an audit event
- Persist `characters`, `character_refs`, `character_aliases`, `source_profiles`, `collection_scopes`, `character_collection_links`, and identity audit records
- Scope links carry `evidence: 'authenticated' | 'addon' | 'user-declared'`, source, and observation time; absent evidence stays unlinked

- [ ] Write failing `roster-repository.test.ts` cases: same name on two realms creates distinct IDs; exact ref matches existing ID; conflicting refs return review; rename with unchanged proven ref retains history; archive/unarchive preserves rows; restart reloads roster and scope links
- [ ] Run `vp test src/workers/database/roster-repository.test.ts`; expect the missing implementation to fail
- [ ] Implement the schema/repository and transactional identity linking with unique namespaced refs and no name-only matching
- [ ] Run the same command; expect all cases to pass, including rollback when an identity link conflicts
- [ ] Commit `feat: persist character roster and source identities`

### Task 2: Batch addon imports and character-scoped notifications

**Files:** Create `addon/WoWCompanion.toc`, `addon/WoWCompanion.lua`, `src/shared/addon-export.ts`, `src/main/imports/import-roster.ts`, `src/main/imports/watch-roster.ts`, `src/main/imports/import-roster.test.ts`, `src/main/imports/fixtures/roster-exports.ts`
Modify the foundation's tRPC router in `src/main/rpc/router.ts`

**Interfaces:**

- `AddonEnvelope` and `AddonCharacterRecord` runtime schemas implement the design's versioned envelope and per-character coverage/timestamps
- `ImportReport = { imported:CharacterId[]; unchanged:CharacterId[]; errors:Array<{recordKey:string; reason:string}>; revision:number }`
- `importRoster(input: unknown, sourceProfileId:SourceProfileId): Promise<ImportReport>` uses Task 1 identity matching; unresolved matches stay in an import review queue
- Shared `CharacterChanged = { characterId:CharacterId; revision:number }` and `RosterChanged = {revision:number}` event types live in addon-export.ts
- Router subscriptions `character.changed({characterId})` and `roster.changed()` emit these events after commit; queries always recover committed state on reconnect
- Watcher uses change events plus a 60-second fallback; parsing reads data only and never executes SavedVariables as Lua

- [ ] Add fixtures for two characters, identical re-import, partial file, invalid character record, old sequence, newer provider conflict, and a new session with sequence reset
- [ ] Write failing tests asserting each record reaches its own character, invalid record does not prevent valid record import, a partial file commits nothing, repeat export emits no change, sequence cannot regress within a session, and notifications observe committed rows
- [ ] Run `vp test src/main/imports/import-roster.test.ts`; expect failures before implementation
- [ ] Implement account-wide addon records and staged imports, preserve raw provenance, retain unknown fields as coverage gaps, and report conflicting freshness without overwriting newer authoritative data
- [ ] Run the same tests; expect pass, with distinct observed/imported/file-check timestamps
- [ ] Verify in real Retail: visit two characters, change gear, /reload or logout, import both records, and inspect identity and observation times; record exact client/API versions
- [ ] Commit `feat: import character roster snapshots safely`

### Task 3: Roster, switcher, and race-safe navigation

**Files:** Create `src/shared/roster-summary.ts`, `src/renderer/features/roster/roster-queries.ts`, `src/renderer/features/roster/CharacterSwitcher.tsx`, `src/renderer/features/roster/CharactersPage.tsx`, `src/renderer/features/roster/SelectedCharacterPane.tsx`, `src/renderer/features/roster/roster-navigation.test.tsx`, `src/main/roster/refresh-roster.ts`, `src/main/roster/refresh-roster.test.ts`
Modify `src/main/rpc/router.ts` and `src/renderer/router.tsx` from the foundation

**Interfaces:**

- `Activity = 'mythicPlus' | 'raiding' | 'pvp'`, `RosterSummary` carries explicit metric/context, nullable item-level cap/target, source age, and optional evidenced next action
- `roster.list({activity, seasonId}) -> RosterSummary[]`, `roster.setFavorite({characterId,favorite})`, `roster.setMain({characterId})`, `roster.archive({characterId})`
- `refreshRoster({characterIds:CharacterId[], provider:string}, signal:AbortSignal): Promise<ImportReport>` reuses Task 2 report semantics with concurrency 2 per provider or a stricter provider limit
- `rosterKeys.list(activity,seasonId)` and `characterKeys.detail(characterId,context)` generate non-overlapping TanStack keys; context includes source/season/spec/activity as appropriate
- Every character-bound route accepts CharacterId, and all job completions use the ID captured at job creation
- The roster route uses the validated `selected` search parameter for its detail pane, falling back to the last selected non-archived character

- [ ] Write failing navigation tests: startup opens roster with the last character selected; row selection updates its detail pane without navigation; Open character enters the selected detail section; A starts refresh, user chooses B, A finishes, B remains visible; back/forward restores A/B and section; archive active character returns to roster; private/no rating renders Unknown; keyboard switcher selection moves focus predictably
- [ ] Write queue tests: at most 2 requests per provider, backoff respects a stricter limit, cancel stops pending work, one failure preserves successful characters, reconnect refetches latest revisions
- [ ] Run `vp test src/renderer/features/roster/roster-navigation.test.tsx src/main/roster/refresh-roster.test.ts`; expect failures before implementation
- [ ] Implement the roster table, selected-character pane, and switcher using the existing Apple-inspired design tokens; render portraits rather than a WebGL canvas for every roster row
- [ ] Implement the refresh queue, query invalidation, startup preference, and source-specific timestamps; unknown weekly state creates no fabricated task/reward
- [ ] Repeat the tests; expect pass, then manually check light/dark, keyboard focus, 200% text scaling, reduced motion, empty roster, and 50 fixture characters
- [ ] Commit `feat: add roster overview and character switching`

### Task 4: Saved plans, history, and cross-character outfit reuse

**Files:** Create `src/shared/character-plans.ts`, `src/workers/database/character-plans.ts`, `src/workers/database/migrations/0003-character-plans.sql`, `src/workers/database/character-plans.test.ts`, `src/renderer/features/character-plans/plan-queries.ts`
Modify the gear/standings/wardrobe feature modules when the original single-character foundation creates them, and `src/main/rpc/router.ts`

**Interfaces:**

- `PlanContext = {characterId:CharacterId; specId:number; activity:Activity; rulesetId:string}`
- `saveGearDraft(context:PlanContext, draft:GearDraft): Promise<{revision:number}>`; GearDraft's slot/item schema comes from the original gearing feature, never an HTML mock
- `OutfitTemplate` and `CharacterOutfit` store the canonical appearance choices defined in the 3D plan, with template origin recorded and character copies independent
- `copyOutfit(templateId:string, characterId:CharacterId): Promise<{outfitId:string; eligibility:'eligible'|'ineligible'|'unknown'; collection:'collected'|'missing'|'unknown'}>` evaluates current character/source evidence
- `getCollectionStatus(scopeId:CollectionScopeId|null, appearance:AppearanceRef): 'collected'|'missing'|'unknown'` never treats null as a shared global collection

- [ ] Write failing tests: A and B drafts differ and survive restart; activity/spec contexts remain distinct; template edits do not rewrite saved copies; unknown membership stays unknown; absent appearances in partial collection snapshots stay unknown while complete snapshots can report missing; an ineligible appearance can stay wishlisted but cannot appear as usable; archive/unarchive retains all plans
- [ ] Run `vp test src/workers/database/character-plans.test.ts`; expect failures before implementation
- [ ] Implement database-backed draft autosave with pending/error feedback and last-save revision; imports preserve saved drafts, and offline reload restores committed content
- [ ] Repeat tests; expect pass, then run a packaged Windows smoke check with two characters, separate ratings, saved gear/outfits, restart, and network disabled
- [ ] Record evidence under `research/roster/ACCEPTANCE.md`, including unknown cap and regional-reset cases from the existing rules engine
- [ ] Commit `feat: retain per-character builds and shared outfit templates`

## Handoff

This is an implementation proposal awaiting feature review, not authorization to scaffold or run integration work during this planning task
After implementation, roster support can ship independently of the 3D feasibility result
