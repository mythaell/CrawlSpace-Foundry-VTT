# Prompt for Codex: continue the CrawlSpace → Foundry VTT port

You are taking over an in-progress port of **CrawlSpace**, a React/Express web app for playing a Dungeon Crawler Carl–style tabletop RPG, into a **Foundry VTT V14 game system**. Read this whole prompt before touching code. It covers what the project is, what is already done, what is left, and how the work must be done. Match the existing code so closely that a reader cannot tell which parts you wrote.

---

## 1. The two repositories

| | Path | Role |
| --- | --- | --- |
| **Source** | `C:\1. Eric's Files\Apps\Dungeon Crawler Carl RPG` | The CrawlSpace app. **Read-only reference.** Never edit it. |
| **Target** | `C:\1. Eric's Files\Apps\CrawlSpace Foundry VTT` | The Foundry system (`id: crawlspace`). All work happens here, on branch `feat/initial-system`. |

The rules you port live mostly in the source app's `src/shared/` folder: 214 pure TS modules such as `combatDamage.ts`, `conditionShields.ts`, `upkeep.ts`, `lootGenerator.ts`, `crawlerAwards.ts`, `cooldowns.ts`, `minions.ts`, `characterBuilder*.ts`. The React components in `src/components/` are **layout and behavior references only**, never code to reuse.

`PORT_PLAN.md` in the target repo is the original plan. Its "Status: Plan only" line and some details are out of date, so section 3 below supersedes it where they differ. `README.md` has setup commands and a short "How CrawlSpace maps onto Foundry" section.

---

## 2. The prime directive

> **Don't rebuild anything Foundry already does the same way. If Foundry does it slightly differently, adapt CrawlSpace to Foundry's way. If Foundry does it significantly differently, stop and ask the user first.**

That one rule is behind almost every design decision in this repo. In practice:

- **Use core for:**
  - Users, permissions, document sync and the socket.
  - Canvas, tokens and targeting (`game.user.targets`).
  - ChatMessage, Roll (`kh`/`kl` for advantage), the hotbar, Macros, compendia, Journal, RollTable.
  - ActiveEffect durations, expiry and status icons.
  - `CONFIG.time.roundTime`, world time, and the core Combat document.
- **Adapt CrawlSpace to core:**
  - CrawlSpace "buffs/debuffs/effect properties" became **ActiveEffects**. Simple bonuses use core `add` changes on `system.*` paths; anything else uses a registered `crawlspace.*` change type.
  - CrawlSpace durations became V14 native `duration: {value, units: 'rounds'|'seconds', expiry}`, and core expires them.
  - The 5-phase combat is a **subclass** of core Combat with a phase strip added to core's tracker. It does not replace the tracker.
  - Chat cards are normal ChatMessages with flags plus delegated button handlers.
- **Drop:** everything platform-ish in the source, such as accounts, Express, Postgres sync, the live command engine, scene/fog/walls, R2 storage, minimap, atlas and Point Mongo.

When you're unsure whether something counts as "significantly different", ask.

---

## 3. What is already done

Eight commits on `feat/initial-system`; the newest is `bdc4ed0`. About 6,500 lines of TS, plus templates and CSS. The sections below list everything in place.

### Build and tooling
- TypeScript + Vite library build: `src/crawlspace.ts` → `dist/crawlspace.mjs`. `tsconfig` is strict, with `noImplicitAny: false`. Foundry globals are typed loosely in `src/globals.d.ts`.
- npm scripts:
  - `npm run build`, `watch`, `typecheck`.
  - `npm test`: `node --test tests/*.test.mjs`, which imports `.ts` directly.
  - `npm run packs`: homebrew packs plus the content module.
  - `npm run link`: junction into Foundry's Data folder.
- Pack sources:
  - Homebrew packs come from `packs-src/` JSON, built to LevelDB in `packs/`.
  - The **book-content module** `crawlspace-content` is built into `build/` from CrawlSpace's Postgres. It is never committed, for licensing reasons.

### Data models (`src/data/`)
- **Actors:** `crawler`, `mob`, `npc`.
- **Items:** `skill`, `spell`, `weapon`, `equipment`, `consumable`, `tattoo`, `loot`, `lootBox`, `ability`, `race`, `class`, `background`, `achievement`, `trap`.
- `prepareDerivedData` ports the CrawlSpace calculation pipeline: stats → mods, ranks, health slots (0–110 in 10% bands), mana, evade, DR, move/step, and actions (`2 + extra`).
- An ActiveEffect base data model (`data/effect.ts`) adds CrawlSpace condition fields: `conditionType`, `stacks`, `cleanup`, `shield {nonMagic…}`, and `durationText`.

