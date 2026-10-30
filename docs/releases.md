# Desktop releases and updates

WOW Companion releases are published to [GitHub Releases](https://github.com/dolimight/wow-companion/releases)
Stable and Nightly share one installed application and preserve the same local user-data directory
The updater downloads application packages, not just renderer patches; applying an update restarts the desktop app

## Version and schedule

- Stable uses a plain version such as `0.1.1`, with tag `v0.1.1`
- Nightly uses the next stable patch target, UTC date, and workflow run number, such as `0.1.1-nightly.20261030.42`
- Every 30 minutes, at minutes 8 and 38, the release workflow checks whether main is ahead of the previous nightly and at least six hours have passed since publication
- Manual Nightly dispatch bypasses the scheduled time gate
- Stable dispatch promotes the exact commit of the latest published nightly, with its base version unless explicitly overridden
- A plain `vX.Y.Z` tag provides a deliberate release-branch/hotfix path and builds exactly that commit
- Stable is GitHub's latest release; Nightly is a prerelease and never becomes latest
- Stable notes compare with the previous stable, and Nightly notes compare with the previous nightly

Source package versions do not have to be edited between every nightly: the resolver considers the latest published stable when deriving the next patch target
CI stamps package and lockfile metadata only in the build checkout, without creating a source commit

## Publish

1. Push changes to main and let validation complete
2. In Actions → Release WOW Companion → Run workflow, select main and Nightly, or wait for the scheduled gate
3. Download and verify the nightly on a separate test profile
4. Run the same workflow on main with Stable to promote that nightly's commit
5. Check the completed GitHub release and its update assets before distributing the installer

The workflow runs typechecking, unit tests, release-script tests, and packaged debugger acceptance before publication
It builds Windows x64 NSIS plus macOS arm64/x64 DMG and ZIP artifacts
The publish step validates manifest versions, asset sizes and SHA-512 hashes, merges macOS manifests across architectures, and creates SHA256SUMS
All artifacts are uploaded to a draft before it is published, so a feed never points at a partially uploaded release
Stable and Nightly use isolated manifests, and builders are configured not to generate other channels' feeds

## Signing

Signing credentials live only in repository Actions secrets
No token or certificate is embedded in source or application update feeds

| Platform | Secrets |
| --- | --- |
| Windows certificate | `WIN_CSC_LINK`, `WIN_CSC_KEY_PASSWORD` |
| macOS Developer ID | `MAC_CSC_LINK`, `MAC_CSC_KEY_PASSWORD` |
| macOS notarization | `APPLE_ID`, `APPLE_APP_SPECIFIC_PASSWORD`, `APPLE_TEAM_ID` |

The workflow can create unsigned artifacts while certificates are absent
Windows unsigned installers are suitable for personal testing but may trigger operating-system reputation prompts
Unsigned macOS artifacts do not establish a production auto-update path: configure a Developer ID certificate and notarization before relying on macOS OTA updates
Local Windows validation does not establish macOS runtime or signing correctness

## Bootstrap and update behavior

An old build that contains no updater needs one manually installed updater-enabled release
After that, Settings → Updates & About checks the current track, downloads an available release, and offers Restart and update or Later
Development and isolated acceptance profiles do not poll GitHub for real updates
An unavailable feed is reported with retry; a successful download is not reported as an installed upgrade until a subsequent launch confirms the expected version

Stable does not automatically consume Nightly builds
Switching Nightly back to an older Stable may require a newer stable release rather than a binary downgrade, because SQLite migrations are not automatically reversible
Never reuse a production profile to test unsupported database downgrades

The bundled addon retains its own version and is updated through the existing addon installation service
Changes loaded inside WoW still need `/reload` or a new login

## Local checks

```powershell
node --import tsx --test scripts/release/*.test.ts
npm run check
npm run build
```

`scripts/release/prepare.ts` is the authenticated GitHub Actions entrypoint and must not be used with a token embedded in a command line or committed configuration
The scripts that stamp package versions are intended for disposable release checkouts

## Implementation verification · October 30, 2026

- Full TypeScript and 261 unit tests pass, including updater lifecycle, version ordering, restart blockers, and off-route unsaved gear protection
- All 12 release-script tests pass, including exact-commit stable promotion, scheduled skip decisions, and manifest integrity checks
- Production compilation passes
- Source Electron acceptance passes all 33 checks with main-process and renderer debuggers attached
- Packaged Windows acceptance passes the same 33 checks using an isolated fictional profile
- The generated Windows installer includes the GitHub update provider and ships with `latest.yml` and its differential blockmap
- Renderer-only libraries are build dependencies; seven runtime packages are collected into the desktop package

Local packaged evidence: `.local/packaged-release-x64-1793384184918/acceptance/report.json` and sibling `debugger.json`
Local source evidence: `.local/debug-acceptance-1793383872879/acceptance/report.json`
The generated bootstrap installer is `release/WOW-Companion-0.1.0-win-x64.exe`

These checks do not establish a real GitHub-fed old-version → new-version installation/relaunch or macOS runtime behavior
That round trip requires published release versions, and production macOS distribution requires signing/notarization credentials
