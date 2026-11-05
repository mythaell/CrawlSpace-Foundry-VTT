# CrawlSpace for Foundry VTT

A Foundry VTT **V14** game system for CrawlSpace: health slots, ranked skills and spells, typed damage with resistances, the 27 standard debuffs, and five-phase Mob/Crawler combat.

## What's in the box

| Part | Where | Committed? |
| --- | --- | --- |
| System code (TypeScript → `dist/crawlspace.mjs`) | `src/` | yes (source); `dist/` is built |
| Sheets, chat cards, dialogs | `templates/`, `styles/`, `lang/` | yes |
| Homebrew skills, spells and items | `packs-src/` → `packs/` | JSON source yes; LevelDB built |
| Game-database content module (`crawlspace-content`) | `build/crawlspace-content` | **no**: book text, built locally |

## Setup

```bash
npm install
npm run build         # dist/crawlspace.mjs
npm run packs         # homebrew packs + the content module (reads CrawlSpace's Postgres)
npm run link          # junction into %LOCALAPPDATA%/FoundryVTT/Data
```

- The pack builders read the database URLs from CrawlSpace's `.env` (`../Dungeon Crawler Carl RPG/.env`). Point `CRAWLSPACE_ENV` at another file to override.
- `npm run packs:homebrew -- --offline` compiles the committed `packs-src` without a database.
- Stop Foundry (or close the world) before rebuilding packs: Foundry locks the LevelDB files.
- `npm run watch` rebuilds the bundle on save. Reload Foundry (F5) to pick it up.
- `npm test` runs the rules tests; `npm run typecheck` checks the TypeScript.

## How CrawlSpace maps onto Foundry

- **Effects** are Foundry ActiveEffects. Plain bonuses use core `add` changes on `system.*` paths. Rank, health-slot, percent, roll-mode and special bonuses use custom change types (`crawlspace.skillRank`, `crawlspace.healthBonus`...). Item effects apply while the item is held, weapons, equipment and tattoos only when equipped, and rank-gated effects only from their rank on.
- **Debuffs** replace core status effects. Stacks, Clean Up damage, check penalties and immunities follow CrawlSpace's rules.
- **Combat** keeps Foundry's Combat document. "Next turn" steps through the five phases, a phase strip sits in the tracker, mobs declare attacks to chat, and crawlers answer with Evade, Tank, Shield Block or Samurai Blade Clap buttons.
- **Damage and healing** use chat-card buttons (Apply ×½ / ×1 / ×2, Heal, Undo). Players can apply to tokens they don't own through a GM relay.
- **Characters** from CrawlSpace backups import with the *Import CrawlSpace character* button in the Actors sidebar.

## Not done yet

Pets and mounts, the loot generator, character builders, reference tables as RollTables, inherent spells, light orbs and minions (stored as specials only).

## Time and timers

The GM is prompted to set the floor-collapse countdown when the world has none. The floor clock and visible secondary countdowns stay on screen; click them, or choose **Time & Timers** in the Actors directory or Upkeep, to open the controls. Timer entry accepts overflowing fields: 90 minutes becomes 1 hour 30 minutes, and 30 hours becomes 1 day. Individual countdowns can be paused, adjusted, or removed.

**Start** enables real-time exploration while a GM is connected. Foundry's pause stops it, and active combat uses the tracker instead: one complete five-phase round advances ten seconds. The clock does not charge disconnected time. Time skips advance Foundry's world clock once for the whole party, so cooldowns, effects, regeneration and countdowns share the same elapsed time. Select participating crawlers for recovery: short rests take 2 hours, long rests 8 hours, and full rests 30 hours. Safe-room visits can include an explicit stay. Grinding tracks productive hours, overtime Endurance checks and fatigue, map/guide aid, banked skill/spell progress, daily advancement attempts and automatic level gains. Days are 30 hours long.

Cooldowns begin only after a completed skill/spell use, including weapon-linked skills and inherent grants. Active cooldowns appear on the Actions tab and can be reset there. Conditional durations such as safe-room entry, long rest, leaving a floor, healing and combat end use Foundry effect expiry; unsupported conditional prose remains manual. Editing an effect's duration text starts its newly entered duration. Existing embedded item copies retain their data; consuming a potion resolves its duration text using the corrected time rules.

`tests/foundry-time.mjs` exports integration checks intended only for the isolated Foundry copy on port 30001. They create disposable documents, verify time behavior, and remove their own documents and chat messages afterward. Never run them in a live campaign.

## GM upkeep and awards

The token-controls submenu has a **Party Upkeep** button for GMs. Select participating crawlers and choose a rest, safe-room visit, End Session, End Floor, grinding, stat allocation, level gain or Crawler Awards. Party rests and grinding advance time once for the whole group. The GM resolves grinding allocations and checks; canceled preparation does not spend time or award progress. Starting a new grinding day preserves banked skill/spell hours.

Under **Configure Settings > CrawlSpace**, **Allow player upkeep without time skips** defaults off. When enabled, owners can request upkeep through the active GM. Player requests never advance world time, even for rests or grinding; any required grinding or untrained-skill choices open for the GM. Only GMs get clock controls and the party controls button.

Rank caps are 15 unless a matching race/class exception permits 20 from Floor 7. Explosives use their linked skill for the attack check, their own damage, and consume one unit after the check is accepted. Plain checks offer a floor-check option (skill DC 10 + twice the floor; stat DC 10 + the floor). Killing-blow spell bonuses are spell-specific and expire on the source rules' long-rest, week or floor boundary. Immunities remove matching conditions and post the System AI response.

**Crawler Awards** accepts absolute or signed AI Favor/popularity values, creates achievement items, and awards sealed loot boxes with an optional achievement link. This dialog awards named boxes; random loot generation remains a separate unported feature.
