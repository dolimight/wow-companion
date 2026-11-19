# Simulation workflow

The Simulations page exports observed character profiles, stores supported manual profiles, bookmarks external reports, and manages an explicitly chosen local SimulationCraft command-line executable

Profiles and report bookmarks work without configuring an engine

## Profile coverage

The exported baseline records character identity, specialization, level, race, build, gear variants, enhancement identifiers, and talents when observed

Missing fields remain partial and appear in the baseline explanation

Manual import accepts one bounded data-only character profile, including the supported Retail addon header and numeric item fields. It rejects include files, network imports, custom actions, arbitrary output destinations, multiple actors, and other unsupported directives

A saved import that does not exactly match the recorded baseline is retained as a manual artifact and cannot run as the current character. Use **Use current export** to clear that import

The parser deliberately does not support every SimulationCraft directive. Additional systems and unsupported differences keep the import partial instead of silently dropping combat inputs

## Local execution

- Choose the installed command-line executable through the native file picker
- Select Patchwerk or Dungeon Slice, the activity, CPU threads, and a time limit
- The defaults request two threads, reserve two available CPU threads where possible, and allow thirty minutes
- Time limits range from one to 120 minutes
- One local job runs at a time, with up to ten waiting requests
- Cancellation and timeout terminate the process and never publish partial output as a completed result
- Input profiles are limited to 1 MiB, stdout/stderr to 1 MiB, and JSON results to 100 MiB
- Managed jobs use argument arrays with `shell: false`, private job directories, fixed output names, and local item data
- Planned sets additionally require verified seasonal legality for the entire set

The executable choice stays in the local engine configuration and is never returned to the renderer as a path or included in JSON backups

Only supported JSON report version 3 layouts are read. A successful process exit does not establish that an engine supports the observed game build

The adapter records engine version/revision/hash, baseline and profile hashes, scenario/options, report version, game data build, result time, and standard error where provided

Matching builds and complete coverage are required for a current result. Changes to gear, enhancements, talents, specialization, build, or the selected executable make historical results inapplicable

Results describe modeled damage in a scenario. They do not measure PvP performance, healing effectiveness, tank survival, or player skill

External report links are bookmarks with baseline provenance and user notes, not structured imported evidence

## Best gear

Gear → Best gear searches for the best combination of gear in three SimulationCraft stages, in `src/main/optimizer`:

1. **Screening:** every candidate runs alone in place of what is equipped in its slot, at 1,500 iterations. Candidates are the pieces in the bags, bank, and Great Vault. With targets on, they also include this season's drops for the spec and the top players' most worn items, at the top regular upgrade level. Rings and trinkets are tried in both of their slots
2. **Choosing:** the app builds sets from each slot's best clear gain. A gain counts only when it is larger than its noise, twice the error of the difference between two runs; at 1,500 iterations that is about ±700 damage per second. Paired slots are chosen together, and a set takes at most one vault choice. A connected AI assistant (the `gearCombos` feature in `docs/ai-assistants.md`) sees each gain with its noise and adds sets of owned gear, then sets that add one to three targets to the best owned set
3. **Confirming:** every set runs at 6,000 iterations. The page names the best owned set with a clear gain as Wear now. Worth chasing lists single pieces, at most one per slot and two for rings and trinkets, ranked by what each adds over the best you own for that slot

Screening results are kept for 14 days, up to 2,000 per character, in the `optimizer-cache` feature state (`src/main/optimizer/cache.ts`). Each is keyed by the baseline hash (everything equipped and the talents), the piece as the engine sees it, the fight, the iterations, and the executable's hash, so a run again only measures what changed. Confirming always runs fresh

A tank spec gets a warning, since the simulation measures damage and not survival. The run records what was equipped, and the page says when the gear has changed since

An engine failure never ends a search. When SimulationCraft crashes, its log names the profileset it was building, so that set is left out and the rest run again. When the log doesn't name one, the batch is split in half until the failing set is found. Every skipped piece or set gets a note on the page and a line in the troubleshooting log. Only a setup problem, such as no engine chosen, or the player stopping the run ends it early. Gear saved above this season's highest item level (for example, from before an item level squish) raises a warning, and a slot is never emptied because of it. Older item IDs that a returning dungeon lists beside their reissue are dropped

Every stage runs at below-normal process priority. The processor load defaults to light (two threads); medium uses four and heavy uses half the processor threads. Sustained all-core load can reset a computer whose power, voltage, or cooling isn't stable under it, so raise the load only on a machine that passes a stress test. Owned pieces take the enchant used in their slot. A set that can't be worn or described to the engine is skipped with its reason, never failing the run. The AI assistant only proposes sets; every number on the page comes from SimulationCraft

## Loot finder

Gear → Loot finder ranks where to farm. It is the same engine in `mode: 'loot'`: the pool is only this season's drops that fit the character (dungeons for Mythic+, Heroic raid bosses for Raiding), each measured alone at the first rank of the chosen upgrade track (Champion, Hero, or Myth, from `trackStartLevel` in `src/main/item-tracks.ts`). `lootSources` in `src/shared/optimizer.ts` groups the clear gains by dungeon or by raid boss, counting the best piece per slot and a ring or trinket once. Runs are saved apart from Best gear (feature state `optimizer-loot`) and reuse the screening cache

## Great Vault advisor

When the addon has seen this week's Great Vault choices, Best gear shows a Great Vault card. Its comparison is the optimizer in `mode: 'vault'`: owned pieces are screened (reusing the cache), `vaultSets` builds the best owned set without the vault, then that set with each choice in its slot, and every set is confirmed. `vaultChoices` ranks each choice once by its gain over skipping the vault and names one to take only when that difference clears the noise. Runs are saved in `optimizer-vault`

## Validation and remaining release gate

Focused tests exercise real fixture child processes for timeout, cancellation, output bounds, argument isolation, and report parsing, plus persistence, character deletion, baseline invalidation, and uncertainty comparisons

Those fixtures are synthetic. The real engine round trip runs only in GitHub Actions (`.github/workflows/simulationcraft.yml`): `src/main/simulation/engine.e2e.test.ts` takes a sample Blood Death Knight profile from the official `simulationcraftorg/simc` Docker image, adds profileset lines written by the app's `itemLine`, runs the engine through `runSimulationProcess`, and reads the report with `parseSimulationReport`. It runs on pull requests that touch simulation or optimizer code, nightly, and on demand. Locally it is skipped, because SIMC_IMAGE is unset, so it never runs on a player's computer

Current-game validation requires the user-selected SimulationCraft executable and a complete real character profile. No executable is downloaded automatically

## Primary references

- [SimulationCraft profile syntax](https://github.com/simulationcraft/simc/wiki/TextualConfigurationInterface)
- [Equipment identifiers](https://github.com/simulationcraft/simc/wiki/Equipment)
- [Command-line JSON reports](https://github.com/simulationcraft/simc/wiki/Output)
- [Current JSON report implementation](https://github.com/simulationcraft/simc/blob/midnight/engine/report/json/report_json.cpp)
- [Retail SimulationCraft addon profile writer](https://github.com/simulationcraft/simc-addon/blob/master/core.lua)
