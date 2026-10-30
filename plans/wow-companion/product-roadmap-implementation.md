# WOW Companion Product Roadmap Implementation Plan

> **For agentic workers:** Use T3 Code's native planner and these repository-local files to execute the checked tasks in dependency order. Preserve the user's agent-team preference when execution is requested, with explicit file ownership and integration checks

**Goal:** Implement all seven roadmap specs so the player can understand progression, plan useful sessions, compare exact gear and relevant peers, and manage outfits with evidence-backed recommendations

**Architecture:** Preserve the existing Electron main/preload boundary, tRPC service, database/game-data workers, and React application. Add shared versioned contracts, deterministic calculations, provider/simulation adapters, and small feature surfaces that consume those results. Keep character data and plans local, with independent capability gates for external providers, local simulations, and real desktop character rendering

**Tech Stack:** Existing Electron, React, TypeScript, shadcn Base UI, TanStack Router/Query/Table, Effect v4, tRPC WebSockets, Vite+, Drizzle/better-sqlite3, and the companion Lua addon

**Spec:** [Seven-spec index and shared requirements](../../docs/specs/README.md)

**Research:** [27 October 2026 research brief](../../docs/research/2026-10-27-product-roadmap.md)

**Status:** S1 implementation is available, with compatibility, progression calculations/UI, per-character/activity preferences, additive item/resource observations, and focused evidence contracts. Real seasonal ceilings remain gated on a manually verified ruleset and complete candidate catalog. S2–S7 remain roadmap work except for the shared foundations required by S1

S1 evidence: full TypeScript/unit checks, compiled-worker WebSocket integration, Lua capture fixtures, native Electron debugger acceptance, and the installed-client item-index check under `.local/s1-compatibility-live/evidence.json`

The unchecked roadmap tasks below retain their original multi-spec scope; S4 complete-plan comparison and the full S7 evidence store are not claimed by this S1 implementation

## Global constraints

- Use T3 Code's native planner and repository-local Markdown; do not use visual-plan or a separate Plan viewer
- Use Apple design principles, the pure-black dark theme, the resizable sidebar, and the integrated native window controls
- Use shadcn Base UI Select and Toggle controls instead of native select elements or checkbox inputs
- Do not end user-facing copy with a period
- Keep Mythic+, Raiding, and PvP metrics and progression separate
- Unknown, missing, and stale values remain distinguishable from observed zero or explicitly empty values
- Retain existing imports, character identities, deletion suppression, settings, saved drafts, and backups through migrations
- Main owns secrets, external requests, executable paths, and filesystem access; the sandboxed renderer consumes typed results and narrow native actions
- Never report a legal maximum without validated rules and a completed legal-set search
- Preserve source attribution and provider retry behavior; never infer a full-population percentile from a sample
- No automatic gear changes, currency spending, reward claims, or transmog purchases
- Do not redistribute extracted game artwork or assume a third-party renderer has passed the installed-build gate

The user's native-planner requirement governs execution; this plan does not require installing or switching to a separate planning/execution skill

## Review focus

1. Old addon/backup schemas and incomplete logout captures must preserve usable data and truthful observation times — T02 and T03 pin these regressions
2. The same item ID can describe different variants, and unknown fields cannot prove completion — T03, T07, and T12 pin these cases
3. Future rules, reset boundaries, unsupported builds, and interrupted optimization must not publish false maxima or current recommendations — T01, T05, T06, and T08 pin these cases
4. A character can be deleted or the selected spec can change during asynchronous provider/simulation work — T02, T11, T13, and T19 pin isolation and cancellation
5. Provider samples, private reports, missing assets, and unsupported rendering capabilities must remain partial/unknown rather than silently substituted — T13, T14, T17, and T18 pin the fallback behavior

## Milestones and dependency order

| Milestone | Tasks | User-visible exit condition |
| --- | --- | --- |
| M0 — Evidence and exact observations | T01–T03 | Existing data survives migration and source/freshness details remain truthful |
| M1 — Compatibility and progression | T04–T07 | Search respects character/spec restrictions and supported progression explains legal sets and costs |
| M2 — Tonight | T08–T09 | A useful offline-capable session plan works without simulations |
| M3 — Modeled gear decisions | T10–T12 | Supported simulations and Vault alternatives use reproducible baselines |
| M4 — Relevant comparisons | T13–T14 | Leader/peer/history views name their population and supported context |
| M5 — Outfits and previews | T15–T16 | Collection-aware outfit plans round-trip to an in-game preview |
| M6 — Desktop character rendering | T17–T18 | Real-character assembly passes its gate before shipping dynamic 3D |
| M7 — Integrated release | T19 | All enabled capabilities pass migration, offline, packaged, and debugger checks |

