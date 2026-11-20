# AI assistants

AI help is optional and runs through an assistant command-line tool the player already has installed and signed in, so it uses their own plan. The app ships no model, keys, or provider account, and every page works the same with AI help off

The player picks one assistant under Settings → AI assistants. The choice is saved as `aiProvider` in the app settings

## How a question runs

1. The renderer calls `api.aiAsk({ feature, input })`
2. `src/main/ai/service.ts` checks the input against the feature's schema in `src/shared/ai.ts` and builds the prompt with the feature plugin
3. The picked provider plugin runs its CLI once, with no shell, in a new empty folder under the app's data, with a time limit and an output cap
4. The answer is checked against the feature's output schema before the page sees it, and the folder is removed

## Providers

A provider implements `AiProvider` in `src/main/ai/types.ts`: `detect()` reports whether its CLI is installed and signed in, and `run()` answers one prompt with JSON that follows a schema

- `codex` runs `codex exec` with a read-only sandbox, `--ephemeral`, `--ignore-user-config`, `--ignore-rules`, and `--output-schema`
- `claude` runs `claude -p` with `--tools ""`, `--safe-mode`, `--no-session-persistence`, and `--json-schema`

Both look on PATH and in their installer's folder. An npm `.cmd` shim runs through its JavaScript entry point in the app's own Node runtime, so no argument ever reaches a shell. Neither pins a model: each CLI uses the model its own settings choose

To add a provider, write one more `AiProvider` and add it to `builtinProviders()`

## Features

A feature implements `AiFeature`: fixed instructions, the JSON Schema the answer follows, and a `prompt()` built from its input and the character. Its input and output schemas live in `aiFeatures` in `src/shared/ai.ts`, and `aiAskSchema` lists the features the router accepts

- `bossCoach` gives spec-specific tips and cooldown timings for one boss, on top of the strategy the Dungeons and Raids pages already show. It's asked only when the player presses the button, and the answer is cached for the session
  - Its prompt includes the character's item level, trinkets, hero tree, and the specialization and hero talents its build takes, named from the installed game's talent tree (`talentSummary` in `src/shared/talents.ts`), so tips fit the player's own build. Answers are cached by boss, role, build, and item level, so new gear or talents allow a new answer
- `fightReview` reviews one fight from a public Warcraft Logs report. With the player's own Warcraft Logs API credentials, Performance → Reports reads the fight's damage done and taken by ability, casts, and deaths for the matched character (`fetchFight` in `src/main/comparisons/providers.ts`, two fixed read-only queries). The page shows those numbers first; the assistant sees only them, is asked only from its button, and must tie each finding to one
- `gearCombos` proposes whole gear sets for the Best gear search from each piece's screening gain. It runs in the main process during a search and isn't exposed to the renderer. The engine measures every set it proposes

To add a feature, add its schemas to `aiFeatures` and `aiAskSchema`, write the plugin under `src/main/ai/features`, and add it to `builtinFeatures`

## What leaves the app

Only what a feature's prompt holds. For boss tips, that is the boss, instance, difficulty, the player's class, spec, and role, and the strategy lines on the page. For Best gear, it is your class and spec, the fight, what you wear, and each candidate piece's name, level, source, and screening gain. Settings says this next to the assistant list