### Effects (`src/effects/`)
- **`mapping.ts`:** a pure CrawlSpace `EffectProperty` → ActiveEffect change mapper. The Node pack builders use it too.
- **`change-types.ts`:** the registered `crawlspace.*` change types:
  - `skillRank`, `spellRank`, `baseSkillRank`, `baseSpellRank`, `healthBonus`, percent bonuses, roll modes.
  - `special`: collects non-numeric rules into `actor.system.specials` as `{type, source, …data, itemId, effectId, stacks}`.
- **`specials.ts`:** readers for those specials.
  - `damageBonuses` (supports `RANK` / `RANK_DIE` and stacks), `piercesArmor`, `capsMagicDamage`, `halvesAreaDamage`.
  - Regen: `regenAmount`, `hasRegen`, `regenAdvance`, with interval and fast-interval support.
- **`rules.ts`:** a PF2e-style "Rules" editor (typed rule rows plus a JSON fallback). Every item sheet's Effects tab and the effect sheet use it.
- When an effect applies:
  - Item effects apply while the item is held.
  - Weapons, equipment and tattoos apply only when equipped.
  - Rank-gated effects apply from their rank on.
- The 27 standard debuffs replace core `CONFIG.statusEffects` (icons are in `assets/debuffs/`); core's "dead" is kept. Stacks, Clean Up damage, check penalties and immunities follow CrawlSpace's rules.

### Rules (`src/rules/`, pure)
- **`core.ts`:**
  - Ability-modifier bands, attack outcome tiers (Crit miss / Major miss / Miss / Hit / Amazing / Critical) and dice doubling.
  - `resolveFormulaTokens`: `STR MOD`, `F`, `RANK`, `RANK_DIE`.
  - Typed damage modification, condition shields (`nonMagic`), the magic damage cap and Dying.
- **`debuffs.ts`:** the 27 debuffs.
- **`upkeep.ts`:** recovery and advancement.
- **`shield-block.ts`:**
  - Shield Block needs a skill named "Shield Block" plus an equipped equipment item with `isShield`.
  - It halves the damage, and from Rank 15 also subtracts the STR modifier.
  - It can't be used against area damage. Non-physical damage needs Rank 5.

### Documents
- **`documents/actor.ts`:**
  - `applyDamage` runs resistances, armor piercing, area halving, the magic cap, condition shields, Shield Block and DR, then writes health slots.
  - Also `applyHealing`, `restoreHealth` (Undo), `addDebuff`, `conditionShields()`, and `regenerate(seconds)`.
- **`documents/item.ts`, `use()`:**
  - Skill/spell checks; attack skills and spells; heal spells and skills rolled at the current Rank.
  - Drain-style attack+heal.
  - Mana payment and the Muted check.
  - Weapons attack through the crawler's saved Attacks rows.
  - Consumables: spend one, mana restore (the percent rounds up), healing roll, and non-transfer effects copied onto the user (potion buffs with durations).
  - `_preUpdate` enforces one item per body slot and 10 accessories.
- **`actors/attacks.ts`:** Attacks rows (weapon + skill + overrides), `withEffectBonuses`, `resolveAttack`.
- **`actors/inherent.ts`:** inherent spells, looked up by name in the world and then in compendia, cast at the granted Rank with no mana.

### Dice and chat
- **`dice/rolls.ts`:**
  - `rollCheck`, `rollAttack`, `rollDamage`, using core `Roll`.
  - Roll-mode and modifier dialog; debuff penalty modifiers; the incoming attack mode can cancel advantage.
  - Damage tiers: normal, Amazing, Critical.
  - Card flags: `kind`, `targets`, `types`, `area`, `magic`, `magicBase`, `damageKind`, `blocked`, `subtitle`, `img`.
- **`chat/cards.ts` + `templates/chat/*`:**
  - Every card has a header with image, title, subtitle, mode/tier and tags.
  - `card-footer.hbs` is rendered under the roll:
    - Attack cards show target outcomes and the damage-tier buttons.
    - Damage and heal cards show one `.apply-row` per target plus a "Selected tokens" row, with ½ / Apply / ×2 / Block toggle / Heal buttons and Undo.
  - Buttons use `data-crawl-action`, handled by **one delegated listener** in `renderChatMessageHTML`. Old cards keep their old markup.
