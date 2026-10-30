# Real WoW Character Models Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking
> Resolve those execution skills at implementation kickoff; if unavailable, report the missing prerequisite and use the user's chosen available execution method

**Goal:** Preview supported real Retail characters and editable transmog outfits in a local 3D stage

**Architecture:** A build-aware appearance resolver and asset worker feed a replaceable model-stage adapter. Character IDs and request generations prevent stale model loads from appearing after a switch, while SQLite owns saved outfit choices

**Tech Stack:** Existing Electron/React/Effect/tRPC stack, a WoW-aware renderer chosen by Task 1, and Three.js only where the proven asset route benefits from it

**Spec:** [Multiple characters and real 3D models](multi-character-and-3d-design.md)

## Global Constraints

- Real 3D means a recognizable WoW character with their customization and switchable appearances, rather than rotating a generated illustration
- The base Electron/SQLite/provider foundation from the original plan is still a prerequisite, not existing software
- Neither Three.js nor an exported flattened character supplies the missing WoW assembly/appearance pipeline
- Keep model assets local where supported, with edition/build/source provenance and no bundled provider credentials
- Do not disable Electron web security or embed unreviewed remote executable scripts to make a renderer work
- Unsupported forms stay labeled unavailable and retain the outfit editor
- No trailing periods in UI copy

## Review Focus

1. New Retail builds or unknown appearance variants must remain visibly unresolved, covered by Tasks 1 and 2
2. Unknown customization and special body models must not silently become another character, covered by Tasks 1 and 3
3. Fast character/outfit changes cannot display a late older scene, covered by Task 3
4. Missing assets, offline startup, and GPU/context failure preserve outfit edits, covered by Tasks 2 and 3
5. Scene disposal, minimized windows, and repeated switching cannot leave accumulating render loops/resources, covered by Task 3

---

### Task 1: Prove the real asset and rendering route

**Files:** Create `research/3d/FEASIBILITY.md`, `research/3d/capabilities.json`, `research/3d/source-manifest.json`, `research/3d/workbench/README.md`, with throwaway workbench source/config isolated beneath that directory

**Interfaces:**

- Decision result `pass | partial | fail`, renderer candidate/commit, asset source/build, permitted distribution/access assumptions, required conversion, network dependencies, and measured budgets
- Capabilities record race/body model, customization coverage, slot variants, forms, animations, and illusions as `supported | unsupported | untested` with evidence paths
- No production renderer adapter may merge without a passing dynamic armor/weapon swap path; a partial result can document supported inspection only

- [ ] Capture reference outfits/customization for two representative current-Retail characters, plus the user's actual roster when known; record the exact build without committing credentials or whole proprietary asset archives
- [ ] Evaluate local wow.export renderer/assembly reuse first, checking the code license/dependencies and local data requirements; pin a source commit rather than taking an unversioned runtime dependency
- [ ] Build the throwaway workbench and demonstrate dynamic armor/weapon swaps, separate shoulders, a hidden slot, one variant, and rapid character switching without manually exporting each resulting outfit
- [ ] Run the design's ten-load/swap benchmark and 20-switch disposal check, plus missing-texture, offline-cache, build mismatch, and context-loss cases; record hardware, sample count, median/p95, reference screenshots, and supported animations
- [ ] Record pass only if the mandatory vertical slice and recovery behavior meet the proposed budgets; otherwise record partial/fail with the exact missing capability at the two-working-day investigation cap
- [ ] Commit the research result and reproducible workbench instructions, excluding credentials, caches, and asset archives

Task 1 is a real-client feasibility exercise, so tests that only load generic GLB fixtures cannot substitute for it
If the result fails, stop Tasks 2–4 and continue the roster/2D editor; propose a separately scoped renderer project before attempting a new custom engine

### Task 2: Canonical appearances and versioned local assets

**Files:** Create `src/shared/appearance.ts`, `src/shared/model-scene.ts`, `src/main/models/resolve-scene.ts`, `src/main/models/resolve-scene.test.ts`, `src/workers/assets/asset-cache.ts`, `src/workers/assets/asset-cache.test.ts`, `src/main/models/asset-protocol.ts`