Critical path: T01 → T02 → T03 → T04/T05 → T06 → T07 → T08 → T09

Then T10 → T11 → T12 adds modeled decisions; T13–T14 and T15–T16 can proceed independently after their listed dependencies

T17 may investigate rendering while other milestones proceed. T18 depends on a passing T17, not on optimistic estimates

## Execution rules

Each task follows the same cycle: add the named failing regression/contract test, run it, implement the listed interfaces, run the task's checks, and record its evidence before advancing

Use `npx vp test <path>` for focused tests, `npm run check` for the full suite/typecheck, `npm run build` for production compilation, and `npm run test:debug` for actual main/renderer debugger coverage

Use fixture databases and `.local` artifact directories for automated tests. Never delete or alter real roster entries to demonstrate deletion behavior

Before migrations touch real user data, create a transactionally consistent backup using the existing SQLite connection or backup API. Never copy a live database without handling its WAL

At each milestone, review only that milestone's changes and create a scoped checkpoint if committing is appropriate. The inspected checkout contains untracked application files; establish a safe baseline and never stage unrelated work with `git add .`

Update native task status as implementation progresses. Do not interpret this planning request as authorization to start building every feature now

## T01 — Establish evidence and evaluation contracts

**Spec:** S7-R1–R6 · **Depends on:** none

**Files:** Create `src/shared/evidence.ts`, `src/shared/evidence.test.ts`, `src/main/evidence/canonical.ts`, `src/main/evidence/canonical.test.ts`

**Interfaces:** Produce the S7 schemas/types, `evaluateEvidence(record, policy, context): EvidenceState`, and `hashEvidenceValue(value: unknown): string`. Shared evaluation stays pure; main owns canonical SHA-256 hashing

- [ ] Define the S7 contracts and source/coverage enums, including null observation times and immutable `EvidenceRef` values
- [ ] Add fixed-clock tests for unknown/future times, age limits, clock skew, reset/season/build changes, and canonical property ordering
- [ ] Implement freshness evaluation and canonical hashing; exclude retrieval-only timestamps from content identity
- [ ] Run `npx vp test src/shared/evidence.test.ts src/main/evidence/canonical.test.ts`; expect every named condition to pass without network access

**Exit:** Other tasks can consume one evidence model and an injected evaluation clock

## T02 — Add additive persistence, migrations, and backup compatibility

**Spec:** S7-R1–R3, R7–R8 · **Depends on:** T01

**Files:** Create `src/workers/database/migrations.ts`, `src/workers/database/migrations.test.ts`, `src/main/evidence/service.ts`; modify `src/workers/database/schema.ts`, `repository.ts`, `repository.test.ts`, `src/main/database.ts`, `src/main/local-service.ts`, `src/main/rpc/router.ts`, `src/renderer/lib/client.ts`, and existing backup/import entry points in `src/main/index.ts`

**Interfaces:** Add repository `saveEvidence(records: EvidenceRecord[]): {revision: number}`, `getEvidence(ids: string[]): EvidenceRecord[]`, and versioned migration/backup operations. Expose `getEvidence` through tRPC and a main `createEvidenceService` with source-specific merge policies

- [ ] Add version 1 database/backup fixtures with selected characters, drafts, outfits, deletion suppression, and partial observations
- [ ] Implement an idempotent migration runner with a schema-version ledger and transaction boundaries; retain original character IDs and payloads
- [ ] Add immutable evidence storage and validated parent/subject references; backfill unknown provenance without treating migration time as observation time
- [ ] Add backup version 2 writes and version 1/2 reads; reject orphaned/foreign references atomically and exclude secrets/large binary artifacts
- [ ] Add tests that a rating retrieval cannot freshen gear, an empty logout cannot wipe gear, and a delayed write cannot resurrect a deleted subject
- [ ] Run `npx vp test src/workers/database/migrations.test.ts src/workers/database/repository.test.ts` and `npm run typecheck`; expect repeat migrations and failure rollback to preserve fixtures

**Exit:** Evidence persists safely and existing imports/backups still work

## T03 — Capture exact variants, inventory coverage, and frozen baselines

**Spec:** S4-R1–R3, R8 · **Depends on:** T01–T02