- **`socket.ts`:** a GM relay with a whitelist (`applyDamage`, `applyHealing`, `restoreHealth`, `addDebuff`, combat `markDone`, `respondToDeclaration`, `recordDeclarationDamage`). Players can apply damage to tokens they don't own.

### Combat (`src/combat/`)
- `CrawlCombat` steps through the five phases: Mob Declaration → Crawler Reaction → Mob Resolution → Crawler Action → Clean Up.
- The `autoAdvancePhase` world setting turns automatic phase advancing on and off.
- Declarations:
  - The `dialogs/declare.hbs` dialog posts a declaration card.
  - Crawlers answer with **Evade / Block / Tank** buttons.
  - Block rolls Shield Block against the to-hit. A success still counts as a hit, but the damage card's Block toggle starts on.
- `rollDeclarationDamage` rolls the declared damage for the targets that were hit.
- Clean Up applies debuff cleanup damage. The `cleanUp` expiry event is registered.
- `tracker.ts` subclasses core's CombatTracker and adds a `phases` PART.

### Sheets (`src/sheets/`, ApplicationV2 + HandlebarsApplicationMixin)
- **Crawler sheet:** a CrawlSpace HUD look (Quantico font, bevelled panels).
  - Left sidebar: mana, Shield/Conditions, Evade/DR/Shield badges, immunities/vulnerabilities/resistances, AI favor, popularity, move/step/actions, Upkeep.
  - Header: name, floor, level and Level up, the health-slot and shield tracks, and the XP bar.
  - Icon tab strip: Character, Actions/Attacks, Inventory, Skills, Spells, Abilities, Effects, Biography.
  - Filter bars: search, categories, subtypes centered under them, and stat/check filters.
- **Mob and NPC sheets:** PF2e-style layouts.
- **Item sheet:** header, summary, description, details (area, healing fieldset, shield, …) and Rules/Effects tab (identifiers on top, effects below).
- **Effect sheet:** shares the same rules editor.
- **Attack row config popup:** `apps/row-config.ts`, keyed by actor UUID and row id.
- Hotbar drop makes an item macro that calls `item.use()`.

### Apps, import and content
- **`apps/upkeep.ts`:** Short/Long/Full rest, Safe Room, advancement checks, stat point assignment, and a chat report.
- **`import/convert.ts`:** pure converters for CrawlSpace DB rows and character backups into Foundry data.
  - `stableId(seed)` gives deterministic 16-character ids.
  - It handles healing fields, area, effect durations, use-effect conditions and mana restore.
  - The Actors sidebar has an **Import CrawlSpace character** button.
- **`import/fill-damage.ts`:** back-fills damage and healing data on existing world actors (`game.crawlspace.fillActorDamage`).

### Known gaps in what's done
- `rankCap` is mapped but not enforced.
- Existing world actors only pick up new item data after Fill Damage or after re-dragging the item.

---

## 4. What is left

The list is ordered roughly from easiest to hardest. Each item names the source module to read first.

**Easy: pure rules plus a little UI. Port these first.**
1. **Cooldowns.** Source: `src/shared/cooldowns.ts`. Track them in world time or rounds on the item (`system.cooldown`, which already exists in data and mapping), show them on the Actions tab, and block `use()` while one is running.
2. **Blade Clap defense.** Source: `src/shared/combat*` and `gmCrawlerDefense`. Add it as a fourth `DefenseKind`, following the Shield Block pattern exactly: rule module in `src/rules/`, then `defendDeclaration`, `respondToDeclaration` and the declaration template.
3. **Enforce `rankCap`.** Sources: `advancementCaps.ts`, `raceClassRanks.ts`. Clamp ranks in `prepareDerivedData`; the effect already carries the cap.
4. **Killing-blow stacks, immunity taunts, explosives, floor checks, grinding.** Sources: `killingBlowStacks.ts`, `immunityTaunts.ts`, `explosives.ts`, `floorChecks.ts`, `grinding.ts`. These are small pure modules: hook each into `applyDamage`, the upkeep app or item use as the source does.
5. **End Session / End Floor upkeep options.** Source: `upkeep.ts` and `partyUpkeep.ts`. Also add party-wide upkeep for the GM, routed through the socket relay.
6. **Crawler Awards.** Source: `crawlerAwards.ts`. Build a small ApplicationV2 dialog that awards AI Favor, popularity, achievements (achievement items) and sealed loot boxes.

