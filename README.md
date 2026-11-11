# CrawlSpace for Foundry VTT

A game system for **Foundry Virtual Tabletop V14** that plays CrawlSpace. It covers:

- health and shield slots;
- ranked skills and spells;
- typed damage with resistances;
- stacking debuffs;
- five-phase Mob/Crawler combat.

It also has the CrawlSpace app's party tools: crawler frames, upkeep and advancement, time and countdowns, grinding, awards, loot boxes and a character builder.

**Documentation is in the [wiki](https://github.com/mythaell/CrawlSpace-Foundry-VTT/wiki).**

## Install

In Foundry's setup screen:

1. Open **Game Systems** and choose **Install System**.
2. Paste this manifest URL and click **Install**:

```
https://github.com/mythaell/CrawlSpace-Foundry-VTT/releases/latest/download/system.json
```

Foundry checks the same URL for updates. Hosts that install systems from a manifest URL (Forge, Molten and others) work the same way. See [Installing](https://github.com/mythaell/CrawlSpace-Foundry-VTT/wiki/Installing).

The system ships with homebrew skills, spells and items, plus Actions and Interrupt Actions compendiums. Published book content is not included. Import your own from the CrawlSpace app instead: see [Importing from CrawlSpace](https://github.com/mythaell/CrawlSpace-Foundry-VTT/wiki/Importing-from-CrawlSpace).

## Features

- **Crawler sheet:**
  - health slots, shield slots and mana;
  - enhanced stats;
  - skills and spells with rank caps, cooldowns and advancement marks;
  - an Attacks table built from weapons, unarmed skills and attack spells;
  - hotlist, Actions and Interrupt Actions;
  - a paper doll for equipment;
  - pets, mounts and minions.
- **Mob, boss and NPC sheets:** stat budgets, attacks with areas and on-hit debuffs, and NPCs that borrow a mob's stat block.
- **Combat:** Foundry's tracker stepping through Mob Declaration, Crawler Reaction, Mob Resolution, Crawler Action and Clean Up. Mobs declare attacks; crawlers answer with Evade, Tank, Shield Block or Blade Clap.
- **Damage:** chat-card Apply, Heal and Undo. Damage passes through shields, Shield Block, DR, resistances and immunities.
- **Effects:** Active Effects edited through rule elements:
  - stat, rank, health, mana and DR bonuses;
  - resistances and immunities;
  - advantage and disadvantage;
  - triggers on hits, misses, crits and Clean Up;
  - auras, light and raised minions.
- **GM tools:**
  - party membership and crawler frames;
  - Party Upkeep (rests, safe-room, session and floor advancement, level up, stat points);
  - Time & Timers with the floor-collapse countdown;
  - grinding;
  - Crawler Awards;
  - loot boxes, auto-loot and the item generator;
  - grid calibration from a printed map.
- **Import:** CrawlSpace character, party and account exports. Importing again updates what was imported before.
- **Macros:** drag items, attacks and actions to the hotbar, or script with `game.crawlspace`.

## Development

```bash
npm install
npm run build
npm test
```

See [Development](https://github.com/mythaell/CrawlSpace-Foundry-VTT/wiki/Development) for packs, linking into Foundry, and releasing.

## License

The code is under the [MIT License](LICENSE). The Quantico fonts are under the SIL Open Font License ([assets/fonts/OFL.txt](assets/fonts/OFL.txt)).
