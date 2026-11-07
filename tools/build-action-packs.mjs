/**
 * The Actions and Interrupt Actions packs: common combat actions a crawler can drop onto their actions tables.
 * Written here (not read from a database) → packs-src/<pack>/*.json (committed) → packs/<pack> (LevelDB).
 *
 *   npm run packs:actions
 */
import path from 'node:path'
import { ROOT, compile, keyify, stamp, writeSource } from './lib.mjs'
import { stableId } from '../src/import/convert.ts'
import fs from 'node:fs'

const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8')).version

/** behavior: what using it does (see src/apps/actions-config.ts runAction); skills: preferred skills for its check. */
const ACTIONS = {
  actions: [
    {
      name: 'Make a Check',
      img: 'icons/svg/d20-black.svg',
      behavior: 'check',
      text: 'Roll a Skill or stat check for something you attempt this turn. Pick the Skill or stat when you use it.',
    },
    {
      name: 'Look for Clues',
      img: 'icons/svg/eye.svg',
      behavior: 'check',
      skills: 'Perception, Investigation',
      text: 'Study a foe (usually a Boss) for something the party can use against it. Roll Perception, Investigation or a fitting Skill.',
    },
    {
      name: 'Move',
      img: 'icons/svg/walk.svg',
      behavior: 'move',
      text: 'Travel up to your Move plus your Step.',
    },
    {
      name: 'Retrieve',
      img: 'icons/svg/item-bag.svg',
      text: 'Take an item from your inventory or the world: into your hand, onto the ground, or onto your Hotlist.',
    },
    {
      name: 'Use Hotlist Item',
      img: 'icons/svg/chest.svg',
      behavior: 'hotlist',
      text: 'Use a potion, scroll, tool or other item on your Hotlist. Pick the item when you use it.',
    },
  ],
  'interrupt-actions': [
    {
      name: 'Evade',
      img: 'icons/svg/wingfoot.svg',
      behavior: 'evade',
      text: 'Roll an Evade check against an attack aimed at you. Each attack this round gets its own Evade check.',
    },
    {
      name: 'Intervene',
      img: 'icons/svg/angel.svg',
      formula: '1d6',
      text: 'Roll 1d6 and add it to a party member’s d20 roll, after it is known whether that roll succeeded.',
    },
    {
      name: 'Catcher',
      img: 'icons/svg/shield.svg',
      behavior: 'check',
      skills: 'Catcher',
      text: 'Step in and take a hit meant for another party member. You can’t Evade the damage you catch.',
    },
    {
      name: 'Taunt',
      img: 'icons/svg/terror.svg',
      behavior: 'check',
      skills: 'Taunt',
      text: 'Try to pull attacks announced against your allies onto yourself instead. You may still Evade them.',
    },
    {
      name: 'Use Hotlist Item (Healing)',
      img: 'icons/svg/heal.svg',
      behavior: 'hotlistHealing',
      text: 'Use a healing item, healing scroll or healing spell from your Hotlist. Only healing items can be used as an Interrupt.',
    },
  ],
}

const SRC = path.join(ROOT, 'packs-src')
const OUT = path.join(ROOT, 'packs')
// Only these two packs are rebuilt, so only they need to be closed.
for (const pack of Object.keys(ACTIONS)) {
  const dir = path.join(OUT, pack)
  if (!fs.existsSync(dir)) continue
  try {
    fs.renameSync(dir, `${dir}.closed-check`)
    fs.renameSync(`${dir}.closed-check`, dir)
  } catch {
    throw new Error(`Foundry has the ${pack} pack open. Close Foundry (or the world using it) and run this again. Nothing was changed.`)
  }
}
for (const [pack, entries] of Object.entries(ACTIONS)) {
  const kind = pack === 'actions' ? 'action' : 'interrupt'
  const docs = entries.map((entry, index) =>
    keyify(
      stamp({
        _id: stableId(`crawlspace-actions/${pack}/${entry.name}`),
        name: entry.name,
        type: 'action',
        img: entry.img,
        sort: (index + 1) * 100,
        system: {
          description: `<p>${entry.text}</p>`,
          notes: '',
          source: { database: '', id: null, book: '', pages: '' },
          kind,
          behavior: entry.behavior ?? '',
          skills: entry.skills ?? '',
          formula: entry.formula ?? '',
        },
        effects: [],
        folder: null,
        flags: {},
      }, version),
      'items',
    ),
  )
  writeSource(path.join(SRC, pack), docs)
  await compile(path.join(SRC, pack), path.join(OUT, pack))
  console.log(`${pack}: ${docs.length} actions`)
}
