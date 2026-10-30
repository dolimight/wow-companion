# Seasonal progression rules

The production catalog deliberately contains no verified seasonal ceiling yet

The installed client checked during S1 implementation was 12.1.5.70575. The local item index is not an exhaustive source of legal, obtainable reward variants, and published base upgrade tracks do not establish every current-season exception

## Adding a supported ruleset

1. Add a ruleset accepted by `src/shared/season-rules.ts` with its exact supported build interval, season, effective dates, sources, and validation fixtures
2. Add its exact candidate variants under the matching ruleset ID in `candidates.json`
3. Verify reward variants, acquisition availability, unique/crafting restrictions, and upgrade costs/discounts against the supported client
4. Set coverage and validation flags only for facts established by those checks
5. Run source-backed progression fixtures and the Electron progression acceptance flow before publishing the ruleset

Partial candidate catalogs may show best-known results but cannot establish a verified legal maximum

Synthetic rules and items belong in test fixtures only and never in this production catalog

Primary references checked:

- [Blizzard 12.1.5 update notes](https://worldofwarcraft.blizzard.com/en-us/news/24304162/1215-content-update-notes)
- [Client item upgrade API declarations](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/ItemUpgradeDocumentation.lua)
- [Client currency API declarations](https://github.com/Gethe/wow-ui-source/blob/live/Interface/AddOns/Blizzard_APIDocumentationGenerated/CurrencyInfoDocumentation.lua)

Unknown balances, discounts, upgrade tracks, or effective rules stay unknown; the app never substitutes a personal target or item-table maximum