**Medium**
7. **Loot Box Generator.** Sources: `lootGenerator.ts`, `lootData.ts`, `lootNames.ts`, `lootPotions.ts`, `lootSpells.ts`, `lootSpellTiers.json`, `lootItemGenerator.ts`, `sealedLootBoxes.ts`, `preparedLootBoxes.ts`. Copy the pure modules into `src/rules/loot/` and build an ApplicationV2 app that creates items on the actor. Opening a `lootBox` item launches it.
8. **Minions and light orbs.** Source: `minions.ts`. Today these exist only as specials, so make them visible on the sheet and usable. If a minion needs a token, it should become an actor; **ask first**, because that is a "significantly different" decision.
9. **Reference tables → RollTables plus Journals** in the content module builder (`tools/build-content-module.mjs`), and `[[@game-ID]]` text links → `@UUID[...]` through a custom enricher.
10. **Pets and mounts as their own actor types,** linked from the crawler. `convert.ts` already reads them from backups. Adding actor types changes `system.json`, so ask first.

**Hard. These come later, and you should ask before starting any of them.**
11. Character Builder wizard (`characterBuilder*.ts`).
12. Race/Class builder with point budgets (`raceClassRules.ts`, `raceClassGrants.ts`).
13. Mob builder (`creatureMath.ts`, `mobRules.ts`, `mobAbilityTemplates.ts`).
14. Quests and neighborhoods as Journal page subtypes; System AI broadcasts and party timers (`partyTimers.ts`).

**Never port:** anything `vtt*`, `scene*`, `token*`, `party*` sync, `live*`, `minimap*`, `atlas*`, `pointMongo*`, `fog*`, `wall*`, `grid*`, auth or storage.

---

## 5. How to work

### Process
1. **Read the source first.** Find the exact CrawlSpace module and the component that uses it, and match its numbers and edge cases. Put the source location in the docstring, for example `/** Shield Block (rollDamage.ts / combat.ts): … */` or `// manaRestore.ts manaRestorePoints: a share of max mana rounds up`.
2. **Check what Foundry already provides** (the prime directive above). The Foundry install is at `C:\Program Files\Foundry Virtual Tabletop\resources\app`, and you can grep `public/scripts/foundry.mjs` for real V14 APIs. Never guess an API; V14 differs from V11–V13. For example, effect changes live in `effect.system.changes`, sheets use `foundry.applications.api.*`, and `renderTemplate` is `foundry.applications.handlebars.renderTemplate`.
3. **Implement in small layers:**
   - a pure rule in `src/rules/` (no Foundry globals, unit-testable);
   - then the document method;
   - then the sheet, chat or template;
   - then the `lang/en.json` keys;
   - then the CSS.
4. **Verify it in a real Foundry, not just with a build.** See "Testing" below.
5. **Commit** with a short imperative subject (see the log, e.g. "Rework chat cards; add Shield Block") and a body when it helps. End every commit message with
   `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`
   — or your own equivalent attribution line if the user prefers.
6. **Never push or open a PR unless the user asks.** "Test first" is a standing rule.

### Testing
- **Pure rules:** add `node:test` cases to `tests/rules.test.mjs`, importing `.ts` directly, then run `npm test` and `npm run typecheck`.
- **The user's Foundry runs on port 30000. Never stop it, restart it, or touch its world.** Its LevelDB locks also stop `npm run packs` from running; if a pack rebuild fails with EPERM, ask the user to close Foundry instead of forcing it.
- **Run a separate scratch Foundry for live checks:**
  ```
  cd "C:\Program Files\Foundry Virtual Tabletop\resources\app"
  node main.mjs --port=30001 --noupnp --world=crawlspace-dev --dataPath="<your scratch fvtt data dir>"
  ```
  - Use a copy of the user's data, with the system linked to the repo.
  - Run the server in the background and stop it when you're done.
  - Log in through `/join` as the Gamemaster.
  - After `npm run build`, reload the page (CSS and templates are served straight from the repo).
- **Drive it through the browser console** (`game.actors.getName(...)`, `item.use()`, `ChatMessage.create`, `sheet.render(true)`).
  - Check computed styles and bounding boxes for CSS work.
  - Take a screenshot before calling a visual change done.
  - Delete any test messages or documents you create.
