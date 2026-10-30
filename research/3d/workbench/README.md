# Local 3D research workbench

The current workbench is a read-only source and installation probe, not a dynamic Retail character demonstration

## Reproduce the source evidence

```powershell
git clone https://github.com/Kruithne/wow.export.git research/3d/vendor/wow.export
git -C research/3d/vendor/wow.export checkout c2fd7bde36a712be78a5da896c995b84fbfa2545
node research/3d/workbench/probe.mjs research/3d/vendor/wow.export 'C:/Program Files (x86)/World of Warcraft'
```

The script reads source text, the installed `.build.info` product/version fields, and whether `Data/data` exists. It never executes upstream code or reads game archive contents. The checkout remains ignored and must not be packaged

## Verify the implemented boundaries

```powershell
npx vitest run src/shared/model-glb.test.ts src/renderer/features/model-stage/scene-lifecycle.test.ts
npm run typecheck
```

No generic fixture or exported flattened model can satisfy the dynamic wardrobe gate

## Inspect a model you already exported

Use the app's Choose local GLB action on the selected character. Supply one self-contained uncompressed GLB with embedded textures and buffers, under 100 MiB. It is copied to private app storage and associated with that character

Exports can contain recognizable WoW assets only when supplied locally by the user. The app repository contains none. Animation controls appear only for clips embedded in that export. Slot edits are saved in the outfit editor but do not change exported geometry

## Required next experiment

Extract a worker-safe CASC/DB2 and appearance-assembly boundary from the pinned candidate, build the audited M2 adapter, and capture the real two-character dynamic swap matrix described in the approved plan. No such experiment has run yet
