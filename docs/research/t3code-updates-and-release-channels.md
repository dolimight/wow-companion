# T3 Code desktop updates and release channels

Inspected October 30, 2026 at upstream commit `6fc9144a60c4a5f45089316ddd5f7371bafd3bf2`

This is source-backed research and a WOW Companion recommendation, not an implemented updater
Downloaded source excerpts stay in ignored `.local/t3-update-research`

## What the desktop actually does

T3 Code wraps `electron-updater` in an Effect service
It checks for updates 15 seconds after startup and every four minutes thereafter, in supported packaged builds
An update flow explicitly calls `downloadUpdate`, tracks updater events, and eventually calls `quitAndInstall` with silent install and relaunch options
The updater's automatic download and install-on-quit flags are disabled so application code controls the experience

Windows packaging uses NSIS with differential packages enabled
Release artifacts include updater manifests and blockmaps
Differential downloads are supported but not guaranteed: the implementation disables them when migrating an Intel macOS installation on an ARM host to the ARM package

The result feels like an OTA update because the user does not fetch or launch a new installer manually
Bytes still download and the installed desktop application is updated/replaced; this is not a renderer-only hot patch or an update requiring no installation underneath
Applying a desktop update requires a relaunch

The CLI/server has a separate verified-archive update mechanism, and the hosted web client has its own deployment channels
Those mechanisms should not be mistaken for how the Electron executable updates
WOW Companion does not need T3 Code's remote-machine/provider update orchestration

## Release channels and schedule

| Aspect | Observed T3 Code behavior |
| --- | --- |
| Stable | Plain semantic version, such as `0.1.5`, tag `v0.1.5` |
| Nightly | Next patch target with `-nightly.YYYYMMDD.RUN`, such as `0.1.6-nightly.20261030.3917` |
| Nightly date | UTC build date |
| Nightly uniqueness | GitHub workflow run number, not a guessed build count |
| Nightly scheduler | Cron at minutes 8 and 38 of every hour |
| Scheduled publish gate | New commits since the prior nightly, and at least six hours since it was published |
| Manual nightly | Supported independently of the scheduled publish gate |
| Stable dispatch | Normally promotes the latest published nightly's exact commit, not current main HEAD |
| Stable version | Defaults to the nightly's base version, with an explicit version override available |
| Explicit stable tag | Builds the tagged commit, retaining a deliberate hotfix path |
| GitHub visibility | Nightly is a prerelease and never the latest stable release |
| Notes comparison | Previous release in the same channel, so stable includes the whole stable-to-stable change range |
| Publication | One GitHub release contains artifacts for the produced platforms/architectures and updater metadata |
| Release concurrency | Separate stable and nightly groups, without canceling active publishers |

“Nightly” is the development channel name, not a promise of one build each night
Recent release timestamps are consistent with multiple builds per day, and manual runs may be closer together
There is no fixed weekly stable schedule in the inspected workflow

T3 Code also has a maintainer-only Preview train
It deliberately publishes no updater feed or blockmaps, so ordinary stable/nightly installations cannot be offered branch test builds
That third channel is not needed for WOW Companion's first updater

## Release notes and in-app grouping

T3 Code generates a release body with a version/change/contributor header, a short Highlights section, a Fixes section, and a collapsed Full changelog
Its generator uses commit subjects plus pull-request descriptions and falls back to GitHub-generated notes when summarization is unavailable
The in-app update notes consume the short content ahead of the full-changelog disclosure

Stable notes compare against the previous stable, not the latest nightly
Nightly notes compare against the previous nightly, preventing stable releases from showing only the last few hours of changes
Grouping is a presentation/release-range decision; it does not require maintaining a separate long-lived nightly branch

## Recommended WOW Companion design

### Desktop updates

