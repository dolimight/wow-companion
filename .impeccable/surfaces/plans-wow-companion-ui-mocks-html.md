---
version: 1
slug: "plans-wow-companion-ui-mocks-html"
primary_target: "plans/wow-companion/ui-mocks.html"
related_targets: []
---

# WoW desktop UI mockups

## Scope

Operate mode, high-fidelity visual mocks for Characters roster with selected-character pane, Character, Gear planner, Standings, Wardrobe, and import freshness
The user authorized UI mock design; these are review artifacts, not a production Electron implementation
Product discovery and stack choices are recorded in PRODUCT.md and plans/wow-companion/plan.mdx
Use code-first app mockups with the existing standard component vocabulary

## Direction contract

THESIS: A character sheet with a useful route to stronger gear; lead with the paper doll and exact slot gaps, then contextual rankings

OWN-WORLD: User-pinned Apple design principles override the earlier palette direction; an adaptive light/dark desktop shell, system typography, a functional translucent sidebar, blue selection, quiet silver separators, shadcn-style controls, immediate press feedback, and reduced-motion/transparency/contrast support

STORY: Recognize the character, read current versus attainable versus maximum gear, inspect the weakest slot, then compare with relevant players and plan an outfit

FIRST VIEWPORT: Persistent left navigation and native title bar around a searchable character roster, with item level, target gap, activity metric, and observation age aligned in rows; a selected-character pane to the right holds identity, the concept figure where available, gear context, and the next useful action, with Open character as the main action

FORM: User-pinned Apple design applied to the character-folio composition; seed 2d819f1a remains historical context; standard Electron desktop navigation with a consistent slot-gap alignment signature

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Direction notes

The brief's shadcn preference fixes the ordinary control language
The type-specimen challenger contributes stronger numeric alignment
The high-density web challenger contributes denser useful rows without reducing type below readable size
The cassette challenger contributes a clear separation between current and planned loadouts
The botanical folio challenger contributes consistent character framing for outfit comparison
The map challenger contributes clearer grouping of collection categories
The timetable challenger contributes a consistent state mark in a fixed table cell
These transfer system discipline only; the mocks keep one coherent desktop visual world

## Truth and open decisions

The user confirmed a roster overview plus a selected character as the home view
Character switching preserves each character's gear draft, activity filters, and outfit draft during the mock session
The wardrobe extends the existing world with appearance variants, separate shoulders, collection/eligibility context, disabled 3D camera controls, and reviewable loading/missing/unsupported/graphics-error states
No animation or image transform may imply a real WoW model or working outfit renderer
All names, gear levels, cap values, ratings, and ranks are fictional demo content
The avatar is a generated illustration and must be identified as such rather than as a working 3D renderer
No trailing periods in UI copy
The actual character and current ruleset remain unknown
Use T3 Code's native planner, keep sources and feedback local, and do not use visual-plan or the separate Plan viewer
