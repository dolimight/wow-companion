# S1 — Explainable progression and seasonal rules

Status: implemented with the real seasonal-data release gate closed

Parent: [roadmap specs](README.md) · Implementation: T04–T07

## Outcome

The player understands their equipped item level, why a target differs from the season ceiling, and which slots and costs stand between them and each goal

## Current boundary

`src/shared/progression.ts` calculates averages and gaps from supplied values. The version 2 game-data index now supplies class masks, primary-stat compatibility, explicit specialization overrides, level requirements, and weapon/slot restrictions

Build on those modules without treating item-table maxima or fictional fixtures as seasonal authority

## Implementation

The progression page and selected-character summary consume `getProgression` through the local tRPC service. The evaluator runs in a dedicated worker, with dated rules, full-set legality, whole-set currency budgets, per-slot explanations, and explicit unsupported/partial states

Content preferences persist independently for each character/activity and survive backups. Personal targets remain separate from observed gear and verified ceilings. Addon 0.2.2 retains item-link variant identifiers and available currency observations; unavailable ranks, discounts, and restrictions stay unknown

The production rules catalog remains empty. The installed 12.1.5.70575 client index was verified with 175,625 items, but that index alone does not establish an exhaustive legal seasonal reward catalog

Validation fixtures cover the five views, shared budgets, conflicting unique/crafted groups, two-hand/dual weapons, incomplete searches, future rules, persistence, build-mismatched metadata, and concurrent observation changes. Native Electron acceptance covers the progression page, slot explanation sheet, preferences, personal targets, and minimum desktop width with both debuggers attached

## Required behavior

- **S1-R1** Present equipped level, maximum upgrade of owned items, a ceiling scoped to selected activities, highest legal set available now, and immediately affordable upgrades as distinct results
- **S1-R2** Explain each ceiling per slot, with exact candidate variants, sources, upgrade track/rank, remaining cost, acquisition conditions, and evidence age
- **S1-R3** Resolve a `SeasonRuleset` by build, season, region where relevant, and effective interval; distinguish active, announced, retired, and unsupported rules
- **S1-R4** Validate item compatibility using class/spec, level, inventory slot, class restrictions, weapon configurations, and known special restrictions before deduplication or search result truncation
- **S1-R5** Evaluate complete legal equipment combinations, including unique-equipped groups, tier/crafting restrictions supplied by the ruleset, and two-hand versus dual-wield accounting
- **S1-R6** Scope content preferences per character and activity; allow difficulty and acquisition exclusions without changing the global legal maximum
- **S1-R7** Calculate affordable upgrade paths from observed currency balances, discounts/high-water marks, and costs; avoid spending the same currency twice across a proposed set
- **S1-R8** Return partial or unsupported with a reason when rule coverage, item metadata, currencies, or required slots are unknown

## Data and calculation contract

Define `SeasonRuleset` in `src/shared/season-rules.ts`

It contains a stable ID, schema version, supported build range, season ID, effective interval, source references, validation fixtures, activity reward tables, upgrade tracks/costs, and equipment restrictions

Store reviewed data files under `data/season-rules/`. A bundled catalog ships empty or explicitly unsupported until at least one real ruleset passes its source and fixture checks

`ContentPreferences` identifies allowed activities, difficulties, crafting availability, and excluded acquisition methods

`ProgressionResult` contains the five S1-R1 views, per-slot explanations, selected legal sets, a currency ledger, evidence references, and unresolved constraints

Expose:

```ts
evaluateProgression(input: {
  baseline: GearBaseline
  inventory: InventorySnapshot
  candidates: ItemVariant[]
  ruleset: SeasonRuleset | null
  preferences: ContentPreferences
  context: EvaluationContext
}): ProgressionResult
```

Use S4's variant and legality contracts and S7's evidence state. Never infer `best in slot` from item popularity or item level alone

## Interface

Add a progression surface under character details and a compact summary in the selected roster pane

Show slot-level progress and available actions before aggregate percentages. Explain unsupported caps inline; a personal target remains editable and labeled separately

Search states name the selected character/spec and disclose unverified restrictions. Unknown specialization must not generate a zero-ID provider request

## Dependencies and exclusions

Requires S7 evidence and S4 variant capture; S4's complete-set checks consume the same rules rather than creating a second rules engine

No guaranteed drops, invented drop probabilities, automatic spending, DPS claims, or universal power score

## Acceptance criteria

- **S1-A1** A fixture with a two-hand weapon produces the expected sixteen-slot weighted average; dual-wield and unsupported configurations have independent cases
- **S1-A2** A future-dated ruleset never changes today's ceiling; an unsupported build keeps its cap unknown
- **S1-A3** Individually high-level but mutually exclusive candidates never form a reported legal maximum
- **S1-A4** A shared currency budget cannot fund two upgrades that exceed the observed balance; unknown discounts produce an explicit unresolved cost
- **S1-A5** Blood DK, Fury Warrior, Protection Paladin, ranged and melee Hunter, caster off-hand, wrong-class armor, level restrictions, zero/unknown spec, and explicit spec-override cases pass source-backed fixtures
- **S1-A6** Compatible matches beyond the first SQL candidate page remain discoverable and stale index formats rebuild safely
- **S1-A7** Every real ceiling links to its ruleset, effective date, source evidence, and selected items

## Release gate

Ship compatibility and personal targets independently. Enable a real seasonal ceiling only after the ruleset and representative legal sets have been manually verified against the supported client

Source background: [research brief](../research/2026-10-27-product-roadmap.md)