- **CSS specificity trap:** a generic rule, `.application.crawlspace .window-content :is(input[type=text]…)`, sets inputs to 30px tall with 12px text, and Foundry's `*` rule sets `scrollbar-color` from `--color-scrollbar`. When a style "doesn't apply", inspect which rule actually wins. Fix it by matching the more specific rule or by setting Foundry's own variables, never with `!important`.

### Code style (match it exactly)
- **TS formatting:**
  - No semicolons, single quotes, 2-space indent.
  - Long lines are fine (up to about 150 characters); trailing commas in multi-line literals.
  - `async`/`await` throughout.
- **Types:** use `any` for Foundry documents; the codebase types Foundry loosely on purpose. Export small named `type`s for your own shapes (`AttackDamage`, `CheckOptions`).
- **Pure and Foundry modules:**
  - Modules shared with Node (`rules/`, `effects/mapping.ts`, `import/convert.ts`, `config.ts`) use **no Foundry globals** and import with explicit `.ts` extensions.
  - Foundry-side modules use bare imports.
- **Naming:**
  - Handlebars helpers are prefixed `crawl` (`crawlSigned`, `crawlJoin`, `crawlLower`).
  - Localization keys are `CRAWLSPACE.Section.Key`. Every user-facing string goes in `lang/en.json`; look for an existing key before adding one, because the JSON must have no duplicate keys.
  - Chat buttons use `data-crawl-action="kebab-case"`. Sheet buttons use ApplicationV2 `data-action` with static `#onX` handlers registered in `DEFAULT_OPTIONS.actions`.
  - Flags go under `flags.crawlspace.*`; settings under `game.settings.register('crawlspace', …)`.
- **Templates:**
  - Templates live under `templates/<area>/`. Partials are added to the `TEMPLATES` list in `crawlspace.ts` **by relative name** (`'chat/card-footer'`).
  - Templates have a one-line `{{!-- comment --}}` header saying what context they expect.
- **CSS:** everything goes in `styles/crawlspace.css` under `@layer system`, scoped to `.crawlspace`, `.application.crawlspace` or `.crawl-card`. Use the existing tokens (`--hud-cyan`, `--dcc-blue-light`, `--btn-bg`, `--crawl-border`, `--crawl-muted`, …); don't invent new colors when a token exists.
- **Comments:**
  - Explain **why** or which rule a piece of code implements, never what the next line does.
  - Every module and exported function gets a short docstring, and a pure module says so ("Pure module: …").
  - Keep comments as short as the existing ones.
- **Scope:**
  - Keep changes minimal and local: no drive-by refactors and no new dependencies.
  - Delete dead code your change creates; for example, removing the paper doll also removed its `context.paperDoll` builder.
- **Data changes:**
  - If a change affects pack data, update `convert.ts` and rebuild the packs (`npm run packs`, with Foundry closed).
  - Remember that world actors keep their old embedded copies.
- **Compatibility:**
  - Don't break existing chat messages. Old cards must still render, so detect the old markup and leave it alone (see `registerChatHandlers`).
  - Socket-relayed methods must be added to the whitelist in `socket.ts`.

### Shell gotchas on this machine (Windows, Git Bash and PowerShell)
- Don't write regex-heavy code through Bash heredocs: `\b`, `\d` and `\.` get mangled. Use a file-writing tool or a small Python script instead.
- Never put `cat > file` in front of a heredoc driving another command; it hangs.
- Paths contain spaces and a period (`C:\1. Eric's Files\…`), so always quote them.

### Communicating with the user
- The user plays and tests the game; they describe things visually, often with screenshots and red boxes. Restate briefly what you'll change, make the change, verify it live, then report in plain language: what changed, how you checked it, and what wasn't done.
- Ask before:
  - anything "significantly different" from Foundry's way;
  - adding document types;
  - deleting user data;
  - pushing.
- Otherwise, act.
- If something you were asked to do turns out to be already done or impossible, say so plainly.

---

## 6. Your first task

Run the following and confirm the build is clean:

```
git log --oneline
npm install
npm run build
npm run typecheck
npm test
```

Then read `src/crawlspace.ts`, `src/documents/actor.ts`, `src/documents/item.ts`, `src/chat/cards.ts`, `src/combat/combat.ts` and `src/rules/shield-block.ts`. They are the clearest examples of the patterns above.

After that, wait for the user's instructions. If they ask what to do next, propose item 1 from the "Easy" list (Cooldowns).