**Files:** Create `src/shared/gear-variants.ts`, `src/shared/gear-variants.test.ts`, `src/main/gear/baselines.ts`, `src/main/gear/baselines.test.ts`, `addon/tests/variant-export.lua`; modify `src/shared/domain.ts`, addon envelope/parser tests, `addon/WoWCompanion.lua`, `addon/WoWCompanion.toc`, provider adapters, and database schema/repository

**Interfaces:** Produce S4 contracts and `captureGearBaseline(input): GearBaseline` in main. Persist a baseline ID, canonical content hash, exact variants/talents/spec, context, and evidence refs. Add `getGearBaseline(characterId: string): GearBaseline` and inventory read/write repository operations

- [ ] Add fixtures for same-ID variants, duplicate instances, opaque bonus IDs, manual placeholders, explicitly empty enhancements, and unknown bank/Vault coverage
- [ ] Extend runtime schemas additively with per-field variant coverage; preserve raw links and only normalize fields whose ordering semantics are established
- [ ] Add addon schema version 2 writes with paired version 1/2 readers; capture bags and only observed bank/Vault contents, keeping missing access unknown
- [ ] Store inventory snapshots and immutable baselines; main calculates hashes using T01 canonicalization
- [ ] Add source merge tests for partial captures and legacy spec-zero drafts; retain current plan IDs and positive observed levels
- [ ] Run `npx vp test src/shared/gear-variants.test.ts src/main/gear/baselines.test.ts src/main/imports/parse-snapshot.test.ts src/workers/database/repository.test.ts`
- [ ] Run `lua addon/tests/empty-snapshot.lua` and `lua addon/tests/variant-export.lua` with a compatible Lua runtime, then record an actual two-character reload/logout capture. If the runtime/game prerequisite is absent, record the missing check rather than marking addon validation complete

**Exit:** Every downstream decision can reference an exact or explicitly partial baseline

## T04 — Finish character/spec-aware search from index to selection

**Spec:** S1-R4, R8 · **Depends on:** T03

**Files:** Modify `src/shared/gamedata.ts`, `src/shared/item-compatibility.ts`, `src/main/gamedata/engine.ts`, `src/main/gamedata/client.ts`, `src/workers/gamedata/entry.ts`, `src/renderer/features/items/items.tsx`, `items.css`, `src/renderer/lib/plan-item.ts`; add `src/shared/item-compatibility.test.ts`, `src/main/gamedata/engine.test.ts`; extend `plan-item.test.ts`

**Interfaces:** Preserve `getItemCompatibility(item, character, {slot})` with `{compatible, verified, reason}` and extend `ItemSearch.character` plus indexed summary metadata to the same contract. Unknown restrictions remain unverified rather than implicitly allowed as confirmed

- [ ] Inspect supported-build table layouts and validate class masks, primary-stat fields, explicit spec overrides, weapon proficiencies, and slot rules against source-backed fixtures
- [ ] Version the index and add the necessary restriction metadata; rebuild atomically and preserve or reopen the previous usable index if a rebuild fails
- [ ] Filter compatible candidates before name deduplication and final result limits; page candidates until the limit or query exhaustion, with a fixture where valid matches appear beyond the first page
- [ ] Apply immediate character/spec/slot query keys, clear stale highlighted results on alt changes, and recheck compatibility when adding through search or Top players
- [ ] Preserve broad browsing with no selected character while making unknown class/spec/metadata coverage visible
- [ ] Run `npx vp test src/shared/item-compatibility.test.ts src/main/gamedata/engine.test.ts src/renderer/lib/plan-item.test.ts`; cover Blood, Fury two-hand off-hand, Protection shield, Hunter variants, casters, wrong armor, required level, and unknown/zero spec

**Exit:** Known incompatible items cannot enter a plan through any supported selection path

## T05 — Introduce dated seasonal rules and content preferences

**Spec:** S1-R3, R6, R8 · **Depends on:** T01, T03

**Files:** Create `src/shared/season-rules.ts`, `src/shared/season-rules.test.ts`, `src/main/progression/rules.ts`, `data/season-rules/README.md`, `data/season-rules/catalog.json`; modify settings persistence and `src/shared/weekly.ts`

**Interfaces:** Produce `SeasonRuleset`, `ContentPreferences`, and `resolveSeasonRuleset(catalog, context): SeasonRuleset | null`. Define `SeasonRulesCatalog` in `season-rules.ts` with entries, source provenance, fixture references, and validation status

