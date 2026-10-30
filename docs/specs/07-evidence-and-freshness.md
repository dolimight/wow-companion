# S7 — Evidence, freshness, and recommendation explanations

Status: proposed foundational work

Parent: [roadmap specs](README.md) · Implementation: T01–T02, T19

## Outcome

The player can inspect why a value or recommendation appears, how current it is, which assumptions it uses, and what changes invalidate it

## Required behavior

- **S7-R1** Store observations by subject and field/group with source, real observation time, retrieval time, build, coverage, and immutable identity
- **S7-R2** Distinguish observed, derived, simulated, manual, and unknown evidence; observation time may be unknown and must never become retrieval time by default
- **S7-R3** Merge sources with field-specific policies. A recent rating refresh cannot freshen older gear, and an unavailable/empty inventory capture cannot erase known usable gear
- **S7-R4** Evaluate freshness against an explicit clock, applicable reset/season/build, and a versioned policy; stale, incompatible, and unknown are separate states
- **S7-R5** Attach immutable evidence references, calculation/rules versions, assumptions, and dependency hashes to recommendations
- **S7-R6** Recompute or mark recommendations inapplicable when relevant inputs change; unrelated refreshes do not invalidate them
- **S7-R7** Cache and deduplicate provider work, honor provider retry instructions and attribution, and preserve saved data during offline/errors
- **S7-R8** Keep evidence local, include it in validated backups, and delete subject-owned observations/results when a character is removed without reviving the character through delayed work

## Contracts

Define these types and matching runtime schemas in `src/shared/evidence.ts`

`EvidenceRecord` includes `id`, `schemaVersion`, `subjectType`, `subjectId`, `field`, `kind`, `source`, `sourceUrl`, `observedAt`, `retrievedAt`, `gameBuild`, `coverage`, `value`, `contentHash`, and optional `parentEvidenceRefs`

`subjectType: 'character' | 'account' | 'catalog'` disambiguates subject identities. Account observations may be reused only with established scope membership; unknown membership never grants another character collection ownership

`EvidenceRef` is an immutable evidence ID plus content hash. The content hash excludes retrieval-only timestamps and unstable property ordering

Use `kind: 'observed' | 'derived' | 'simulated' | 'manual' | 'unknown'`, `coverage: 'complete' | 'partial' | 'unknown'`, and `source: 'addon' | 'blizzard' | 'raiderio' | 'warcraftlogs' | 'local-game-data' | 'simulationcraft' | 'manual' | 'companion'`. A derived Companion result references its observed parents rather than claiming that the game directly observed its conclusion

`EvidenceState` contains `status: 'current' | 'stale' | 'incompatible' | 'unknown'`, reasons, and evaluated time

`EvaluationContext` contains `now`, `gameBuild`, `seasonId`, and `rulesetId`; identifiers other than `now` may be null

`FreshnessPolicy` defines a policy ID/version, optional age limit, reset/season/build applicability, and which dependency groups affect a result

Age limits are versioned feature policy, not proof of current state. A missing observation time produces unknown freshness; an observation after `context.now` beyond a documented five-minute clock-skew tolerance is incompatible, and one within that tolerance displays a clock-skew assumption without acquiring a future age

```ts
evaluateEvidence(
  record: EvidenceRecord,
  policy: FreshnessPolicy,
  context: EvaluationContext
): EvidenceState

explainRecommendation(input: {
  evidence: EvidenceRecord[]
  evidenceRefs: EvidenceRef[]
  assumptions: string[]
  calculationVersion: string
  context: EvaluationContext
}): RecommendationExplanation
```

`RecommendationExplanation` contains plain-language reasons, source/time/coverage details, invalidated dependencies, unresolved inputs, and applicable result status

## Persistence and migration

Add a versioned migration runner and observation/evaluation storage without replacing immutable character IDs or existing payloads

Backfill only known provenance. Legacy observations retain unknown source times or coverage rather than acquiring new certainty from migration time

Keep schema version 1 backup reads. A version 2 backup carries evidence and result metadata with validated references; large simulation/model artifacts use a separate optional manifest

Provider credentials and access tokens never enter observations, explanations, logs, or backups

Character deletion removes character-owned observations and results; shared catalog/account observations retain valid ownership and references without exposing another character's private data

## Interface

Add compact source/freshness labels and a reusable Why this? inspector. Show the most relevant reason inline and keep detailed evidence on demand

Expose sync errors as recoverable source states, retaining the last useful value. Keep stat estimates, observed popularity, simulation results, and manually set goals visibly distinct

## Dependencies and exclusions

Shared foundation for S1–S6. Initial implementation requires no simulation, new ranking provider, or renderer

No fabricated confidence percentages, automatic telemetry, cloud persistence, or general chat-based decision engine

## Acceptance criteria

- **S7-A1** Refreshing rankings changes ranking retrieval evidence without changing gear observation time or gear applicability
- **S7-A2** A newer empty logout export preserves known gear and its provenance while accepting unrelated useful observations
- **S7-A3** Fixed-clock tests cover stale ages, unknown timestamps, build/season changes, future observations, clock skew, and region reset boundaries
- **S7-A4** Equivalent canonical observations deduplicate across serialization ordering while changed variant/talent fields invalidate dependent results
- **S7-A5** Offline and provider-429 paths retain usable evidence and expose a retry state without tight polling
- **S7-A6** Version 1 backup import backfills unknown evidence truthfully; version 2 round-trips references and rejects missing/foreign references atomically
- **S7-A7** Character deletion during provider or simulation work leaves no resurrected character, dangling result, or leaked cross-character recommendation
- **S7-A8** The evidence inspector works with keyboard navigation and offline stored evidence, with no secrets in displayed or exported data

Reference: [Raider.IO API behavior](https://raider.io/api)