**Interfaces:**

- `AppearanceRef = {appearanceId:number|null; modifiedAppearanceId:number|null; itemId:number|null; variantKey:string|null; source:string}` preserves supplied IDs without inventing missing mappings
- `AppearanceSlot` uses an explicit discriminated union for all renderable slots, including `shoulderLeft`, `shoulderRight`, `mainHand`, `offHand`, and `tabard`, with hidden choices stored independently
- `CustomizationChoice = {optionId:number; choiceId:number}` carries source/build provenance at its parent snapshot
- `CharacterLook = {characterId:CharacterId; gameBuild:string; raceId:number; bodyModelKey:string; customization:CustomizationChoice[]; slots:Partial<Record<AppearanceSlot,AppearanceRef>>; hiddenSlots:AppearanceSlot[]; illusionIds:Partial<Record<'mainHand'|'offHand',number>>}`
- `resolveScene(look:CharacterLook, signal:AbortSignal): Promise<SceneResolution>` returns either a complete descriptor or explicit missing mappings/capabilities; renderer-specific IDs stay behind the resolver
- `SceneResolution` includes look hash, build, warnings, readiness, source coverage, and app-owned asset handles; no raw filesystem paths in renderer payloads
- `AssetCache.resolve(key:{edition:'retail'; gameBuild:string; assetId:string; expectedHash:string|null}, signal:AbortSignal): Promise<AssetHandle>` verifies completed entries and atomically publishes downloads/conversions
- App protocol resolves only opaque issued handles to allowed cache entries; retain the foundation's context isolation, sandbox, and Node-disabled renderer

- [ ] Write failing resolver tests: two appearance variants remain distinct, left/right shoulders map independently, hidden slots remove the right geometry, unknown IDs return unresolved, a build mismatch cannot reuse another build's entry, and unknown customization is surfaced
- [ ] Write cache tests: interrupted write never becomes a valid cache hit, duplicate requests share completed content, offline miss reports missing, cache traversal is denied, clear-cache never deletes saved outfits, and pinned/in-use assets survive eviction
- [ ] Run `vp test src/main/models/resolve-scene.test.ts src/workers/assets/asset-cache.test.ts`; expect failures before implementation
- [ ] Implement the proven Task 1 mapping/asset path with Effect-managed cancellation and worker lifetimes, lazy scene-specific fetching, and configurable LRU disk limits starting at 2 GiB
- [ ] Repeat tests; expect pass, then resolve one actual Task 1 outfit through the packaged local protocol with network disabled after cache warmup
- [ ] Commit `feat: resolve versioned character appearances and local model assets`

### Task 3: Reusable model stage and safe scene lifecycle

**Files:** Create `src/renderer/features/model-stage/ModelStage.tsx`, `src/renderer/features/model-stage/model-adapter.ts`, `src/renderer/features/model-stage/scene-lifecycle.ts`, `src/renderer/features/model-stage/scene-lifecycle.test.ts`, `src/renderer/features/model-stage/ModelStage.test.tsx`
Create the Task 1 renderer-specific adapter beside model-adapter.ts

**Interfaces:**

- `ModelAdapter.mount(host:HTMLElement): Promise<void>`
- `ModelAdapter.load(scene:SceneResolution, signal:AbortSignal): Promise<void>` only accepts ready descriptors
- `ModelAdapter.setView(view:'front'|'back'|'reset'):void`, `setPaused(paused:boolean):void`, `setVisible(visible:boolean):void`, and `dispose():void`
- `ModelStageProps = {characterId:CharacterId; scene:SceneResolution|null; reducedMotion:boolean; onStatus:(status:StageStatus)=>void}`
- `StageStatus = 'loading'|'ready'|'missingAssets'|'unsupported'|'contextLost'|'error'`
- `SceneLifecycle.request(characterId:CharacterId, lookHash:string):{generation:number; signal:AbortSignal}` cancels old work and rejects stale completions before they can attach a scene
- Stage state keeps per-character view choices and uses one live stage normally; roster rows use cached portraits