- [ ] Add unsupported-build, future-effective, retired-season, overlapping-rule, and incomplete-rule fixtures before enabling a real ruleset
- [ ] Define reward tables, upgrade tracks/costs, supplied equipment restrictions, and reset/weekly fallback policy; observed client thresholds retain precedence
- [ ] Load only rulesets whose source checks and validation fixtures passed; an empty catalog returns unsupported without a guessed cap
- [ ] Store per-character/activity content preferences through the database worker and expose typed read/update RPCs
- [ ] Run `npx vp test src/shared/season-rules.test.ts src/shared/weekly.test.ts`; manually verify at least one real supported ruleset and its effective interval before marking this task's real-data gate passed

**Exit:** Calculations use one explicit dated ruleset, or report unsupported

## T06 — Calculate legal ceilings and affordable upgrade paths

**Spec:** S1-R1–R2, R5, R7–R8 · **Depends on:** T03–T05

**Files:** Create `src/shared/progression-evaluation.ts`, `src/shared/progression-evaluation.test.ts`, `src/shared/gear-set-validation.ts`, `src/shared/gear-set-validation.test.ts`, `src/main/progression/service.ts`; modify `src/shared/progression.ts`, tRPC services, and client bindings

**Interfaces:** Implement S1 `evaluateProgression(input): ProgressionResult`; produce `validateGearSet(items: ItemVariant[], ruleset: SeasonRuleset, baseline: GearBaseline): GearSetValidation`, defining its valid/invalid/unknown state and violation list in the same module. Expose `getProgression({characterId, activity})`

- [ ] Add fixtures for each ceiling, weighted two-hand/dual averages, unique/crafted conflicts, source exclusions, observed currency discounts, and missing balances
- [ ] Evaluate legal configurations using branch-and-bound over validated candidate variants with a default 100,000-state budget; return partial with best-known set and bound if the budget is exhausted, never a proved maximum
- [ ] Keep each ceiling's acquisition assumptions distinct and include per-slot reasons, exact variants, costs, evidence refs, and unresolved constraints
- [ ] Use a single currency ledger for whole-set affordability; never subtract the same resource independently in separate slot suggestions
- [ ] Run `npx vp test src/shared/progression.test.ts src/shared/progression-evaluation.test.ts src/shared/gear-set-validation.test.ts`; assert that unsupported constraints or incomplete search cannot produce a verified cap

**Exit:** Supported examples produce reproducible legal results and honest partial states

## T07 — Ship progression and complete-plan states in the UI

**Spec:** S1-R1–R2, R6, S4-R4–R6 · **Depends on:** T06

**Files:** Create `src/shared/plan-completion.ts`, `src/shared/plan-completion.test.ts`, `src/renderer/components/EvidenceInspector.tsx`, `src/renderer/features/progression/progression.tsx`, `progression.css`; modify the planner/roster route boundaries in `src/renderer/App.tsx`, `src/renderer/lib/gear-plan-match.ts`, and `src/main/desktop-acceptance.ts`

**Interfaces:** Implement S4 `comparePlanCompletion(input): PlanCompletion`, consuming T06 legality and T03 variants. UI consumes `getProgression` and `getEvidence` rather than duplicating rules

- [ ] Add tests that the same item ID can complete acquisition while leaving rank/enhancements incomplete, and that unknown details cannot prove full completion
- [ ] Add the five scoped progression views with slot reasons and editable content preferences, keeping personal targets separate
- [ ] Add the shared evidence inspector using T02 reads, with source, observation/retrieval times, coverage, and keyboard navigation; T19 later adds complete cross-feature recommendation explanations
- [ ] Update Current/Planned rows to show separate completion states, accessible dimming, and outstanding work
- [ ] Add native checks for unsupported caps, budget shortfalls, slot explanations, keyboard editing, evidence navigation, and light/dark/minimum-width layouts
- [ ] Run focused plan-completion tests, `npm run check`, `npm run build`, and `npm run test:debug`; save the evidence path for M1

**Exit:** M1 delivers useful progression and plan completion without requiring a simulation engine

## T08 — Generate and rank session actions deterministically

**Spec:** S2-R1–R8 · **Depends on:** T02, T06–T07

**Files:** Create `src/shared/session-plan.ts`, `src/shared/session-plan.test.ts`, `src/main/session-plan/actions.ts`, `actions.test.ts`, `src/main/session-plan/service.ts`; modify database schema/repository and service wiring

