# Stable and Nightly Updates Implementation Plan

Goal: install future WOW Companion desktop updates in-app from public GitHub releases, preserving local data and explicit user restart control

Spec: `docs/research/t3code-updates-and-release-channels.md`

Architecture: Electron main owns electron-updater and persistent channel state, exposed through the trusted preload boundary; renderer displays state and reports pending work; GitHub Actions creates tested channel artifacts and feeds

Constraints: keep the current integrated frame, pure-black theme, Base UI controls, and trailing-period preference; no tokens in application bundles; stable never consumes prereleases; no unsafe binary downgrade against a newer database

## Tasks

- [x] Define shared update state and narrow bridge methods for get/check/download/install/channel/events/blockers
- [x] Implement a dependency-injected main-process updater with deterministic tests for checking, progress, channel persistence, errors, disabled development mode, single-flight operations, downgrade refusal, and guarded installs
- [x] Wire Electron/preload; protect simulations, import/backup, and unsaved renderer work, stop services cleanly, and verify expected version after restart
- [x] Add version resolution, scheduled nightly eligibility, exact-nightly stable promotion, channel-isolated manifests, notes, and release workflows with script tests
- [x] Add Settings Updates & About with version/track, check/download/restart/later states, progress, errors, release links, and readiness limitations
- [x] Run TypeScript/unit tests, release-script tests, production build, native debugger acceptance, and a packaged update smoke test without touching personal data

Release authentication: public `dolimight/wow-companion` GitHub Releases, confirmed by the user making the source repository public

Signing: support CI signing secrets without requesting or embedding credentials; report unsigned-platform and unexecuted macOS limitations honestly

First-install boundary: existing builds need one manually installed updater-enabled release before subsequent in-app updates work

Validation: 261 unit tests, 12 release-script tests, production build, 33 source desktop debugger checks, and 33 packaged Windows debugger checks pass
The Windows NSIS installer, latest.yml feed, embedded app-update.yml configuration, and differential blockmap were generated locally
Actual GitHub-fed old-version → new-version install/relaunch is a remaining release validation step, as are macOS signing/notarization and runtime checks
