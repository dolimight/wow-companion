# Workspace preferences

- In T3 Code use its native planner; in other coding hosts use the host's native planner or a local Markdown plan
- Do not use visual-plan or the separate Plan viewer
- Keep design sources and mock assets local to this workspace
- Use Apple design principles for the UI, adapted to Electron and shadcn
- Do not end user-facing UI copy or assistant replies with a period
- Preserve punctuation inside multi-sentence copy, code, URLs, and file paths
- Always use the integrated Electron title bar with native platform window controls
- Use shadcn Base UI Select and Toggle controls instead of native select elements or checkbox inputs
- Never push directly to main, even for small changes or repository maintenance
- Work on a feature branch and submit a pull request; merge only through the required GitHub checks with no administrative bypass
- Author all standalone maintenance and release scripts and their tests in TypeScript; WoW addon sources and addon tests remain Lua because the game requires it
- Run TypeScript scripts with node --import tsx; generated JavaScript belongs only in ignored build directories
- Keep the complete shadcn Base UI component library available for future use and reference, while preserving existing application-specific adaptations

## Provider-neutral collaboration

- This file is the canonical repository guidance for every coding assistant and human contributor
- Do not pin model names, reasoning budgets, providers, or agent-specific APIs into the build, CI, scripts, or application
- Use standard repository commands and readable local artifacts so another assistant can continue the work
- Assistant-specific instruction files are pointers to this file, not separate sources of project rules
- Optional skills, MCP servers, editor plugins, and coding agents must not be prerequisites for building, testing, or releasing the app
- Read README.md for commands, PRODUCT.md and DESIGN.md for product/UI constraints, and docs/repository.md for contribution and delivery rules
