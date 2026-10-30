# 3D acceptance status

Partial implementation — local imported model inspection is available; live WoW character assembly and editable 3D transmog remain gated

Preserved fallbacks:

- No model: explicit local-assets state and choose-local-GLB action, alongside the working outfit editor
- Unsupported assembly/form/build: canonical appearance choices remain saved and no invented character is rendered
- Invalid or incomplete GLB: import error explains that a complete uncompressed export is required
- Character switch during load: prior request is aborted and any late scene is disposed
- Graphics context loss: retry creates a fresh stage; no outfit data is changed
- Hidden/minimized document or out-of-view stage: animation stops until visible
- Animation and reduced motion: models start paused, with direct camera controls and no automatic rotation/inertia

Automated coverage includes shared GLB validation, model cache ownership, stage lifecycle, and loader cancellation/disposal tests

Actual Electron acceptance now exercises the React Three Fiber stage using the official Khronos Fox GLB fixture: embedded textures and three clips, camera controls, graphics loss and retry, and twenty character switches retaining one viewport and paused playback on arrival
Main and renderer debuggers both observe and resume an actual JavaScript pause, then monitor uncaught exceptions through the desktop checks
The final source-build run at `.local/debug-acceptance-1792070402648` passed all 15 checks with no recorded debugger exceptions or renderer console errors, with dark/light and minimum-width captures

The packaged executable also passed the same 15 checks under `.local/debug-acceptance-1792070641431`, including GPU loss/retry and both debugger pause/resume probes
See [runtime-evidence.json](runtime-evidence.json) for the retained summary and tested archive checksum

Real Retail reference matches, WoW animation compatibility, dynamic appearance swaps, and live-character GPU/performance acceptance remain unproven

See [FEASIBILITY.md](FEASIBILITY.md) for the exact unpassed release checks and pinned-source findings
