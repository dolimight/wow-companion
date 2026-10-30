# WOW Companion: product research and recommended roadmap

Research checked 27 October 2026

## Recommendation

Build the app around one recurring decision: which character should I play, and what should I do in the time I have?

The strongest opportunity is combining your roster, actual item variants, weekly opportunities, upgrade costs, and performance history into a small set of explained actions

Keep the Electron app and addon together. The desktop owns planning, history, external data, and optional simulations; the addon supplies observations and native in-game previews

This is a research proposal, not a claim that the proposed features already work

## What the current repository establishes

- `src/shared/progression.ts` calculates gaps to a supplied target or maximum; a validated seasonal rules engine still needs to supply the maximum
- `src/shared/swap-estimate.ts` estimates stat changes and derives a better/worse/mixed verdict; it does not simulate combat performance
- `src/main/providers/raiderio-top.ts` requests a limited player sample and can fall back to players found in high runs; that fallback should retain its explicit sample description
- The weekly view already displays source-aware Vault progress, giving the action planner a useful starting point
- A shared compatibility helper exists, but the inspected game-data engine still uses index version 1 and does not index `AllowableClass` or `ItemSpecOverride`; finish and test the full data path before describing search as fully spec-compatible
- `research/3d/FEASIBILITY.md` records unproven live character assembly. Exported model inspection and a fully swappable Retail character are different capabilities
- Documentation has drifted: README limitations and PRODUCT capabilities disagree on some account integration features. Treat current source and runtime evidence as the acceptance criteria

## 1. Make progression answer the original question

Show several distinct targets rather than collapsing them into one power percentage

- Equipped item level, with its real observation time
- Maximum upgrade of the items already owned, subject to their tracks
- Best equipment obtainable through the activities the player chooses
- Highest legal equipment combination available under the validated current rules
- Immediate affordable improvements using observed currencies

Each slot should show the current variant, upgrade ceiling, replacement candidate, cost, source, and any remaining condition

The theoretical equipment maximum requires a legal combination across slots. Taking the highest item number from a game-data table can include obsolete, test, inaccessible, or mutually exclusive items

Store rules by game build, season, effective date, and source. Include upgrade tracks, currency costs, crafting and catalyst rules, unique-equipped restrictions, and weapon configurations. Keep future announced changes separate from rewards available now

The product should explain a gap: which slots account for it, which can improve immediately, and which depend on future rewards

Acceptance: the app reproduces manually checked examples, explains every included item, and leaves unsupported caps unknown

## 2. Add a session planner above the existing dashboards

Let the player choose a goal and time budget, such as pushing score, finishing weekly rewards, preparing for raid, or collecting an outfit

Return a short queue of actions across the roster. A hypothetical recommendation might be to finish one weekly requirement on an alt, then target a dungeon that contains several useful drops for the main

Every action needs a reason, prerequisites, relevant reset, expected benefit, and evidence age. Estimates of time or reward probability must identify their assumptions

Combine deterministic rules first: remaining Vault requirements, unclaimed rewards, available upgrades, known lockouts, and selected targets. Add simulation-backed benefits when available

Use the player's observed run times once enough history exists. Avoid inventing precise drop chances or completion times when the input data is missing

Keep choices manageable: one recommended action and a few alternatives, with explanations available on demand