**Interfaces:** Produce S2 contracts and `buildSessionPlan(input): SessionPlan`. Main produces `collectActionCandidates(characterIds: string[], goal: SessionGoal, context: EvaluationContext): Promise<ActionCandidate[]>`; expose `getSessionPlan`, `saveSessionGoal`, and `setActionDisposition` RPCs

- [ ] Add fixtures for time budgets, unavailable prerequisites, observed weekly progress, unknown durations, reset changes, and competing currency spends
- [ ] Generate evidence-linked weekly, affordable-upgrade, targeted-content, and incomplete-plan actions without relying on S3/S5/S6
- [ ] Rank using the S2 lexicographic policy; enforce joint resource/prerequisite feasibility across scheduled actions and do not add benefit vectors from different metrics
- [ ] Persist goals, pins, dismiss/snooze/undo history, and duration samples with character/spec/activity context
- [ ] Run `npx vp test src/shared/session-plan.test.ts src/main/session-plan/actions.test.ts`; assert stable ordering across unrelated refreshes and no fabricated numeric benefits

**Exit:** The same inputs and clock yield the same explained session plan

## T09 — Add the Tonight route and roster recommendation

**Spec:** S2 interface and persistence behavior · **Depends on:** T08

**Files:** Create `src/renderer/features/tonight/tonight.tsx`, `tonight.css`; modify `src/renderer/App.tsx`, `src/renderer/lib/client.ts`, and `src/main/desktop-acceptance.ts`

**Interfaces:** Consume T08 RPCs; link actions to existing character/activity/slot/source routes and the T07 evidence inspector

- [ ] Add time/goal/character controls, one recommended action, up to four alternatives, explicit unscheduled states, and a selected-character recommendation
- [ ] Add pin, snooze, dismiss, undo, and return-to-source actions; retain the displayed pinned plan during irrelevant refreshes
- [ ] Add native flows for offline startup, cross-character isolation, reset transition, unknown duration, persistence, and keyboard use
- [ ] Run `npm run check`, `npm run build`, and `npm run test:debug`; record M2 evidence with simulations disabled

**Exit:** The player can choose a useful action before logging in using existing evidence alone

## T10 — Add supported simulation profiles and report storage

**Spec:** S3-R1–R2, R4, R6–R8 · **Depends on:** T03, T06

**Files:** Create `src/shared/simulation.ts`, `src/shared/simulation.test.ts`, `src/main/simulations/profiles.ts`, `profiles.test.ts`, `src/main/simulations/results.ts`, `results.test.ts`; extend repository persistence and RPC/client methods

**Interfaces:** Implement S3 `prepareSimulation(input): SimulationRequest` and `classifySimulationResult(result, current)`; expose `exportSimulationProfile`, `importSimulationProfile`, `saveSimulationReport`, and `listSimulations`

- [ ] Define exact request/result/job schemas and canonical hashes for baselines, talents, scenarios, game/rules/engine identities, and settings
- [ ] Add profile round-trip and incomplete/oversized/unsupported-directive tests before enabling import
- [ ] Support report links as unverified references; only a validated structured adapter may establish a simulated result and baseline association
- [ ] Store immutable summaries/evidence and managed artifact manifests; mark stale applicability on relevant changes without deleting history
- [ ] Change heuristic verdict copy in `src/renderer/features/items/ItemCompareCard.tsx` to stat-estimate language and keep it separate from simulation metrics
- [ ] Run `npx vp test src/shared/simulation.test.ts src/main/simulations/profiles.test.ts src/main/simulations/results.test.ts src/shared/swap-estimate.test.ts`

**Exit:** Profiles and supported results have reproducible provenance without local executable execution

## T11 — Run bounded local simulation jobs

**Spec:** S3-R3, R5–R8 · **Depends on:** T10

**Files:** Create `src/main/simulations/runner.ts`, `runner.test.ts`, `src/main/simulations/service.ts`, `src/renderer/features/simulations/simulations.tsx`, `simulations.css`; modify Settings, narrow preload/main file selection, RPC/client wiring, and acceptance harness

**Interfaces:** Produce `startSimulation(request: SimulationRequest): Promise<SimulationJob>`, `cancelSimulation(jobId: string): Promise<void>`, and typed job subscriptions; main resolves configured executables/artifacts and invokes the child process