- [ ] Write failing lifecycle tests: A resolves after B and cannot mount; an old outfit revision cannot replace the new one; disposal cancels work and releases resources once; hidden stage stops its animation loop; lost context retains the outfit and supports retry
- [ ] Write component tests for status descriptions, pause/reset/front/back controls, keyboard access, unknown form labeling, and reduced-motion starting paused with no inertia
- [ ] Run `vp test src/renderer/features/model-stage/scene-lifecycle.test.ts src/renderer/features/model-stage/ModelStage.test.tsx`; expect failures before implementation
- [ ] Implement the adapter using the proven Task 1 path; keep camera drags direct, cancelable, and bounded, with keyboard/button alternatives and no automatic rotation
- [ ] Dispose CPU/GPU scene resources and conversion jobs explicitly, preserve drafts on context loss, and stop model work while the route/window is hidden
- [ ] Repeat tests; expect pass, then rerun Task 1 real-model budgets in packaged Electron, including 20 rapid character switches and minimize/restore
- [ ] Commit `feat: add reusable character model stage`

### Task 4: Character look and editable 3D wardrobe

**Files:** Create `src/renderer/features/wardrobe/appearance-editor.ts`, `src/renderer/features/wardrobe/appearance-editor.test.ts`, `src/renderer/features/wardrobe/WardrobePage.tsx`, `src/renderer/features/character/CharacterModel.tsx`, `src/main/models/model-router.ts`
Modify `src/shared/character-plans.ts`, `src/workers/database/character-plans.ts`, and `src/main/rpc/router.ts` from the roster plan

**Interfaces:**

- `OutfitTemplate = {id:string; name:string; slots:CharacterLook['slots']; hiddenSlots:AppearanceSlot[]; illusionIds:CharacterLook['illusionIds']}`
- `CharacterOutfit = OutfitTemplate & {characterId:CharacterId; originTemplateId:string|null; customizationOverrides:CustomizationChoice[]|null; revision:number}`
- `applyAppearance(look:CharacterLook, slot:AppearanceSlot, choice:AppearanceRef|null):CharacterLook` creates a draft without changing the observed source snapshot
- `model.resolve(input)` accepts `{characterId,mode:'observedTransmog'|'equippedAppearance'}` or `{characterId,mode:'draft',draft:OutfitTemplate,customizationOverrides:CustomizationChoice[]|null}` and returns SceneResolution; validate all draft inputs against the selected character's identity and capability context
- `outfit.save({characterId,outfit,expectedRevision}) -> {revision:number}` persists canonical choices independently of whether every asset can currently render
- Save uses revision conflict feedback; imported updates never overwrite an unsaved draft, and deleted/missing appearance mappings remain recorded as unresolved

- [ ] Write failing tests: wardrobe swaps alter only the draft, equipped/transmog toggle uses distinct source looks, save/restart restores exact variant and hidden choices, template copies remain independent, unknown collection status stays unknown, and unsupported slots/forms keep the editor available
- [ ] Run `vp test src/renderer/features/wardrobe/appearance-editor.test.ts`; expect failures before implementation
- [ ] Integrate CharacterModel with the character page, and connect Wardrobe's slots, collected-only filtering, eligibility badges, missing-piece checklist, and save/duplicate actions to the canonical model APIs
- [ ] Repeat tests; expect pass, then manually verify outfit editing and character switching across the supported roster in light/dark, offline mode, larger text, reduced motion/transparency, and GPU failure
- [ ] Save a capability and acceptance report in `research/3d/ACCEPTANCE.md`; mark all unsupported forms/effects explicitly and describe each fallback in the UI
- [ ] Commit `feat: plan and save character outfits in 3d`

## Release gate

Run the original packaged-app checks plus the exact supported-character matrix from Task 1
A static image, a manually flattened outfit model, or a generic Three.js demo does not satisfy the real 3D wardrobe gate
If current Retail support regresses, preserve saved outfits and expose the affected build/capability rather than showing a wrong character

## Handoff

This plan proposes the research and implementation sequence; the current task writes planning artifacts only
The first concrete 3D milestone is Task 1's reproducible asset-and-outfit-swap demonstration
