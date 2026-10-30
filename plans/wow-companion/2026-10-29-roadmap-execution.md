# WOW Companion remaining roadmap implementation

Goal: Deliver the six approved workflows using the existing seven specs and application architecture

Execution status: feature workflows implemented and integrated; 242 unit tests, 15 transport checks and 31 native Electron debugger checks pass
The dev app is launched after a consistent local SQLite backup
See `docs/roadmap-implementation-2026-10-29.md` for explicit remaining seasonal-proof, authenticated-provider, real-engine and live-model/client gates

Architecture: Keep observations and decisions local, use the database worker for character-owned state, and expose bounded typed service operations over the authenticated loopback transport

Specs: `docs/specs/01-progression-and-season-rules.md` through `07-evidence-and-freshness.md`

## Ownership and sequence

- [ ] Inventory team: additive inventory observations, observed bank/Vault coverage, exact completion, generic character-owned feature state with backup/delete/merge tests
- [ ] Progression integration: verify installed 12.1.5.70575 tables and current primary sources, ship only established costs/rewards/restrictions, consume inventory variants and expose unresolved coverage
- [ ] Tonight: stable pure action ranking, time budgets, character/activity/goal filtering, source freshness, reset expiry, pin/snooze/dismiss/undo and durable preferences
- [ ] Simulation team: profile/report workflow, bounded local jobs and cancellation, baseline provenance, supported scenarios and honest tank/healer metrics
- [ ] Comparison team: contextual populations, history, supported provider-native ranks, report links and explicit unavailable filters
- [ ] Outfit team: collection checklist, bounded TS/Lua transport, manual in-game preview and explicit desktop assembly capabilities
- [ ] Integration: all routes and native actions, exact completion in gear planner, regression tests, transport tests, Electron debugger acceptance, local dev launch

## Shared interfaces

Database: `getFeatureState(characterId, namespace)` and `saveFeatureState(characterId, namespace, value)` with character foreign keys, bounded JSON, additive backup validation and duplicate identity migration

Inventory: optional `Character.inventoryObservations`, retaining old version 1 imports and previous observations for unavailable locations

Simulation: `createSimulationService`, `SimulationsPage`; root owns router/client/native executable selection

Outfits: `OutfitTools({character,outfit,onChange})`; existing outfit persistence remains authoritative

Tonight: shared `session-plan.ts`, main `session/service.ts`, renderer `TonightPage`; root owns all three and routing

## Review focus

1. Unknown inventory or enhancement fields must not become empty or complete
2. Current-client tables and hotfix changes must not be silently replaced by earlier-season rules
3. Shared currency budgets, unique items, weapon pairs and mutually exclusive Vault rewards must apply to whole sets
4. Character deletion, alt changes and cancellation must prevent delayed results restoring data
5. Offline/stale providers and rendering failures must retain usable saved plans with truthful capability labels

## Verification

Run focused tests per subsystem, then `npm run check`, `npm run build`, `npx tsx scripts/integration.ts` and `npm run test:debug`

Use isolated fictional fixtures for acceptance; make a consistent SQLite backup before launching migrations on the real profile

No automatic game interaction, no inferred population percentiles, no unverified combat benefit, no hosted plan viewer, no trailing periods in UI copy