- [ ] Use a fixture executable to test shell-free arguments, cancellation, timeout, nonzero exit, output limits, and a deleted character during completion
- [ ] Implement the S3 size/CPU limits, one running job, per-job working directory, validated profile options, and atomic completed-result publication
- [ ] Add Settings executable selection, queue/progress/cancel UI, result uncertainty, and explicit unsupported-engine/scenario states
- [ ] Verify a real supported engine on a recorded exact baseline; identify the engine/output schema and reproduce its result within the expected simulation uncertainty
- [ ] Run `npx vp test src/main/simulations/runner.test.ts`, `npm run check`, `npm run build`, and `npm run test:debug`

**Exit:** Local jobs work without blocking the renderer or applying results to unrelated baselines

## T12 — Compare Vault choices and enrich session actions

**Spec:** S4-R7, S3 result integration, S2-R5 · **Depends on:** T07–T11

**Files:** Create `src/shared/vault-comparison.ts`, `src/shared/vault-comparison.test.ts`, `src/main/gear/vault-service.ts`; modify weekly/planner/simulation/Tonight feature surfaces and `src/main/session-plan/actions.ts`

**Interfaces:** Produce `compareVaultChoices(input: {baseline: GearBaseline; choices: ItemVariant[]; results: SimulationResult[]; context: EvaluationContext}): VaultComparison`, with `VaultComparison` defined in the same module and references to the one frozen optimized baseline

- [ ] Add fixtures where optimized bag gear differs from equipped gear, reward alternatives are mutually exclusive, a result is stale, and two outcomes overlap within error
- [ ] Evaluate every supported choice against one baseline hash and only legal resulting sets; preserve unmodeled alternatives as unknown
- [ ] Display acquisition/rank/enhancement progress independently from supported modeled benefit and metric
- [ ] Feed valid modeled results into T08 action benefits while retaining deterministic actions when no sim exists
- [ ] Run `npx vp test src/shared/vault-comparison.test.ts src/main/session-plan/actions.test.ts` and native Vault/plan applicability flows

**Exit:** M3 provides consistent gear/Vault decisions and evidence-linked modeled session recommendations

## T13 — Add population-aware comparison adapters

**Spec:** S5-R1–R6, R8 · **Depends on:** T02, T05; may run alongside T08–T12

**Files:** Create `src/shared/comparisons.ts`, `comparisons.test.ts`, `src/main/providers/warcraftlogs.ts`, `warcraftlogs.test.ts`, `src/main/comparisons/service.ts`; modify Raider.IO adapters, `insights.ts`, encrypted credential settings, and RPC/client bindings

**Interfaces:** Produce S5 contracts and `comparePopulation(input): ComparisonResult`; expose `getComparison`, `savePublicReportLink`, and configured-provider status. Keep requested and actual filter coverage distinct

- [ ] Add fixtures for a twenty-player sample, unknown denominators, historical rankings versus individual parses, cross-season/partition mismatches, and unsupported filters
- [ ] Adapt Raider.IO sampling and leaderboards to explicit population descriptors; preserve attribution and implement shared request deduplication/backoff
- [ ] Implement authenticated supported Warcraft Logs public-summary requests with encrypted user-supplied credentials and no embedded application secret
- [ ] Add tests for private reports, provider 429, offline cache, cancelled/deleted subjects, and late responses after an alt switch
- [ ] Run `npx vp test src/shared/comparisons.test.ts src/main/providers/warcraftlogs.test.ts src/main/providers/raiderio.test.ts src/main/insights.test.ts`; validate one real public report and one current provider sample before enabling live summaries

**Exit:** Comparison facts retain metric and population meaning across providers

## T14 — Ship leader/peer/history views and gated report review

**Spec:** S5-R2–R8 · **Depends on:** T13

**Files:** Create `src/renderer/features/comparisons/comparisons.tsx`, `comparisons.css`, `src/main/comparisons/report-review.ts`, `report-review.test.ts`; modify standings and Top players route integration, acceptance harness, and session action adapter

**Interfaces:** Produce `reviewReport(input: {reportId: string; context: ComparisonContext; evidence: EvidenceRecord[]}): Promise<ReportReview>`, with `ReportReview` schema in `comparisons.ts` containing observations, report links, coverage, and unresolved context

- [ ] Add leaders/peers/history selectors and only provider-supported filters; show sample size, native metric, partition/window, and unavailable explanations
- [ ] Prototype death/defensive/mechanics/interrupt summaries against real available report fields, including duration and incomplete-event cases
- [ ] Enable only review metrics whose real-data fixtures pass; keep unsupported event review visibly unavailable and do not manufacture a tank/healer score
- [ ] Add justified review actions to Tonight and links back to the underlying reports
- [ ] Run focused report-review tests, `npm run check`, `npm run build`, and native comparison/alt-switch/private-report flows

