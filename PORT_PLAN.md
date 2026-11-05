# CrawlSpace → Foundry VTT System: Port Plan

**Source:** `C:\1. Eric's Files\Apps\Dungeon Crawler Carl RPG` (CrawlSpace 0.9.5 Beta)
**Target:** `CrawlSpace-Foundry-VTT` repository (this folder)
**Status:** Plan only. No code yet.

---

## 1. The key idea: port the game, not the platform

About half of CrawlSpace rebuilds what Foundry already provides. Those parts get **dropped**. The other half is the Dungeon Crawler Carl rules engine and content, which is what makes CrawlSpace valuable. That half gets **ported**.

| CrawlSpace subsystem | Foundry already has it | Port decision |
| --- | --- | --- |
| Accounts, sessions, email, admin, rate limits | Users, permissions, world ownership | **Drop** |
| Express API, 3 Postgres DBs, write receipts, migrations | World DB, compendia, `document.update()` | **Drop** (replaced by DataModels + compendia) |
| WebSocket party sync, live command engine, movement reconciliation | Socket layer, document sync | **Drop** |
| Scenes, walls, fog, lighting, tiles, drawings, templates, token rings | Canvas | **Drop** (use core) |
| R2 image storage, user/party image libraries | File browser, Data paths | **Drop** |
| Chat, roll cards, macros, hotbar | ChatMessage, Roll, Macro, Hotbar | **Adapt** (custom chat cards on core) |
| Combat tracker | Combat/Combatant docs | **Adapt** (custom 5-phase combat) |
| Character sheet, calculations, overrides | ActorSheet (ApplicationV2) | **Port** |
| Skills, spells, items, buffs/debuffs, effects | Items + ActiveEffects | **Port** |
| Damage, typed resistances, shields, health slots, Dying | — | **Port** (pure rules) |
| Upkeep, rest, advancement, floor/level progression | — | **Port** |
| Loot box generator, crawler awards | — | **Port** |
| Race/class/mob builders and budgets | — | **Port** (later phase) |
| Quests, neighborhoods, adventures | Journal entries | **Adapt** |
| Reference tables (149 entries) | RollTable + Journal | **Adapt** |
| System AI messages, party timers, pause | Core pause; small socket feature | **Adapt** (optional, late) |
| Dungeon Atlas, minimap, Point Mongo, bestiary page | — | **Defer**; maybe a companion module later |

**Result:** a Foundry *system* (`crawlspace`) carrying the rules, data models, sheets and automation, plus separate content **compendium module(s)**.

---

## 2. Things to decide before coding

1. **Content licensing (the most important one).** The game database holds content imported from the published DCC RPG books (rulebook corrections, mob attacks, 149 reference tables, spell tiers). A public Foundry system with that content in its compendia is a redistribution risk. Recommendation:
   - The **system** ships rules and mechanics only, plus original/SRD-safe examples.
   - **Book content** goes in a **separate, private compendium module** (for example a Patreon tier, or self-import only) unless you get permission from the publisher.
   - "Dungeon Crawler Carl" names and marks stay out of the system title and ID. Working ID: `crawlspace`.
