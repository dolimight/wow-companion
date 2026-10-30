# WOW Companion roadmap specifications

Status: proposed implementation scope, prepared 27 October 2026

These files specify the seven recommendations in the [research brief](../research/2026-10-27-product-roadmap.md) and the preceding conversation

They describe required future behavior, not completed features or verified current-season game facts

## Feature specifications

1. [Explainable progression and seasonal rules](01-progression-and-season-rules.md)
2. [Tonight: session planning across characters](02-session-planner.md)
3. [Reproducible simulations](03-simulation-backed-decisions.md)
4. [Exact gear variants and complete plans](04-gear-variants-and-sets.md)
5. [Relevant peers and performance comparisons](05-player-comparisons.md)
6. [Desktop and addon transmog workflow](06-addon-and-transmog.md)
7. [Evidence, freshness, and recommendation explanations](07-evidence-and-freshness.md)

Execution order differs from feature numbering because evidence and variant capture underpin the other features

Read the [complete implementation plan](../../plans/wow-companion/product-roadmap-implementation.md) for tasks, file ownership, dependencies, tests, and release gates

## Shared product requirements

- Retail WoW, one local user, multiple characters, roster overview plus a selected character
- Keep Mythic+, Raiding, and PvP metrics and progression separate
- Preserve the Electron, React, shadcn Base UI, TanStack, Effect v4, tRPC, Vite+, and SQLite architecture
- Use T3 Code's native planner and repository-local Markdown; do not use visual-plan or a separate Plan viewer
- Use Apple design principles, the pure-black dark theme, the resizable sidebar, and the integrated native window controls
- Use shadcn Base UI Select and Toggle controls instead of native select elements or checkbox inputs
- Do not end user-facing copy with a period
- Unknown, missing, and stale values remain distinguishable from observed zero or explicitly empty values
- Data and plans remain local; external requests must use named provider adapters and preserve attribution
- A proposed recommendation never changes equipped gear, spends currency, chooses a Vault reward, or applies an outfit automatically
- Retain existing imports, character identities, deletion suppression, settings, saved drafts, and backups through migrations

## Canonical shared contracts

Task IDs below refer to the implementation plan. These names are the interface contract across specs

| Contract | Owner | Purpose |
| --- | --- | --- |
| `EvidenceRecord`, `EvidenceRef`, `EvidenceState`, `EvaluationContext` | S7 / T01 | Immutable observations and evaluation inputs |
| `ItemVariant`, `InventorySnapshot`, `GearBaseline`, `PlanCompletion` | S4 / T03 | Exact items, inventory coverage, and plan state |
| `SeasonRuleset`, `ContentPreferences`, `ProgressionResult` | S1 / T05 | Dated rules, legal combinations, and scoped ceilings |
| `SessionGoal`, `ActionCandidate`, `SessionPlan` | S2 / T08 | Explained cross-character actions |
| `SimulationRequest`, `SimulationResult`, `SimulationJob` | S3 / T10 | Reproducible profiles, engine runs, and uncertainty |
| `ComparisonContext`, `PopulationDescriptor`, `ComparisonResult` | S5 / T13 | Comparable populations and per-activity results |
| `OutfitDraft`, `AppearanceObservation`, `OutfitTransport`, `ModelCapability` | S6 / T15 | Cosmetic plans, import codes, and verified rendering capabilities |

All persisted contracts have a `schemaVersion` and use immutable local character IDs, UTC timestamps, and explicit source/build identifiers where applicable

`EvaluationContext` contains `now`, `gameBuild`, `seasonId`, and `rulesetId`, with nullable unknown identifiers; calculations receive this context instead of reading the wall clock internally

Every derived result includes `evidenceRefs`, `assumptions`, and a supported/partial/unsupported state. S7 defines their interpretation; individual feature specs define the conditions

## Dependency boundaries

- S7 observation contracts come first
- S4 variant capture follows; its set-validation and Vault features consume S1 and S3 later
- S1 supplies season rules and compatibility; S2 can then ship a useful non-simulation session planner
- S3 consumes exact baselines; its output improves S2 and completes simulation-backed S4 Vault decisions
- S5 public comparisons can proceed after S7 and S1 context contracts; event-level review has its own data gate
- S6 outfit collection and addon previews can proceed after S7; desktop character rendering requires a separate real-character feasibility gate

No dependency requires replacing the current application shell or introducing a hosted backend

## Scope and acceptance status

All seven specs are included in the plan. Conditional capabilities remain explicitly incomplete if their provider or feasibility gate fails

Current-season rules, provider permissions, installed-client API support, and model assembly must be checked during implementation; this specification does not assert those checks have passed

See the individual requirement IDs and the plan's coverage map for the definition of done
