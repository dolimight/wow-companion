# Implementation documentation check

Checked on 2026-10-15 against the desktop implementation and local acceptance artifacts

The React and Electron implementation extends the approved character folio world, with the roster, selected-character pane, gear planner, standings, and wardrobe retaining the existing system typography, blue selection, quiet separators, and adaptive semantic surfaces

This pass preserves `DESIGN.md` and `.impeccable/design.json` under the ordinary-extension boundary. It records implementation differences here without changing the approved visual identity or treating existing documentation drift as permission to rewrite its rules

Evidence checked: `src/renderer/App.tsx`, `src/renderer/style.css`, `src/renderer/components/ui/primitives.tsx`, the model-stage stylesheet, `PRODUCT.md`, `DESIGN.md`, `.impeccable/design.json`, `.impeccable/surfaces/src-renderer-app-tsx.md`, and `README.md`

The initial local captures in `.local/desktop-acceptance-1792024660204/acceptance/` cover `roster.png`, `gear-planner.png`, and `wardrobe-no-assets.png`. Their accompanying `report.json` reports passing real UI actions for persisted drafts, character isolation, importing, offline restoration, GLB inspection, and graphics recovery; this documentation pass reviewed that evidence and did not independently rerun those actions

Final wardrobe evidence comes from `.local/debug-acceptance-1792070402648/acceptance/`: `wardrobe-no-assets.png`, `wardrobe-no-assets-light.png`, `wardrobe-glb-inspection.png`, and `wardrobe-glb-light.png`. Visual inspection confirms that both the empty stage and loaded GLB stage inherit the dark shell, while the light captures retain the corresponding paper surfaces and blue actions. The accompanying `report.json` records 15 passing checks, zero renderer console errors, and no debugger exceptions

## Existing-world conformity

| Incumbent rule | Implementation evidence |
| --- | --- |
| Selection Rule | Navigation uses the blue accent and on-accent text; selected rows use a blue wash, with item violet and success green remaining semantic |
| Numeric Alignment Rule | Roster and planner tables use tabular numerals and right-aligned numeric columns |
| Material Rule | Interior panels use surface tone and separators; sheets, popovers, selected segments, and toasts carry contextual depth |
| System typography | The platform font stack remains local, with 30px page headings, 18px section titles, and 12px control labels |
| Accessible feedback | Controls expose focus outlines and pressed states; CSS supplies reduced-motion, reduced-transparency, and higher-contrast treatments |

## Product truth

Startup is empty, while fictional demo data requires an explicit action and carries demo labels. Imported observations and saved plans remain distinct, scoped to the selected character, and source times retain their meaning

The wardrobe can inspect an attached complete local GLB through React Three Fiber 9.8.2, with `Canvas` in `ModelStage.tsx` and `useThree` / `useFrame` in `InspectionScene.tsx`, while appearance drafts remain separate from that exported model. Dynamic WoW armor and weapon assembly has not passed its feasibility gate; the ignored non-WoW Fox acceptance fixture proves model plumbing only

Real legal seasonal ceilings remain unknown until a compatible ruleset is validated. Fictional demo values do not establish live game limits, and editing a target does not establish combat performance

## Unresolved documentation drift

`PRODUCT.md` still says no application scaffold or feasibility test exists and describes the addon as planned. Those implementation-status statements predate the app, addon, local GLB work, and acceptance evidence

`DESIGN.md` and the sidecar still describe an HTML mock, session-only state, decorative window controls, authored SVG symbols, preview-only imports, and an unconnected renderer. The app now has SQLite persistence, real imports, Radix dialogs and popovers, Lucide icons, and local GLB inspection

Some descriptive measurements also belong to the earlier mock: the current default sidebar is 194px rather than 184px, ordinary buttons have a 34px minimum rather than 32px, responsive breakpoints differ, and the right sheet is modal with a maximum width of 460px. The body line-height is 1.5, while the recorded body role remains 1.45. The sidecar records a 2600ms toast lifetime and the design prose records 2800ms

The final source and dark/light captures verify the model-stage theme repair: its surface, ink, borders, secondary text, and focus treatment now use the incumbent semantic variables. The earlier white panel in the dark shell is superseded by this evidence

The final `ModelStage.tsx` replaces the placeholder and rotate/zoom glyphs with Lucide SVG components (`Box`, `RotateCcw`, `RotateCw`, `Plus`, and `Minus`). The four final captures verify those icons in dark and light empty/loaded states, resolving the earlier icon defect without changing the approved world

No incumbent tokens or design documents changed in this pass, and none of these differences establishes a new visual identity
