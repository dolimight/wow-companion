# Retail character rendering feasibility

Decision: **partial** — local GLB inspection is implemented, live Retail character assembly is not implemented or proven

This result does not pass the real 3D wardrobe release gate in the approved plan

## Evidence gathered on this machine

- The user confirmed `C:\Program Files (x86)\World of Warcraft\_retail_`; a read-only probe also found its parent installation and CASC `Data` directory
- The active local client reports `12.1.5.70391`, product `wow`; that identifies installed data and does not establish renderer compatibility
- Windows reports an NVIDIA GeForce RTX 5070 and AMD Radeon integrated graphics
- No game archive, account identity, character customization, encryption keys, credentials, or exported Blizzard model was copied into the repository
- The user's two representative characters and exact reference outfits have not been provided or captured
- Source evidence and hashes are in [source-probe.json](source-probe.json), reproducible with [workbench/probe.mjs](workbench/probe.mjs)

## Source candidate reviewed first

Candidate: [wow.export](https://github.com/Kruithne/wow.export/tree/c2fd7bde36a712be78a5da896c995b84fbfa2545), commit `c2fd7bde36a712be78a5da896c995b84fbfa2545`, package version `0.2.19`

The project code is MIT licensed, with upstream notices retained in the ignored source checkout. That software license does not grant ownership or redistribution rights over Blizzard game artwork. This application bundles none of those assets

Concrete source findings:

- [`tab_characters.js`](https://github.com/Kruithne/wow.export/blob/c2fd7bde36a712be78a5da896c995b84fbfa2545/src/js/modules/tab_characters.js#L278) contains actual appearance recomposition: geosets, composited textures, skinned models and attached equipment
- The same module has independent left/right shoulder attachment logic at line 664 and equipment skin modifiers; these are promising source capabilities, not app acceptance evidence
- [`M2RendererGL.js`](https://github.com/Kruithne/wow.export/blob/c2fd7bde36a712be78a5da896c995b84fbfa2545/src/js/3D/renderers/M2RendererGL.js) uses its own WebGL context, M2/SKEL loaders, shader mapping, BLP textures, bone buffers and global core services
- [`DBCharacterCustomization.js`](https://github.com/Kruithne/wow.export/blob/c2fd7bde36a712be78a5da896c995b84fbfa2545/src/js/db/caches/DBCharacterCustomization.js) reads build-specific DB2 tables for races, body models, customization options/choices, conditional and skinned models, texture layers and geosets
- [`casc-source-local.js`](https://github.com/Kruithne/wow.export/blob/c2fd7bde36a712be78a5da896c995b84fbfa2545/src/js/casc/casc-source-local.js) reads a local install and has optional remote fallback; local presence alone does not guarantee every requested file is available offline
- [`build.json`](https://github.com/Kruithne/wow.export/blob/c2fd7bde36a712be78a5da896c995b84fbfa2545/build.json) builds an NW.js application with mixed-context and Node worker assumptions. Those settings have not been copied into Electron

The reusable boundary requires extracting build-aware CASC/DB2 resolution and serializable appearance assembly out of the upstream Vue/NW.js globals, with binary reads in a constrained worker and an audited renderer adapter. Loading the application module in the sandboxed renderer would require violating the current process boundary

No upstream executable or build script was run. Source checkout inspection alone cannot establish current Retail compatibility or performance

## Implemented inspection path

`ModelStage` accepts an app-issued `wow-asset://` URL for an imported, self-contained GLB 2 file. The main process validates and copies the file into a private local cache, then issues its opaque descriptor per character

React Three Fiber 9.8.2 owns the canvas and scene lifecycle, using Three.js GLTFLoader with no external decoder scripts. External resource references are rejected before parsing. Camera orbit/zoom, front/back/reset, animation selection and explicit play/pause are supported for compatible exports. Demand rendering stops idle animation, and playback starts paused, including for reduced motion

Character/model request generations abort older fetches. Late GLTF completions release their scene rather than replacing a newer selection. Teardown removes observers, controls, loops and GPU resources. Visibility and intersection observers stop animation while the document/stage is hidden. Graphics loss exposes retry without changing saved outfits

A flattened model can be inspected and replaced as a whole. Changing an outfit slot does not reassemble that model, and the UI states that limitation

The actual Electron renderer was exercised with main and renderer debuggers attached on 2026-10-15 using the official Khronos Fox GLB fixture, kept outside the shipped app. Three embedded clips loaded with textures on the NVIDIA RTX 5070, graphics-context loss recovered, and twenty character switches retained one DOM canvas with playback paused on arrival. These observations validate imported GLB plumbing; they do not establish WoW compatibility or prove that all GPU allocations were reclaimed

The final source-build run is saved locally under `.local/debug-acceptance-1792070402648`, including `debugger.json`, `acceptance/report.json`, and dark/light captures. Both debugger pause/resume probes and all 15 desktop checks passed with zero recorded exceptions or renderer console errors

The packaged executable independently passed the same 15 checks with both debuggers attached under `.local/debug-acceptance-1792070641431`. The harness consumes completed offscreen paint frames, avoiding a first-compositor screenshot race found during package verification. A portable summary, fixture checksum, scoped switch observations and tested application archive checksum are retained in [runtime-evidence.json](runtime-evidence.json)

## Acceptance status

| Check | Result |
| --- | --- |
| Local Retail install/build probe | Pass, build `12.1.5.70391` observed |
| Pinned source/license/dependency review | Pass as a source review |
| GLB import URL boundary and invalid resource tests | Automated tests pass |
| Late character/outfit request rejection and disposal ownership | Automated tests pass |
| Real character customization reference match | Untested |
| Imported GLB textures, three animation clips and camera controls | Pass with Khronos Fox fixture in actual Electron |
| Main and renderer debugger pause/resume and uncaught monitoring | Pass in explicit debugger acceptance mode |
| Imported GLB graphics loss and retry | Pass in actual Electron, saved outfit retained |
| Twenty imported GLB character switches | Pass for DOM canvas ownership and paused arrival; not GPU-allocation proof |
| Dynamic armor/weapon swap without new export | Not implemented |
| Independent shoulders, hidden slot and variant in live stage | Untested |
| Two representative Retail characters | Not captured |
| Ten-load/swap median and p95 | Not measured |
| Twenty-switch live GPU/resource benchmark | Not measured |
| Missing texture/offline/build mismatch real-client cases | Not measured |
| GPU context failure in packaged Electron | Pass for imported Fox GLB retry; live Retail assembly remains untested |

Unit tests establish the import and ownership boundaries. The separate runtime observations concern the Fox fixture only, and are not a real-character substitute

## Next integration gate

1. Record the two actual characters, source build and reference outfit/customization IDs locally
2. Extract and audit the pinned CASC/DB2 and appearance resolver services without enabling Node inside the renderer
3. Feed their resolved model, attachments, composited textures, skeleton and variants into an isolated audited M2 adapter
4. Demonstrate actual weapon and armor swapping, split shoulders, a hidden slot, a variant and rapid character changes using installed data
5. Run the approved benchmark and recovery matrix on the packaged Electron app, then update capabilities only with saved evidence

Until that gate passes, keep the 2D outfit editor available and label current 3D support as local export inspection
