# CrawlSpace shared rules (vendored)

Pure modules copied from CrawlSpace's `src/` (same folder layout, so their relative imports still work).
They run the loot generator, sealed loot boxes and minion rules exactly as the app does.

Local changes, all for the "everything rounds down" rule:

- `shared/effectValues.ts`, `shared/inventoryItems.ts`: percent bonuses use `Math.floor` instead of `Math.round`.
- `shared/manaRestore.ts`: percent mana restore uses `Math.floor` instead of `Math.ceil`.
- `shared/minions.ts`: `raisedHealth` uses `Math.floor` (still at least 1).

When updating from CrawlSpace, copy the files again and reapply these changes.