- Keep Electron and electron-builder; add `electron-updater` in the main process
- Keep NSIS on Windows and DMG plus ZIP on macOS; publish platform/architecture-specific manifests and blockmaps as appropriate
- Configure a release provider at packaging time so installed builds contain a valid feed
- Expose narrow update commands and state through the existing tRPC/preload boundary, never the updater object in the renderer
- Use Idle, Checking, Available, Downloading, Ready to restart, Installing, and Error states with retry and progress
- Check on startup and periodically, with single-flight protection and bounded retry
- Offer Download update followed by Restart and update, plus Later; never restart during a simulation, unsaved plan/outfit edit, backup, or active import
- Stop workers cleanly and release SQLite before installing; preserve user-data paths and record the expected installed version for the next launch
- Leave development builds disabled with explanatory state rather than attempting to update a source checkout
- Verify packaged upgrade behavior on actual installed builds, including an old database fixture and interrupted-download recovery
- Code-sign release builds and use macOS notarization for distribution; current WOW Companion config disables Windows signing and needs a release-specific signing setup

An existing build with no updater needs one manual installation of an updater-enabled build before later upgrades can happen in-app
The current repository has no `electron-updater` dependency, no publishing provider, and no release workflows

### Stable and Nightly

- Stable example: `0.1.1`
- Nightly example: `0.1.1-nightly.20261030.42`
- Use `main` for ongoing development; tag channel releases instead of adding a parallel nightly source branch
- Match T3 Code's every-30-minute eligibility check with a six-hour minimum gap and a changed-commit gate for scheduled nightlies
- Publish stable manually by selecting the tested nightly commit, with notes spanning the prior stable release
- Keep stable and nightly manifests isolated; stable never automatically accepts a prerelease
- Add Update track under Settings → Updates & About, plus current version, channel, last check, release notes, and manual check
- Treat a Nightly → Stable switch as a possible downgrade: check SQLite migration compatibility, retain a consistent backup, and refuse an unsafe downgrade rather than assuming code rollback reverses data migrations
- A track switch is an explicit update operation, not simply changing a string in Settings
- Keep addon versioning independent for compatibility, but ship the addon snapshot with every desktop release that changes it; update installed addon files through the existing service and explain that WoW needs `/reload`

### Release presentation

Use a Stable / Nightly filter in release history, concise Highlights and Fixes, and a collapsed full technical changelog
Show each nightly's base target and build date, and keep it out of the stable latest-release link
Conventional commit scopes or PR labels can organize Gear, Addon, Wardrobe, Performance, and Fixes without introducing an AI release-note dependency
An optional human-reviewed summary generator can come later

### Private repository constraint

`dolimight/wow-companion` is private, so a public GitHub updater feed cannot anonymously read its release assets
Private GitHub updates require authorized requests; the documented personal-machine option uses a user-supplied token, not a token embedded in the app

For current personal use, private releases with locally supplied authentication are viable
For distribution while keeping source private, choose either a separate public binaries-only release repository or an authenticated release service
No public release repository or hosting service has been created as part of this research
Never assume that making binaries public also keeps their embedded application code private

## Implementation sequence

1. Agree on release hosting/access while retaining the existing private source repository
2. Add and test the main-process updater adapter, update state contract, restart guards, and version verification
3. Add packaging feeds, signing, artifact naming, manifests, and stable/nightly version resolution
4. Add release CI with validation, packaged smoke checks, scheduled nightly gating, stable promotion, and same-channel notes
5. Add the Settings update controls and a quiet available-update indicator in the existing shell
6. Exercise installed old → new updates on Windows, then macOS, with preserved data and safe failure/retry behavior

## Primary sources

- [Updater service](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/apps/desktop/src/updates/DesktopUpdates.ts)
- [electron-updater adapter](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/apps/desktop/src/electron/ElectronUpdater.ts)
- [Packaging configuration](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/scripts/build-desktop-artifact.ts)
- [Release workflow](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/.github/workflows/release.yml)
- [Nightly gating and stable promotion](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/.github/scripts/check-nightly-release.cjs)
- [Nightly version generation](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/scripts/resolve-nightly-release.ts)
- [Release notes generator](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/scripts/generate-release-notes.ts)
- [Maintainer release documentation](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/docs/operations/release.md)
- [User updating documentation](https://github.com/pingdotgg/t3code/blob/6fc9144a60c4a5f45089316ddd5f7371bafd3bf2/docs/user/updating.md)
- [electron-builder updater documentation](https://www.electron.build/docs/features/auto-update/)
