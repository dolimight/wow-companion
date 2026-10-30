# Public profile source

The Raider.IO adapter uses the documented public `GET /api/v1/characters/profile` endpoint on a fixed `https://raider.io` origin
Fields requested are `gear`, `talents`, `mythic_plus_scores_by_season:current`, `mythic_plus_ranks`, `raid_progression`, and `mythic_plus_weekly_highest_level_runs`
Weekly runs are assigned to the reset week of the crawl time, never the fetch time, and are labelled as an estimate of Great Vault progress
The API contract, current backoff guidance, and attribution requirement were checked against the [official developer API](https://raider.io/api) on 2026-10-14

Provider crawl time is retained independently from the local import time
Missing/private metrics remain unknown, ranking population is unknown, and the world overall Mythic+ rank is explicitly labeled as that scope
Raid kill summaries are progression rather than character performance percentiles
No PvP rating or seasonal legal item-level cap is inferred from this endpoint
The adapter does not prove ownership of a public profile or equate its display name with an addon GUID

Requests use no secrets, reject redirects, honor caller cancellation, have a 15-second timeout, and limit decoded response bodies to 2 MiB
HTTP 429 exposes the provider's `Retry-After` delay to the main-process retry policy
The root service controls queue concurrency and decides when to retry
Automated tests use deterministic response fixtures and cover valid, missing/private, and malformed data
No successful live character lookup or private account access is claimed by these tests

## Top players (`raiderio-top.ts`)

Current season comes from the documented `GET /api/v1/mythic-plus/static-data`
Players come from `GET /api/mythic-plus/rankings/specs`, the same leaderboard the Raider.IO website shows. It is undocumented, so any failure falls back to scanning the documented `GET /api/v1/mythic-plus/runs` roster for the spec
Gear is sampled from up to 12 of those players through the profile endpoint, four requests at a time, and every count is shown with its sample size
Results are cached for 6 hours in memory and in the profile's `cache` folder; checked live on 2026-10-20 against Midnight Season 2

## Weekly progress

The addon (0.2.0) reads `C_WeeklyRewards.GetActivities`, `GetSavedInstanceInfo`, `C_MythicPlus.GetRunHistory`, and the game's reset countdowns, and is treated as exact
Without it, dungeons are estimated from Raider.IO weekly runs and raids from Blizzard's `encounters/raids` kill timestamps since the reset
Reset times are anchored to Raider.IO's published season start per region (US Tuesday 15:00 UTC, EU Wednesday 04:00 UTC, KR/TW/CN Wednesday 23:00 UTC)

## Blizzard extras

`statistics`, `specializations` (active talent string), and `encounters/raids` are requested with the character profile and fail soft when private
The WoW Token price uses `GET /data/wow/token/index` with the user's key; each published update is appended to `cache/token-history.json` for 30 days
