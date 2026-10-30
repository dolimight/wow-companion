# Repository maintenance

## Branch and release rules

- Work on a feature branch and open a pull request; never push directly to main
- Main requires passing GitHub Actions checks and an up-to-date branch, resolved review conversations, and linear history
- Squash merge is the only enabled merge method; merged branches are deleted automatically
- No ruleset bypass actors are configured, including administrators and automation
- Review approval count is zero, matching T3 Code's current model and keeping a single-maintainer repository usable
- Required external approval needs another trusted reviewer; do not enable a self-approval deadlock
- Version tags matching `v*` cannot be changed or deleted; new tags remain available to release automation
- Release candidates must belong to main, including explicit stable tags
- Owners can still edit GitHub settings; repository rules cannot remove the owner's administrative control

Active rulesets: [main guardrails](https://github.com/dolimight/wow-companion/rules/26231334) and [immutable release tags](https://github.com/dolimight/wow-companion/rules/26231336)

## CI/CD

PR validation runs full TypeScript, unit tests, maintenance/release script tests, and a production build
Windows packaged smoke builds the NSIS package and exercises it with main/renderer debuggers against an isolated fictional profile
Release automation builds the Windows x64 installer, verifies feeds and checksums, and publishes complete releases
Nightly eligibility is checked every 30 minutes with changed-commit and six-hour gates; Stable promotes a published nightly's exact commit
See [releases](releases.md) for signing, versioning, bootstrap installation, and release commands

Actions are pinned to commit SHAs, workflow tokens default to read-only, and Actions cannot approve pull requests
Dependabot version and security update pull requests are turned off; update dependencies and pinned Actions by hand when needed
Dependency alerts, secret scanning/push protection, and CodeQL default setup stay enabled in GitHub

## Scripts

Standalone maintenance and release scripts and their tests are authored in TypeScript and run with `node --import tsx`
WoW addon code and addon tests remain Lua because the game requires it
Generated Electron preload output may be CommonJS, but generated output is ignored

```sh
npm run check
npm run test:scripts
npm run build
npm run test:debug
npm run icons -- --out-dir .local/icon-check
```

`npm run icons` regenerates native icons using Electron's existing image APIs, with no PowerShell dependency
The icon helper supports an output directory for checks that should not overwrite shipping assets

## Documentation map

- README.md — setup, commands, and app overview
- PRODUCT.md and DESIGN.md — product truth and the visual system
- docs/roadmap-implementation-2026-10-29.md — shipped workflows and current limitations
- docs/specs — feature contracts and the pending navigation proposal
- docs/outfit-workflow.md, docs/simulation-workflow.md, docs/model-inspection.md — focused feature guides
- docs/releases.md and this file — delivery and maintenance
- public/assets/README.md — shipping image provenance and regeneration

Keep the full shadcn Base UI component library available for future use and reference, including currently unused components
Preserve the app-specific adaptations to components already in use, and do not introduce native Select controls into app flows
Keep shipping assets in source control without duplicate mock imagery or generated review screenshots
Generated logs, installers, databases, credentials, research downloads, old mockups, and screenshots belong outside the tracked source tree
Removed historical work remains available in Git history

## Coding assistants

AGENTS.md is the single source of repository instructions
Codex reads it directly; CLAUDE.md, GEMINI.md, .cursor/rules/project.mdc, and .github/copilot-instructions.md point other assistants to the same guidance
No build, test, or release command requires an AI provider, model, subscription, MCP server, or agent-specific skill
The TypeScript scripts and standard npm commands are the same for human and assistant use
