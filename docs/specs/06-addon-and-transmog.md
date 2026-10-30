# S6 — Desktop and addon transmog workflow

Status: proposed, with explicit client/API and desktop-rendering gates

Parent: [roadmap specs](README.md) · Implementation: T15–T18

## Outcome

The player plans outfits locally, knows which appearances are owned or missing, finds acquisition sources, and previews plans on a real character through a verified in-game workflow and a separately validated desktop renderer

## Required behavior

- **S6-R1** Preserve Electron for planning/history/external data and the addon for permitted observations and native in-game presentation
- **S6-R2** Capture collected appearances, observed outfits/customization, and relevant body/race restrictions with explicit character/account scope and coverage
- **S6-R3** Save per-character outfit drafts, hidden slots, supported shoulder variants, weapon illusions, owned/missing states, and acquisition targets
- **S6-R4** Export a bounded outfit code for manual copy/paste into the addon; validate before showing the plan and require a user action to preview it
- **S6-R5** Preview supported outfits through the installed client's dressing-room/model APIs, with unsupported slots and variants explained instead of silently substituted
- **S6-R6** Return observed outfit data through the existing export/SavedVariables workflow and preserve truthful timestamps; do not claim a live desktop/addon WebSocket
- **S6-R7** Implement a real-character desktop assembly feasibility prototype and a recorded release gate covering customization, armor swaps, weapon attachments, body variants, animation, and missing assets
- **S6-R8** After that gate passes, ship desktop 3D with camera controls, outfit swapping, renderer recovery, and build-aware local asset caching; retain the official character render fallback

## Data and interfaces

Define contracts in `src/shared/outfits.ts`

`AppearanceObservation` stores character/account scope, observed appearance IDs, outfit/customization details, coverage, and evidence references

`OutfitDraft` extends existing outfit persistence additively; it contains appearance selections, supported illusions/hidden slots, and acquisition targets, rather than copying model files into the draft

`OutfitTransport` uses versioned canonical JSON, base64url encoding, and a CRC32 checksum for accidental corruption detection. CRC32 is not authentication. Reject decoded payloads above 64 KiB, more than forty slots, unknown schema versions, and out-of-range identifiers

```ts
encodeOutfitTransport(outfit: OutfitDraft): string
decodeOutfitTransport(text: string): OutfitTransport
evaluateOutfitOwnership(
  outfit: OutfitDraft,
  observations: AppearanceObservation[]
): OutfitOwnership
```

Define `OutfitOwnership` with collected/missing/unknown per slot and the relevant scope/evidence. An incomplete collection never establishes absence

`ModelCapability` records game build, tested fixture IDs, supported appearance features, asset availability, renderer version, and gate outcome

The addon decodes data without `loadstring` or dynamic code execution. No arbitrary Lua, chat command execution, or automated equipment/transmog spending belongs to the transport

## Interface and architecture

Add a wardrobe feature route with a collection-aware outfit list, editable slots, acquisition checklist, export code, and preview state

The addon provides a paste/import window and an explicit Preview action outside restricted combat states. Validate the actual installed API instead of assuming MogIt/Narcissus implementation details transfer unchanged

Keep CASC reads, DB2 resolution, and texture/model assembly in constrained main/worker modules. The sandboxed renderer receives controlled local asset handles, not filesystem or Node access

Do not bundle extracted Blizzard artwork or include large model caches in ordinary JSON backups. Backups preserve outfit data and an optional separately managed asset manifest

## Dependencies and exclusions

Requires S7 evidence and account/character identity preservation. Uses S4 item/appearance links where available and supplies cosmetic actions to S2

No automatic game interaction, hosted asset service, assumption that a static GLB supports armor swapping, or claim that in-game previews render inside Electron

## Acceptance criteria

- **S6-A1** Collected, missing, and unknown appearances remain distinct across two characters and incomplete account coverage
- **S6-A2** Desktop and Lua implementations round-trip the same transport fixtures; corrupt, oversized, unsupported, or executable-looking payloads cause no state change
- **S6-A3** A real installed-client preview applies supported pieces on the player and reports unsupported features without a Lua error
- **S6-A4** Two-character reload/logout tests preserve character identity, collection scope, and observation times
- **S6-A5** A real-character desktop prototype demonstrates two armor swaps, weapon attachment, customization/body variation, animation, and graceful missing-asset behavior against the supported build
- **S6-A6** Desktop renderer loss/recreation retains the outfit draft and returns to the static fallback when recovery fails
- **S6-A7** Outfit CRUD, ownership labels, import/export, keyboard controls, and narrow/light/dark layouts pass native acceptance

## Release gate and fallback

Collection planning and in-game preview can ship first. If desktop assembly fails S6-A5, keep S6-R8 explicitly incomplete and record the missing capability; retain the working outfit workflow and static render without calling it completed 3D support

References: [existing feasibility record](../../research/3d/FEASIBILITY.md), [Narcissus](https://www.curseforge.com/wow/addons/narcissus), [wow.export](https://github.com/Kruithne/wow.export)