**Exit:** M4 provides meaningful comparisons and only the report-review claims supported by validated data

## T15 — Add collection-aware outfit planning

**Spec:** S6-R1–R3, R6 · **Depends on:** T02–T03; may run alongside M2–M4

**Files:** Create `src/shared/outfits.ts`, `outfits.test.ts`, `src/main/outfits/service.ts`, `src/renderer/features/wardrobe/wardrobe.tsx`, `wardrobe.css`; modify outfit schemas/repository, addon collection capture, RPC/client wiring, and router

**Interfaces:** Produce S6 data contracts and `evaluateOutfitOwnership(outfit, observations): OutfitOwnership`; expose outfit CRUD and scoped collection/appearance reads

- [ ] Add two-character fixtures with shared account scope, unknown account membership, incomplete collection coverage, hidden slots, and supported shoulder/illusion variants
- [ ] Extend existing outfits additively and capture only client-observable collection/customization fields; retain scope and timestamps
- [ ] Add owned/missing/unknown labels, source-linked acquisition targets, outfit editing, and a static character render fallback
- [ ] Feed supported missing-appearance acquisition actions into Tonight using T08 contracts
- [ ] Run `npx vp test src/shared/outfits.test.ts` plus migration/import tests and native outfit CRUD/ownership/navigation flows

**Exit:** Cosmetic planning works before native or desktop 3D preview is enabled

## T16 — Implement a bounded outfit code and in-game preview

**Spec:** S6-R4–R6 · **Depends on:** T15

**Files:** Create `src/shared/outfit-transport.ts`, `outfit-transport.test.ts`, `addon/OutfitTransport.lua`, `addon/Preview.lua`, `addon/tests/outfit-transport.lua`; modify addon TOC, slash-command UI, wardrobe export UI, and addon documentation

**Interfaces:** Implement `encodeOutfitTransport(outfit): string` and `decodeOutfitTransport(text): OutfitTransport` using S6 versioned JSON/base64url/CRC32 format; Lua consumes shared golden transport fixtures

- [ ] Add common golden fixtures and malformed/corrupt/oversized/unknown-version tests, including executable-looking strings that must remain data
- [ ] Implement a paste/import window with validation and an explicit Preview action, without dynamic Lua evaluation
- [ ] Validate installed dressing-room/model API support; implement supported slot/illusion behavior and clear unsupported/combat-state handling
- [ ] Verify a real outfit preview, then two-character export/reload/logout round-trips and character/account scope preservation
- [ ] Run `npx vp test src/shared/outfit-transport.test.ts`, `lua addon/tests/outfit-transport.lua`, `npm run check`, and native export-code flows

**Exit:** M5 ships a real in-game preview workflow while keeping transport limitations explicit

## T17 — Prove real Retail character assembly

**Spec:** S6-R7 · **Depends on:** T15; can investigate alongside other milestones

**Files:** Update `research/3d/FEASIBILITY.md`, `research/3d/ACCEPTANCE.md`, `research/3d/capabilities.json`, and `runtime-evidence.json`; create an isolated `research/3d/workbench/character-assembly-probe.ts`

**Interfaces:** Produce a validated `ModelCapability` record per supported build with fixture IDs, supported features, missing prerequisites, runtime evidence, and pass/fail outcome

- [ ] Inspect current source/license/build compatibility of candidate model assembly code and local asset availability; do not assume historical probe results remain current
- [ ] Assemble a real character from local game assets, demonstrating two armor swaps, weapon attachment, customization/body variation, and an animation
- [ ] Exercise missing textures/models and client-build mismatch without silently substituting fictional or unrelated character assets
- [ ] Record asset provenance, timing/memory observations, screenshots, and reproducible probe steps using local ignored artifact storage
- [ ] Update the gate outcome; if it fails, leave T18 blocked with exact missing capabilities while continuing independent milestones

**Exit:** A recorded real-character pass, or a precise blocker that prevents a false claim of shipped dynamic 3D

## T18 — Integrate the verified desktop renderer

**Spec:** S6-R8 · **Depends on:** passing T17, T15

**Files:** Create `src/main/models/character-service.ts`, `character-service.test.ts`, `src/workers/models/entry.ts`, `src/renderer/features/wardrobe/ModelStage.tsx`, `CharacterScene.tsx`; modify controlled asset protocol, worker/service wiring, package dependencies if needed, and acceptance harness

