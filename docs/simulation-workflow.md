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
- The defaults request at most four threads, reserve two available CPU threads where possible, and allow thirty minutes
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

## Validation and remaining release gate

Focused tests exercise real fixture child processes for timeout, cancellation, output bounds, argument isolation, and report parsing, plus persistence, character deletion, baseline invalidation, and uncertainty comparisons

Those fixtures are synthetic and do not establish a real engine/client round-trip

Current-game validation requires the user-selected SimulationCraft executable and a complete real character profile. No executable is downloaded automatically

## Primary references

- [SimulationCraft profile syntax](https://github.com/simulationcraft/simc/wiki/TextualConfigurationInterface)
- [Equipment identifiers](https://github.com/simulationcraft/simc/wiki/Equipment)
- [Command-line JSON reports](https://github.com/simulationcraft/simc/wiki/Output)
- [Current JSON report implementation](https://github.com/simulationcraft/simc/blob/midnight/engine/report/json/report_json.cpp)
- [Retail SimulationCraft addon profile writer](https://github.com/simulationcraft/simc-addon/blob/master/core.lua)
