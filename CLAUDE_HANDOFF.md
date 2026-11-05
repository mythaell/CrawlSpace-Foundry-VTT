# CrawlSpace Foundry handoff for Claude

Date: November 5, 2026
Branch: `feat/initial-system`
Target: `C:/1. Eric's Files/Apps/CrawlSpace Foundry VTT`
Read-only reference: `C:/1. Eric's Files/Apps/Dungeon Crawler Carl RPG`

## Latest user requests and fixes

The user explicitly requires all gameplay rolls and calculated results to round down. This overrides source-app exceptions such as percentage mana recovery rounding up. Negative fractions floor toward negative infinity: -1.5 becomes -2.

### Spell properties could not open

`templates/item/details.hbs` had the killing-blow fieldset after the closing root section. Spell sheets consequently rendered multiple top-level elements for an ApplicationV2 part. Moved the fieldset inside the section. The spell sheet now opens and includes its stacking controls in Details.

### Effect rules were clipped without scrolling

In `styles/crawlspace.css`, constrained the effect sheet content and gave `.effect-body` `flex: 1 1 0`, `min-height: 0`, `overflow-y: auto` and stable scrollbar space. Immediate children do not shrink. The existing PARTS scroll tracking remains in place. Live tests verified a nonzero viewport, overflow, and successful scrolling to the bottom. Visual inspection showed the scrollbar and an open spell sheet together.

### Round-down behavior

- Added `src/dice/crawl-roll.ts`, a native Roll subclass registered first in `CONFIG.Dice.rolls`. It floors async, synchronous and recomputed totals. A stable class name survives production minification and native roll serialization.
- System call sites now use `Roll.create`, including checks, damage, healing, magic damage caps, custom action formulas, advancement and grinding. Native dice/results are preserved. Core callers using the default Roll factory also receive this behavior.
- Floored derived attributes/modifiers, movement, step, DR, evade, mana maximum, health-slot thresholds, ranks and spell mana costs.
- Floored split damage shares, resistance halves and Shield Block results.
- Percentage mana restoration now floors, e.g. 50% of 15 restores 7.
- Floored numeric awards, duration conversions/display, and relevant integer conversions.
- Fixed importer number parsing: decimals were previously stripped (12.9 could become 129). Decimal values now parse and floor, including negative modifiers. Imported health floors to its ten-point slot boundary.
- The remaining `Math.round` calls set token footprint dimensions, a canvas layout conversion rather than gameplay math.

## Validation

- Final production build and TypeScript checks pass.
- 16 Node rule tests pass, including negative arithmetic, split/resisted damage, time fractions and decimal import regressions.
- 10 new live Foundry checks in `tests/foundry-sheets.mjs` passed: async/sync/negative rolls, serialization, preserved die results, spell sheet rendering, spell mana cost, percentage recovery, and effect scrolling.
- Existing 45 live upkeep/time/combat checks also passed, with the popularity expectation updated from 2.5 to 2.
- The final health-slot flooring and decimal-import edits were followed by build/typecheck and the relevant Node tests; the full browser suite was run before those last small edits.
- After the user closed their Foundry instance, all 3 homebrew packs and 11 content packs rebuilt successfully. No net committed pack-source changes resulted from this rebuild.
- `git diff --check` passes.

## Previous delivered work

Commit `07726a2` added GM-only clock controls, optional player upkeep without time skips, the token-controls Party Upkeep button, grinding, End Session/End Floor, Blade Clap, rank caps, killing-blow stacks, immunity responses, explosives, floor checks and Crawler Awards. Commit `28338af` added shared countdowns, cooldowns and world-time coordination. See README for access paths and behavior.

## Operational notes and limits

- Do not operate or restart the user's main game on port 30000. Tests used the separate copy under `build/time-test`, on port 30001; that server is stopped.
- Browser control became disabled in Work settings during final cleanup. One visual-only actor named `Disposable sheet preview` (id `k46b5m3GGfsLi6Xi`) remains in the scratch world only. The automated tests cleaned up their own actors and chat. Do not remove anything from the user's main world to clean up this fixture.
- Scratch-only launcher: `build/time-test/Data/worlds/crawlspace-dev/time-tests.mjs`; its import is appended only to the scratch bundle. Production `dist` has no test launcher.
- Existing world embedded items keep their data; compendium rebuilds do not overwrite them.
- Legacy serialized chat rolls keep historical totals. Third-party code explicitly constructing the base `new Roll` instead of using the configured factory is not rewritten. No global monkey patch was introduced.
- Crawler Awards creates named sealed boxes and achievement links; random loot generation remains unported. Player grinding requests are resolved in the GM dialog and never advance time.
- No push or PR. The source app repository was not edited.