[Raidbots Droptimizer](https://support.raidbots.com/article/59-droptimizer-how-does-it-work) already groups prospective upgrades by source, demonstrating why a source-oriented decision view is useful

## 3. Treat gear as exact variants and sets

An item ID alone is insufficient for optimization. Preserve the bonus IDs, actual level, upgrade track/rank, sockets, gems, enchant, crafted stats, and relevant special effects that distinguish variants

Separate these states in the planner:

- Desired item acquired
- Desired upgrade rank reached
- Desired enhancements applied
- Complete planned configuration achieved

An item can match the planned ID while still needing upgrades or enchants. Dim the completed acquisition task while leaving those remaining tasks visible

Add bag and bank inventory when the addon can observe it, with clear coverage for alts. Include legal weapon pairs, unique-equipped constraints, tier configurations, and seasonal crafting restrictions

For Great Vault decisions, compare each choice against the same optimized baseline. Raidbots documents how mixing an optimized bag set with an older equipped baseline can distort the comparison: [Great Vault and Optimized Current Gear](https://support.raidbots.com/article/73-great-vault-and-optimized-current-gear)

Acceptance: a saved recommendation can be reproduced using its exact baseline, item variants, talents, rules, and engine version

## 4. Add a simulation adapter rather than a new combat model

Start with SimulationCraft profile import/export, then preserve links or imported results from an external sim. Evaluate a managed local SimulationCraft executable after the data pipeline is reliable

The [SimulationCraft addon](https://github.com/simulationcraft/simc-addon) already exports character data and bag items. Its source also contains support for additional character systems; reusing a maintained format reduces the amount of patch-sensitive serialization to own

A background job should record character/spec, exact baseline, talents, scenario, game build, engine build, settings, runtime, result uncertainty, and creation time. Provide cancellation and a CPU budget

Invalidate or mark results stale when relevant inputs change. Keep results for historical inspection, but don't apply them to an unrelated loadout

Show statistically tied results as sidegrades. [Raidbots explains](https://support.raidbots.com/article/61-top-gear-sidegrades) why small DPS differences can fall inside simulation uncertainty and need not justify repeated gem or enchant spending

For Blood Death Knight, a damage simulation answers a damage question. Add survival and execution review separately; do not translate a DPS gain into a claim of safer tanking

The existing stat estimate can remain as an explicitly labeled estimate. Reserve simulated performance labels for an actual supported engine result

## 5. Make comparisons fair and useful

Keep activity views separate and provide two comparison populations: aspirational leaders and relevant peers

Useful filters include season, patch or ranking partition, spec, role, region, dungeon/key level, raid boss/difficulty, item-level bracket, and observation window

Show the population and sample size beside any percentage. A sample of top players can describe popular choices; it cannot establish a percentile among all players or prove the best gear for this character

[Murlok](https://murlok.io/) describes its builds as popularity data collected from top players. That is a useful benchmark for presenting observed choices honestly

[Warcraft Logs' ranking guide](https://www.warcraftlogs.com/help/ranks/) distinguishes best rankings from individual parses, bracket-specific comparisons, historical versus current comparisons, and ranking partitions. Preserve those distinctions when importing results

For Dolimight, investigate deaths, defensive timing, encounter mechanics, interrupts, and damage in comparable encounters. Label contextual observations instead of assigning one universal tank skill score

Begin with player-provided public log links and supported summary data. Prototype event-level metrics against actual available reports before promising automated coaching

## 6. Build a transmog workflow that works in stages

Start with owned versus missing appearances, saved outfits, sources for missing pieces, race/body compatibility, and a collection shopping list

Next, export an outfit code the player can paste into the addon. The addon can open an in-game preview; return captured outfit data through the existing observation/export process

Keep the transport explicit. SavedVariables do not create a direct WebSocket between WoW and Electron, and the desktop cannot force WoW's in-memory state to flush

[Narcissus](https://www.curseforge.com/wow/addons/narcissus) demonstrates how much character presentation and outfit inspection the game client can provide

Treat desktop 3D as a bounded technical investigation. [wow.export](https://github.com/Kruithne/wow.export) provides an existing character/export implementation to inspect, but that does not establish an Electron integration or redistribution permission for extracted game art

The release gate should use a real character and demonstrate working skin/customization, armor swaps, weapon attachment, body variants, animation, lighting, and predictable behavior when assets are missing

## 7. Make freshness and recommendation evidence visible

Use field-specific observation records, with source, observed time, retrieval time, coverage, and build

Keep an item-level snapshot distinct from a newer ranking refresh. A background file check should not make old gear appear fresh

Each recommendation should retain an evidence trail: why it was proposed, which rules applied, which inputs were unknown, and which changes invalidate it

[Raider.IO's API](https://raider.io/api) documents rate limiting and attribution. Use backoff, shared caches, and deduplicated requests; avoid a fixed polling loop that repeatedly refreshes unchanged public data

For in-game work, design around the current permitted API surface. Blizzard's [Midnight addon explanation](https://news.blizzard.com/en-gb/article/24246290/combat-philosophy-and-addon-disarmament-in-midnight) describes restrictions on combat-state processing, making pre-session planning and post-session analysis a sensible focus

## Projects worth studying

Read these as implementation examples, not independently validated products

- [SIMulacrum / wow-gear-sim](https://github.com/ktmsft/wow-gear-sim): its README describes local gear combinations, currencies, Vault evaluation, talents, and simulation history
- [Simdragosa addon](https://github.com/Xiantus/simdragosa-addon): its README describes transferring desktop simulation results into item tooltips and source-oriented upgrade lists
- [SimulationCraft](https://github.com/simulationcraft/simc) and its [addon](https://github.com/simulationcraft/simc-addon): maintained simulation and export boundaries
- [Narcissus](https://www.curseforge.com/wow/addons/narcissus): character and cosmetic presentation inside WoW
- [wow.export](https://github.com/Kruithne/wow.export): native model and appearance assembly research

I reviewed documentation and repository descriptions for these projects; I did not install or runtime-test them during this research

## Recommended build order

First finish end-to-end item compatibility, exact variant capture, field-level freshness, and a small validated seasonal ruleset

Then add a session planner using the existing weekly view and an upgrade-cost queue. Its first release should produce useful actions without requiring simulations

Next add SimulationCraft import/export, reproducible result storage, bag-aware plans, and Great Vault comparisons

Follow with matched peer comparisons and a limited report-review feature. Keep PvP metrics and progression separate

Build outfit collection planning and in-game previews alongside these improvements when cosmetics are the priority. Keep desktop 3D behind its feasibility gate

Do not put a general AI chat box ahead of these systems. A later assistant can explain structured evidence and adjust goals while deterministic rules and simulation engines calculate the results

## Success criteria

The player should be able to open the app before a session and choose a character and useful action without opening several other sites

They should understand the recommendation, reproduce its assumptions, see what changed after playing, and recognize when the app lacks enough evidence to advise
