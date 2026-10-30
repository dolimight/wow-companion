# S3 — Reproducible simulations

Status: proposed

Parent: [roadmap specs](README.md) · Implementation: T10–T12

## Outcome

The player can compare supported gear, enhancement, and talent configurations using a reproducible simulation while preserving the distinction between damage output and tank/healer effectiveness

## Required behavior

- **S3-R1** Import and export a bounded SimulationCraft profile with source attribution and field coverage; do not treat a partial profile as an exact baseline
- **S3-R2** Save external report links and user notes first; import structured results only through a documented, versioned adapter that establishes baseline provenance
- **S3-R3** Run a user-selected local SimulationCraft executable in a managed background job, using argument arrays with `shell: false`, a dedicated working directory, and bounded inputs/output
- **S3-R4** Record character/spec, exact gear variants, talents, scenario, game/rules/engine builds, engine options, uncertainty, and result timestamps
- **S3-R5** Support queued/running/completed/failed/cancelled jobs, explicit cancellation, a configurable time limit, and a CPU budget
- **S3-R6** Invalidate current applicability when any relevant baseline, talent, scenario, rules, or engine compatibility input changes; retain immutable historical results
- **S3-R7** Present results within their uncertainty as sidegrades; compare compatible results using the engine's reported error and units rather than a universal hardcoded percentage
- **S3-R8** Label output as the supported modeled metric. Blood tank damage results never imply improved survival; unsupported specs/scenarios remain unavailable with a reason

## Data and interfaces

Define schemas in `src/shared/simulation.ts`

`SimulationRequest` references a frozen `GearBaseline`, candidate legal sets, a `scenarioId`, engine settings, and evidence references

`SimulationResult` contains a baseline hash, engine identity, scenario hash, metric name/unit, per-candidate estimates and errors, supported coverage, artifact references, and applicability state

`SimulationJob` owns lifecycle, progress, cancellation, failure reason, and managed artifact paths kept out of renderer requests

```ts
prepareSimulation(input: {
  baseline: GearBaseline
  candidates: ItemVariant[][]
  scenarioId: string
  context: EvaluationContext
}): SimulationRequest

classifySimulationResult(
  result: SimulationResult,
  current: SimulationRequest
): { applicable: boolean; reasons: string[] }
```

Main-process adapters own parsing and child processes. The renderer receives result summaries and local asset handles, never arbitrary filesystem paths or executable command text

Default local jobs use at most four threads while reserving two available CPU threads when possible, and run one job at a time. Users can change the limit in Settings

Default timeout is thirty minutes; Settings accepts a time limit between one and 120 minutes. Cancellation and timeout terminate the job process and prevent result publication while preserving a failure/cancellation record

Limit profile imports to 1 MiB and managed result files to 100 MiB. Reject unsupported file/network/output directives in imported profiles rather than forwarding arbitrary SimulationCraft instructions

## Interface

Add a simulations surface with baseline/scenario summary, queued job status, cancel action, results, uncertainty, and explicit stale reasons

Provide a profile export action and an external report link workflow before local execution is available. Never assume Raidbots offers an unrestricted public submission API

Rename existing heuristic combat-sounding verdicts to stat-estimate wording and retain their calculation details

## Dependencies and exclusions

Requires S7 evidence, S4 exact baselines, and S1 legal candidate sets. Feeds S4 Vault comparisons and S2 explained actions

No custom combat engine, automatic executable downloads, opaque remote jobs, guaranteed gameplay improvement, or unverified survival/HPS claims

## Acceptance criteria

- **S3-A1** A supported profile round-trips its exact variants and talents; malformed, oversized, or unsupported directives fail without side effects
- **S3-A2** A fixture executable proves argument isolation, cancellation, timeout, output bounds, and UI responsiveness without requiring a live sim
- **S3-A3** A changed gem, bonus ID, talent, spec, scenario, or supported build makes an older result inapplicable
- **S3-A4** Statistically tied candidates show sidegrade language while a clearly separated supported result names its metric and scenario
- **S3-A5** A failed or cancelled job never publishes partial output as a completed result
- **S3-A6** A real supported local simulation can be reproduced using its recorded profile, executable version, settings, and baseline hash
- **S3-A7** Deleting a character during a job prevents completion from recreating its data or recommendations

## Release gate

Ship profile/report storage first. Enable local execution only after the current supported engine/output format, profile restrictions, and a real baseline/result round-trip pass validation

References: [SimulationCraft addon](https://github.com/simulationcraft/simc-addon), [Raidbots sidegrades](https://support.raidbots.com/article/61-top-gear-sidegrades)
