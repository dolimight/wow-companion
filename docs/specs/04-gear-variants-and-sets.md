# S4 — Exact gear variants and complete plans

Status: proposed

Parent: [roadmap specs](README.md) · Implementation: T03, T07, T12

## Outcome

The planner compares exact owned and desired equipment, recognizes partially completed goals, and evaluates legal whole sets and Vault choices against one baseline

## Required behavior

- **S4-R1** Preserve item ID, raw item link, bonus IDs, actual item level, upgrade track/rank, sockets/gems, enchant identifiers, crafted stats, tier/unique groups, and supported special effects with per-field coverage
- **S4-R2** Distinguish an exact variant from a partially observed item and from an editable manual placeholder; two incomplete observations must not become an exact match through shared unknown values
- **S4-R3** Capture equipped, bag, observed bank, and observed Vault inventories independently, with location/observation identity and scan coverage; missing bank access never means an empty bank
- **S4-R4** Show Current gear and Planned gear side by side and derive acquired, rank reached, enhancements applied, legal configuration, and fully completed states independently
- **S4-R5** Dim completed acquisition tasks while keeping unfinished rank/enhancement work readable, selectable, and visible; restore emphasis on hover, focus, and selection
- **S4-R6** Validate complete sets using S1 rules, including legal weapon pairs, unique-equipped groups, seasonal restrictions, and tier requirements
- **S4-R7** Compare Vault choices against one frozen optimized owned baseline; each alternative contains at most one mutually exclusive Vault selection and its permitted resulting set
- **S4-R8** Preserve saved plans across schema changes, spec-zero normalization, character merges, and incomplete addon captures; manual item renames clear obsolete verified identity

## Data and interfaces

Define contracts in `src/shared/gear-variants.ts`

`ItemVariant` contains the observed fields, `evidenceRefs`, a coverage map, and a canonical `variantKey`; retain the original link and opaque fields even when their meaning is unsupported

Canonicalization normalizes only fields with established unordered semantics. Unknown values remain part of coverage and never substitute for zero, no enchant, or no gems

`InventorySnapshot` contains character ID, location, observed items, coverage, and observation identity. Preserve duplicate item instances

`GearBaseline` freezes equipped variants, talents, spec, level, build, and evidence references for reproducible evaluations

`PlanCompletion` reports acquisition, rank, enhancements, legality, overall state, and unresolved fields per slot

```ts
captureGearBaseline(input: {
  character: Character
  inventory: InventorySnapshot[]
  context: EvaluationContext
}): GearBaseline

comparePlanCompletion(input: {
  baseline: GearBaseline
  planned: ItemVariant[]
  ruleset: SeasonRuleset | null
}): PlanCompletion
```

Phase A implements capture and baseline types without importing S1 code. Phase B adds the separate set-validation module that consumes `SeasonRuleset`, avoiding a dependency cycle

## Persistence and compatibility

Extend the current gear JSON additively and introduce explicit inventory/baseline tables through versioned migrations

Continue reading addon schema version 1 and backup version 1. Add version 2 writers only with paired readers, fixtures, and rollback/backups

Older records have unknown variant details; preserve their current names, levels, targets, and saved drafts

## Dependencies and exclusions

S7 evidence comes first. S1 later supplies legality/costs; S3 later supplies combat estimates for candidate sets and Vault decisions

No automatic inventory rearrangement, currency spending, Vault claim, or recommendation that treats a popular item ID as universal best in slot

## Acceptance criteria

- **S4-A1** Same item ID with different bonus IDs, levels, crafted stats, sockets, or enchants retains distinct variants and round-trips through export/import
- **S4-A2** A matched item ID dims acquisition while an unmet rank or enchant remains an outstanding goal
- **S4-A3** Unknown bank/Vault coverage preserves previous observations and prevents a claim that the location is empty
- **S4-A4** Two legal weapon configurations and two different copies of the same ring remain distinguishable; unique restrictions apply to the complete selected set
- **S4-A5** All Vault alternatives use an identical baseline hash, and selecting one alternative never combines mutually exclusive rewards
- **S4-A6** Version 1 addon and backup fixtures migrate without losing character IDs, draft IDs, gear, goals, or explicit empty enhancement observations
- **S4-A7** Keyboard selection, item inspection, dimming, manual renames, save/reload, and minimum-width layouts pass native acceptance

Reference: [Great Vault baseline consistency](https://support.raidbots.com/article/73-great-vault-and-optimized-current-gear)