2. **Foundry version.** Target the current stable generation (V13 at minimum; check whether V14 is stable at kickoff and target it if so). Use only modern APIs: `TypeDataModel`, `ApplicationV2` + `HandlebarsApplicationMixin`, and ESM. No legacy `template.json` data or `ActorSheet` v1.
3. **Language and build.** Keep **TypeScript + Vite**, as CrawlSpace already does, so the pure rules modules can be copied in with little change. Use `fvtt-types` (League of Foundry Developers) for typings.
4. **Sheet UI: Handlebars or React.** Recommendation: **Handlebars with ApplicationV2.** It is idiomatic, other modules can theme it, and it causes fewer re-render problems. The React sheet components (`src/components/characterSheet/*`) become layout and design references, not code to reuse. (React inside ApplicationV2 is possible, but it fights Foundry's render cycle.)
5. **How faithful the combat is.** Do you want a full custom 5-phase combat tracker in the first release, or core initiative first with phases layered on later? Recommendation: phases in v1. They are central to how DCC plays.

---

## 3. Target architecture

```
crawlspace/                      (system root = repo root)
  system.json                    id "crawlspace", documentTypes, packs, socket: true
  src/
    crawlspace.ts                init/ready hooks, CONFIG registration
    config.ts                    stats, damage types, slots, debuffs, phases, loot tiers
    rules/                       ← ported from CrawlSpace src/shared (pure TS)
    data/                        TypeDataModel classes (actor + item subtypes)
    documents/                   CrawlActor, CrawlItem, CrawlCombat, CrawlChatMessage, CrawlActiveEffect
    sheets/                      ApplicationV2 sheets per actor/item type
    apps/                        Upkeep, Loot Generator, Awards, Builders, Encounter declaration UI
    chat/                        roll cards, damage/heal/apply buttons, condition drag-drop
    dice/                        Roll subclasses (check modes, Amazing/Critical tiers)
    migration/                   CrawlSpace JSON → Foundry importers; world schema migrations
  templates/                     .hbs
  styles/                        CSS (ported tokens/colors from CrawlSpace)
  lang/en.json
  packs/                         system-safe compendia (LevelDB, built from JSON source)
  packs-src/                     JSON source for compendia (git-friendly)
  tools/                         build, pack/unpack (foundryvtt-cli), import scripts
  tests/                         vitest for rules; Quench for in-Foundry integration
```

### Document types

**Actor subtypes**
- `crawler`: the player character (the current `createDefaultSheet`).
- `mob`: mobs and bosses (stat block, build budget, attacks, boss tier, floor).
- `npc`: NPC record plus an optional linked mob stat block.
- `pet`, `mount`: companions. CrawlSpace currently embeds these in the crawler. In Foundry they become their own actors, linked from the crawler, so they can have tokens.
- `vehicle` (optional, later).

**Item subtypes**
- `skill`, `spell` (ranks, rank 5/10/15 upgrades, damage formulas, mana, cooldown)
- `weapon`, `equipment` (slot: head/torso/arms/hands/legs/feet/accessory), `consumable`, `tattoo`, `loot` (misc)
- `lootBox` (sealed box with tier/type, opened via the generator)
- `race`, `class`, `background` (childhood/adolescence/career/hobby)
- `ability` (racial/class/other abilities with structured effects)
- `condition` (buffs/debuffs with ranks, stacks, durations, shields; embedded as Items that drive ActiveEffects)
- `achievement`, `deity`, `sponsor`, `trap`

**Journal page / other**
- `quest`, `neighborhood`, `location`, `tunnel_show`: custom JournalEntryPage subtypes, or plain journals with structured flags.
- `reference_table`: RollTable plus a Journal page for diagrams/text.

### How CrawlSpace's effect system maps to Foundry

CrawlSpace has its own `EffectProperty` system (37 types: `statBonus`, `skillRank`, `drModifier`, `damageResistance`, `evadeMode`, `shield`, `regenPerRound`, …). Two options:

- **A. Keep it as-is inside item system data**, and compute derived values in `prepareDerivedData()` with the ported calculation code. *Recommended for v1.* It is the most faithful, reuses the most code, and keeps the "calculation details" panel working.
- **B. Translate to Foundry ActiveEffect changes.** That works for simple numeric bonuses but not for modes, shields, minions, light orbs, rank-banded effects and similar.

Plan: **A for computation**, plus thin `ActiveEffect`s on conditions so token status icons, durations, and other modules (Dice So Nice, DAE, Token Action HUD) still see them.

---

## 4. What to reuse from `src/shared`

199 of the 210 modules don't import React. Triage:

**Copy nearly verbatim (pure rules)**
`abilityScores`, `abilityAdvancement`, `advancementCaps`, `combat` (reducer, outcomes, defenses), `combatDamage`, `damageModification`, `damageResponses`, `undoubledDamage`, `crawlerHealth`, `crawlerEvade`, `health`, `healing`, `manaRestore`, `conditions`, `conditionEffects`, `conditionShields`, `debuffs`, `effectDurations`, `effectValues`, `cooldowns`, `equipmentSlots`, `inventoryCategories`, `inventoryItems`, `spellCasting`, `explosives`, `killingBlowStacks`, `immunityTaunts`, `floorChecks`, `grinding`, `upkeep`, `partyUpkeep`, `raceClassRules`, `raceClassRanks`, `raceClassGrants`, `creatureMath`, `mobRules`, `mobAbilityTemplates`, `abilityTemplates`, `characterBuilder*`, `lootGenerator`, `lootData`, `lootNames`, `lootPotions`, `lootSpells`, `lootItemGenerator`, `crawlerAwards`, `useEffects`, `rollDamage`, `sharedAttackDamage`, `statAdjustment`.

**Adapt (they depend on the sheet shape or the app's state)**
`characterSheetModel` / `characterSheetRules` / `characterSheetData` become DataModel schemas plus `prepareDerivedData`. `actions` and `attackTargets` move onto Foundry targeting (`game.user.targets`). `encounterActions` / `gmEncounter` / `gmCrawlerDefense` move into the Combat document. `rollCards` / `inlineRolls` / `chatCommands` become ChatMessage + enrichers. `databaseTextLinks` (`[[@game-ID]]`) becomes Foundry `@UUID[...]` links plus a custom enricher.

**Drop**
Everything named `vtt*`, `scene*`, `token*` (except prototype defaults), `party*` (sync/backup), `live*`, `durableSaveQueue`, `*SaveController`, `minimap*`, `atlas*`, `pointMongo*`, `fog*`, `wall*`, `grid*`, `browser*`, `feedback*`.

**Dice engine:** replace `src/dice/engine.ts` with Foundry `Roll`, which already supports `kh`/`kl`. Keep the outcome-tier logic (Crit miss / Major miss / Miss / Hit / Amazing / Critical) in a `CrawlRoll` subclass.

**Tests:** CrawlSpace has about 230 unit test files. Port the ones for copied rules modules unchanged and run them under Vitest. They become the parity safety net.

---

## 5. Phased roadmap

Each phase ends with something playable in a test world.

### Phase 0: Scaffolding (about 1 week)
- Repo skeleton, `system.json`, Vite build into `dist/`, a symlink into the Foundry `Data/systems/crawlspace`.
- `fvtt-types`, Vitest, Prettier/oxlint configs copied from CrawlSpace.
- `foundryvtt-cli` pack/unpack scripts (JSON in git, LevelDB built).
- GitHub Actions: lint, typecheck, unit tests; a release workflow that zips and publishes the `manifest`/`download` URLs.
- **Done when:** an empty system loads in Foundry and a blank `crawler` actor can be created.

### Phase 1: Data models and the core crawler (2–3 weeks)
- `TypeDataModel` for `crawler` mirroring `createDefaultSheet` (stats, health 0–110 slot model, mana, evade, DR, move/step, AI Favor, popularity, gold, floor, level, crawler #, upkeep state, biography).
- Item DataModels: skill, spell, weapon, equipment, consumable, tattoo, ability, condition, race, class, background.
- `prepareDerivedData` ports the calculation pipeline (attributes → mods → enhanced ranks → health/mana/evade/DR/move/step) including overrides and the **calculation breakdown**.
- **Done when:** a crawler built by hand gets the same derived numbers as the same crawler in CrawlSpace. Verify with parity tests that load an exported CrawlSpace JSON.

### Phase 2: Crawler sheet (2–3 weeks)
- ApplicationV2 sheet with the CrawlSpace "alternate layout": header plus always-visible health/mana, and tabs for Character, Actions, Inventory/Gear (paper doll), Skills, Spells, Abilities, Effects, Companions, Biography/Journal, Calculations.
- Drag-and-drop from compendia/sidebar onto the sheet (skills, spells, items, races, classes).
- Equip rules: one per body slot, ten accessories, percent bonuses fixed on first equip.
- Hotlist becomes a sheet section plus hotbar macro drops.
- **Done when:** players can fully build and maintain a crawler without CrawlSpace.

### Phase 3: Rolls, actions and chat cards (2 weeks)
- `CrawlRoll`: normal/advantage(keep-high)/disadvantage(keep-low), modifier toggles dialog, temporary modifiers.
- Checks from attributes, skills, spells, Evade; attack outcome tiers; damage rolls for normal, Amazing and Critical.
- Chat cards with **Apply damage ×½ / ×1 / ×2**, **Heal**, and **Undo** buttons. Apply targets the selected or targeted tokens and goes through a GM socket relay when the player doesn't own the target.
- Spell casting with mana check and payment, ammunition spend, consumable spend, cooldowns (world-time based).
- Condition links in descriptions that can be dragged onto tokens.
- Roll visibility uses core roll modes (public/private/GM/blind).
- **Done when:** a full attack → damage → apply → undo loop works between two users.

### Phase 4: Damage, health and conditions (1–2 weeks)
- Typed resistance/vulnerability/immunity, magical shields, Physical Shield Block, armor piercing, AoE half damage.
- Health slots and the Dying rule (≤10), corpse state, token status icons.
- 27 standard debuffs plus custom conditions as `condition` items backed by ActiveEffects, with stacks, rank bands, durations, round cleanup damage, regen and mana per round.
- **Done when:** the CrawlSpace damage-modification unit tests pass and the sheet behavior matches.

### Phase 5: Mobs, NPCs and the 5-phase encounter (2–3 weeks)
- `mob` actor sheet (stat card with attacks, difficulty, damage, failed-check debuffs, abilities, build budget display).
- `CrawlCombat` subclass with the five phases: Mob Action Declaration → Crawler Reaction → Mob Actions Resolution → Crawler Action → Clean Up. Track turns per group and auto-advance when a group finishes.
- Declaration UI: the GM declares attacks against one or more crawlers. Crawlers answer with Evade / Tank / Block / Clap through chat card buttons.
- Clean Up rolls ongoing-effect damage once per round and ticks durations.
- Custom Combat Tracker sidebar rendering of phases.
- **Done when:** a whole round of DCC combat runs in Foundry with no manual bookkeeping.

### Phase 6: Upkeep, progression and companions (1–2 weeks)
- Upkeep app: Short / Long / Full Day rest, Safe Room, End Session, End Floor. Covers advancement marks, early-floor rank caps, level-ups, banked attribute points, floor advance, and the upkeep report.
- The GM can run party-wide upkeep for all player crawlers, using the socket for owners who are offline.
- Pet and mount actors linked to their crawler, with their own damage responses.

### Phase 7: Loot, awards and GM tools (2 weeks)
- Loot Box Generator app (tiers Bronze → Celestial, themed boxes, random/choose modes, potions, scroll/tome spells, gold rules, name generator). It awards directly into the actor's inventory and can save to a world compendium.
- Crawler Awards (AI Favor, popularity, achievements, sealed boxes).
- Sealed loot box items that open into the generator.
- Reference tables become RollTables plus Journals. Quests and neighborhoods become structured Journal pages.

### Phase 8: Builders (2 weeks, can run after 1.0)
- Character Builder (creation wizard with the built-in catalog).
- Race/Class builder with point budgets and rule checks.
- Mob builder with budgets and derived health/check values.

### Phase 9: Content, migration and release (ongoing)
- **CrawlSpace → Foundry importer:**
  - *Characters:* import the CrawlSpace character JSON export onto a `crawler` actor, including embedded items, conditions, and companions.
  - *Content:* a Node script reads the game/homebrew Postgres `content` table (`content_type` + JSONB `data`), converts each row to Foundry Item/Actor/Journal JSON, and writes it into `packs-src/`. One converter per `content_type` (37 types).
  - Map links: `[[@game-ID]]` → `@UUID[Compendium.crawlspace-content.<pack>.Item.<id>]`, with deterministic IDs derived from source + ID.
- Compendium packs: Skills, Spells, Items (by category), Conditions, Races, Classes, Backgrounds, Mobs, NPCs, Traps, Achievements, Reference Tables, Quests/Neighborhoods.
- Icons: reuse `crawlspace-assets/icons` (1.6 MB, confirm you own or license them).
- Localization file, README, CHANGELOG, Foundry package listing, and Patreon tie-in for the private content module.

**Rough total to a playable 1.0:** Phases 0–7, about 15–20 weeks of focused part-time work. Builders and polish come after.

---

## 6. Optional, later

- **System AI broadcasts and party timers:** a small socket-driven popup and clock. This fits DCC's flavor well and is cheap to add.
- **Dungeon Atlas / minimap generator:** a separate **module** that generates Foundry Scenes (walls, doors, lights) from the existing atlas generator code.
- **Bestiary viewer:** a compendium browser customization.
- **Token Action HUD** and **Dice So Nice** integration hooks.

---

## 7. Risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Copyrighted book content in public packs | Rules-only system; book content in a private module (§2.1) |
| Foundry API churn between major versions | Target one generation, use only V2 APIs, pin `compatibility.verified`, add Quench smoke tests |
| Effect system too rich for ActiveEffects | Keep CrawlSpace's EffectProperty model and compute in `prepareDerivedData` (§3) |
| Player-applied damage to tokens they don't own | GM-relay socket handler with a permission check |
| Rules drift between CrawlSpace and the port while both are live | Share the pure `rules/` code. Later, possibly extract it into an npm package used by both apps |
| Performance of derived data on big sheets | Cache per-prepare, avoid re-render storms (ApplicationV2 partial rendering by part) |

---

## 8. Suggested first milestone

Phases 0 and 1: scaffold the system, define the `crawler` and core item DataModels, port the calculation pipeline and its unit tests, and import one exported CrawlSpace character to prove the numbers match. That checks the riskiest assumption, that the rules code transfers cleanly, before any UI work starts.
