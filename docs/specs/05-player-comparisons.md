# S5 — Relevant peers and performance comparisons

Status: proposed

Parent: [roadmap specs](README.md) · Implementation: T13–T14

## Outcome

The player understands their standing and actionable differences against both aspirational leaders and genuinely comparable peers without mistaking sample popularity for a universal ranking

## Required behavior

- **S5-R1** Preserve separate Mythic+, Raiding, and PvP views with provider-native metrics and no invented combined rank
- **S5-R2** Distinguish leaders, peers, and the player's history; name the population, source, season, scope, sample size, and observation window beside results
- **S5-R3** Filter supported comparisons by spec/role, region, season, patch/partition, content, difficulty/key level, and available gear bracket
- **S5-R4** Keep popularity frequencies, observed build choices, simulation results, and rank/percentile different facts with different labels
- **S5-R5** Never calculate an overall percentile from a truncated leaderboard, sampled high runs, or missing population denominator
- **S5-R6** Start Warcraft Logs integration with player-provided public report links and supported summary fields through a versioned adapter
- **S5-R7** Add contextual event review only after real supported reports validate the required fields; investigate deaths, mechanics, defensive timing, interrupts, and damage without claiming a universal tank/healer score
- **S5-R8** Preserve unsupported, private, unavailable, and rate-limited states without turning missing metrics into zero or silently broadening the comparison filters

## Data and interfaces

Define contracts in `src/shared/comparisons.ts`

`ComparisonContext` contains activity, spec/role, region, season, content/difficulty, time window, partition, and optional gear bracket

`PopulationDescriptor` contains provider, selection method, requested/actual filters, sample size, optional full denominator, coverage, source URL, and retrieval/observation references

`ComparisonResult` contains the native metric, player value, observed peer/leader records, supported rank/percentile fields, evidence, and missing-context explanations

```ts
comparePopulation(input: {
  context: ComparisonContext
  player: ComparisonRecord
  population: PopulationDescriptor
  records: ComparisonRecord[]
}): ComparisonResult
```

Define `ComparisonRecord` in the same module with provider-native metric ID/unit, value, matching context, evidence references, and source link

Main owns credentials and provider calls. Begin with user-supplied credentials where the provider requires them, stored through the existing encrypted store; ship no shared client secret

## Interface

Extend standings and Top players with explicit population selectors and supported filters. Surface why a comparison is unavailable and which supported filters actually applied

Keep gear/build frequency counts out of explanatory combat recommendations unless S3 supplies a matching simulation result

A report review opens the underlying report and names the encounters and limitations used for each observation

## Dependencies and exclusions

Requires S7 evidence and S1 season/context identifiers; S4 supports exact gear differences. S3 is optional for interpreted modeled gear benefits

No full Warcraft Logs replacement, scraping around access restrictions, live combat automation, inferred private data, or universal player skill score

## Acceptance criteria

- **S5-A1** A twenty-player sample has frequencies out of twenty and no fabricated percentile among all players
- **S5-A2** Different seasons, partitions, encounters, difficulty, or spec do not merge into one comparison; requested unsupported filters remain visible
- **S5-A3** Historical best rankings and individual parses retain distinct labels and provenance
- **S5-A4** Private/unavailable reports and 429 responses preserve saved usable data with a clear state and provider-directed retry behavior
- **S5-A5** Event-review fixtures include different fight durations and incomplete events; the result withholds unsupported defensive/execution judgments
- **S5-A6** Changing character or activity invalidates the visible comparison context without showing the previous character's cached result
- **S5-A7** A real public report and live provider sample validate the adapter before event review is enabled

References: [Warcraft Logs ranking semantics](https://www.warcraftlogs.com/help/ranks/), [Raider.IO API](https://raider.io/api), [Murlok population description](https://murlok.io/)
