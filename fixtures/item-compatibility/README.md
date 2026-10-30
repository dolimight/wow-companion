# Item compatibility fixture provenance

The test items are fictional records, not redistributed client item databases

Class and specialization identities were checked against the locally read Retail `12.1.5.70448` `ChrSpecialization` table, including Blood 250, Fury 72, Protection Paladin 66, Hunter 253–255, and Arcane Mage 62

Restriction fields use the supported-layout names in [WoWDBDefs ItemSparse](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/ItemSparse.dbd) and [ItemSpecOverride](https://github.com/wowdev/WoWDBDefs/blob/master/definitions/ItemSpecOverride.dbd)

Primary modifier IDs use [TrinityCore's ItemModType definition](https://github.com/TrinityCore/TrinityCore/blob/master/src/server/game/Entities/Item/ItemTemplate.h): agility 3, strength 4, intellect 5, adaptive combinations 71–74

Weapon/slot rules describe equipment suitability for the selected specialization, not a guarantee of personal-loot eligibility, ability performance, or best-in-slot status

Unknown classes, unrecognized specs, missing masks, unavailable override tables, and missing stat fields remain partial checks

Engine tests cover paging beyond 180 rejected candidates, filtering before same-name deduplication, Fury two-hand offhand queries, legacy-index fallback, failed refresh, cleanup of a partial replacement, and the zero/zero override tombstones found in the client table

A local isolated index rebuilt successfully against installed Retail `12.1.5.70575` with 175,625 item records. Blood main-hand, Mage main/off-hand, and Fury main/off-hand probes returned verified equipment checks; Blood off-hand correctly returned no items. Reproduction script and output remain in ignored `.local/s1-compatibility-live*` files