**Interfaces:** Produce `prepareCharacterModel(input: {characterId: string; outfitId: string; capabilityId: string}): Promise<ModelHandle>`, defining `ModelHandle` in `outfits.ts` as a controlled asset handle with capability/build/evidence references

- [ ] Transfer only the proven assembly path into a worker/main service, with bounded caches and controlled local asset handles
- [ ] Add compatible Three.js/React Three Fiber dependencies only after verifying the chosen versions with Electron; preserve renderer sandboxing
- [ ] Add camera controls, supported appearance swaps, animation controls, cancellation, and capability/build mismatch states
- [ ] Simulate graphics/context loss and worker failure; retain drafts and recover to the official static character render when needed
- [ ] Run focused model tests, `npm run check`, `npm run build`, and native real-character rendering/recovery checks on supported platforms available for testing

**Exit:** M6 passes the real-character release gate; static GLB inspection alone does not satisfy this task

## T19 — Complete explanations, compatibility, and release evidence

**Spec:** S7-R5–R8 and all enabled feature acceptance criteria · **Depends on:** T09, T12, T14, T16; T18 for full desktop-3D completion

**Files:** Create `src/shared/recommendation-explanation.ts`, `recommendation-explanation.test.ts`; extend `src/renderer/components/EvidenceInspector.tsx` and modify all derived-result entry points, `src/main/desktop-acceptance.ts`, `scripts/integration.ts`, backup tests, README, PRODUCT, and implementation-status documentation

**Interfaces:** Implement S7 `explainRecommendation(input): RecommendationExplanation`; every feature passes the same evidence IDs, dependency hashes, rules/calculation versions, and assumptions

- [ ] Extend the T07 inspector with complete Why this? explanations and integrate compact freshness labels across progression, Tonight, plans, simulations, comparisons, and outfits
- [ ] Add cross-feature invalidation tests for gem/talent/spec changes, region reset, build changes, unrelated retrievals, and deletion during asynchronous work
- [ ] Exercise version 1/2 backup restores, clean install, offline restart, optional artifact manifests, source errors, and interrupted migration recovery
- [ ] Run `npm run check`, `npm run build`, `npx tsx scripts/integration.ts`, `npm run test:debug`, and `npm run package:win`; verify the unpacked build with `WOW_COMPANION_DEBUG_EXECUTABLE` and the same isolated debugger suite
- [ ] On an actual macOS environment, add and verify a scoped `package:mac` script using the installed electron-builder configuration, then test its native title-bar/keyboard/layout and packaged debugger flow before claiming platform validation; keep unavailable platform checks recorded as pending
- [ ] Update docs to the observed release state, reconcile stale capability claims, and attach evidence paths and remaining capability gates

**Exit:** Every enabled recommendation is explainable and applicable to its recorded context; incomplete external/rendering gates remain explicit

## Requirement coverage

| Spec | Implementing tasks | Acceptance ownership |
| --- | --- | --- |
| S1-R1–R8 | T04–T07 | S1-A1–A4 T06; A5–A6 T04; A7 T05/T07 |
| S2-R1–R8 | T08–T09, T12 | S2-A1–A6 T08; A7 T09; modeled benefits T12 |
| S3-R1–R8 | T10–T12 | S3-A1 T10; A2/A5/A6/A7 T11; A3–A4 T10/T12 |
| S4-R1–R8 | T03, T06–T07, T12 | S4-A1/A3/A6 T03; A2/A7 T07; A4 T06; A5 T12 |
| S5-R1–R8 | T13–T14 | S5-A1–A4 T13; A5 T14; A6 native T14; A7 T13/T14 |
| S6-R1–R8 | T15–T18 | S6-A1 T15; A2–A4 T16; A5 T17; A6 T18; A7 T15/T18 |
| S7-R1–R8 | T01–T03, T19 | S7-A1–A2 T02/T03; A3–A4 T01; A5 T13/T19; A6 T02; A7 T11/T19; A8 T19 |

## Completion and handoff

Record task status, spec requirement IDs, test commands/results, native artifact paths, supported builds/providers/platforms, and any unresolved gate in the native planner and milestone notes

M0–M5 can ship useful incremental releases. All seven specs are fully complete only when their acceptance criteria and T19 pass, including T17/T18 for desktop 3D

If a conditional gate fails, keep its task incomplete and document the blocker. Do not substitute a screenshot, static GLB, sampled percentile, stat heuristic, or fictional ruleset for the required capability
