# S2 — Tonight: session planning across characters

Status: proposed

Parent: [roadmap specs](README.md) · Implementation: T08–T09, T12

## Outcome

Before logging in, the player can choose a character and a useful action that fits their available time and goals

## Required behavior

- **S2-R1** Accept a time budget, included characters, activity preferences, and one goal: score, weekly rewards, raid preparation, gear progression, or cosmetics
- **S2-R2** Produce one recommended action and up to four alternatives, preserving the roster overview and selected-character workspace
- **S2-R3** Explain each action's prerequisites, reset/deadline, relevant character/spec, benefit, source freshness, assumptions, and estimated duration when supported
- **S2-R4** Start with deterministic opportunities: unfinished observed weekly thresholds, affordable upgrades, known unclaimed rewards, unlocked targeted content, and outstanding plan steps
- **S2-R5** Incorporate simulation results and peer-review observations only when their evidence matches the current context; a useful plan must work without those integrations
- **S2-R6** Allow pinning, snoozing until a specified reset/time, and dismissing actions with undo; retain local history without marking uncertain game tasks completed automatically
- **S2-R7** Recompute when relevant observations, goals, rules, or reset windows change; avoid reshuffling a pinned plan on unrelated refreshes
- **S2-R8** Learn duration ranges from the player's observed completed runs, with sample size, while retaining a clearly labeled manual duration estimate option

## Data and interfaces

Define `SessionGoal`, `ActionCandidate`, and `SessionPlan` in `src/shared/session-plan.ts`

An action has a stable opportunity key, character ID, activity, action kind, prerequisites, benefit vector, optional duration range, deadline/reset key, evidence references, assumptions, and state

Benefit vectors keep score, gear, weekly unlocks, and cosmetics separate. Initial ranking is lexicographic: feasible within known constraints, user pin, selected goal benefit, deadline urgency, then duration; tie-break by stable action key

Unknown duration does not satisfy a strict time budget and appears among explicitly unscheduled alternatives. Unknown benefit has no invented numeric gain

```ts
buildSessionPlan(input: {
  goal: SessionGoal
  actions: ActionCandidate[]
  budgetMinutes: number | null
  pinnedActionKeys: string[]
  snoozedActionKeys: string[]
  context: EvaluationContext
}): SessionPlan
```

Generate actions in main-process adapters using S1 progression, `weekly.ts`, S4 completion, and later S3/S5/S6 results. Persist goal preferences, action dispositions, and completed session summaries through the database worker

## Interface

Add a Tonight route and a compact recommendation in the roster workspace

Controls use existing Select and Toggle components. Choose roster members without native checkboxes. Every action opens its relevant character, slot, weekly track, source, report, or outfit

Keep the displayed plan stable while refreshing; indicate when new evidence materially changes its reason

## Dependencies and exclusions

Depends on S7 observation freshness, S4 plan/inventory data, and S1 costs and compatibility

S3 adds modeled gear benefits later; S5 adds relevant review actions; S6 adds cosmetic acquisition actions

No automatic game interactions, opaque combined player score, fabricated drop chance, guaranteed completion time, or free-form AI-generated task facts

## Acceptance criteria

- **S2-A1** A twenty-minute budget excludes a known thirty-minute action; an unknown-duration action remains visible as unscheduled rather than receiving a fabricated duration
- **S2-A2** Region-specific reset changes invalidate old weekly opportunities without erasing historical plans
- **S2-A3** Changing the selected character or activity never leaks another character's goals, pins, or completion state
- **S2-A4** An unrelated rating retrieval leaves an otherwise identical pinned plan stable
- **S2-A5** Offline startup produces a plan from usable stored evidence and discloses stale or unknown inputs
- **S2-A6** A hypothetical upgrade action displays an evidence-linked reason and no numerical combat gain until a compatible simulation result exists
- **S2-A7** Snooze, dismiss, undo, navigation, and persistence after reload pass native Electron acceptance

## Release gate

Release a deterministic Tonight plan after weekly and upgrade actions work end to end. Simulation, log, and cosmetic action types join through the same action contract after their feature gates pass
