# Plan enhancement recommendations

Approved scope: editable secondary-stat weights saved per character/spec/activity plan, whole-plan marginal enchant and gem recommendations with diminishing returns, individual application, and explanations of damage, healing and survivability

Architecture: a pure shared scorer consumes recorded ratings, planned gear deltas and verified flat enhancement stats. A renderer loader uses existing local item power and Blizzard tooltip endpoints, with bounded concurrency and cached queries. The plan inspector owns preference and recommendation controls; existing draft persistence carries preferences

Constraints: no invented DPS or health conversion, no proc scores, no replacing unsaved edits, no undocumented socket creation, no treating missing values as zero. Mastery requires rating-point conversion rather than specialization display percentage. Unknown conversions remain unranked

- [x] Verify DR thresholds with an executable upstream implementation and regression fixtures
- [x] Add pure parsing, whole-plan rating adjustment and marginal weighted scoring tests, including replacement subtraction, threshold crossing, missing data and multi-stat gems
- [x] Persist optional weights through schema, draft memory, normal saves and simulated-item staging
- [x] Add cached candidate loading, individually applicable suggestions and stat-effect help to the inspector using existing controls
- [x] Keep Raider.IO bonus IDs and observed levels; Add to plan from Top players copies the most worn copy, and levels only from local game files are labelled estimates
- [x] Run relevant tests/typecheck/build, inspect the running UI and publish a PR

Weights mean relative value per point of rating before DR, not simulated stat weights that already incorporate the current character's penalties. Equal weights are a neutral starting point, not a recommended specialization priority
