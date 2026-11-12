import { test } from 'node:test'
import assert from 'node:assert/strict'
import { iconFor } from '../src/import/icons.ts'
import { ICON_SETS } from '../src/import/icon-sets.ts'
import { convertRow, inventoryToItem } from '../src/import/convert.ts'

test('skills, spells and items get a core icon that fits their name', () => {
  assert.equal(iconFor('skill', 'Handgun'), 'icons/weapons/guns/gun-pistol-flintlock-metal.webp')
  assert.equal(iconFor('skill', 'Lockpicking'), 'icons/tools/hand/lockpicks-steel-grey.webp')
  assert.equal(iconFor('spell', 'Fireball'), 'icons/magic/fire/projectile-fireball-orange.webp')
  assert.equal(iconFor('spell', 'Heal Others'), 'icons/magic/life/heart-cross-blue.webp')
  assert.equal(iconFor('consumable', 'Good Healing Potion'), 'icons/consumables/potions/bottle-round-corked-red.webp')
  assert.equal(iconFor('consumable', 'Mana Potion'), 'icons/consumables/potions/bottle-round-corked-blue.webp')
  assert.equal(iconFor('weapon', 'Crossbow'), 'icons/weapons/crossbows/crossbow-simple-brown.webp')
})

test('spell rules come before weapon words, and item rules only apply to items', () => {
  // "Shield" is a spell here, not the Shield Block skill's icon.
  assert.match(iconFor('spell', 'Shield'), /^icons\/magic\/defensive\//)
  // A skill named after a potion word keeps the skill rules.
  assert.equal(iconFor('skill', 'Alchemy'), 'icons/tools/laboratory/alembic-glass-ball-blue.webp')
  // Word boundaries: a vegetable cart is a cart, not a table; leggings are not eggs.
  assert.equal(iconFor('loot', 'Vegetable Cart'), 'icons/environment/vehicles/minecart-coal.webp')
  assert.match(iconFor('equipment', 'Leggings of Doom', { slot: 'legs' }), /^icons\/equipment\/leg\/pants-/)
})

test('unmatched entries fall back by slot, weapon kind and type, stably', () => {
  const ring = iconFor('equipment', 'Zzyzx', { slot: 'accessory' })
  assert.match(ring, /^icons\/equipment\/neck\//)
  assert.equal(iconFor('equipment', 'Zzyzx', { slot: 'accessory' }), ring, 'same name, same icon')
  assert.match(iconFor('equipment', 'Zzyzx', { slot: 'feet' }), /^icons\/equipment\/feet\//)
  assert.match(iconFor('weapon', 'Zzyzx', { weaponType: 'ranged' }), /^icons\/weapons\/bows\//)
  assert.match(iconFor('loot', 'Zzyzx'), /^icons\/containers\/bags\//)
  assert.equal(iconFor('skill', 'Zzyzx'), null, 'the caller keeps its default')
})

test('every folder a rule names has generated icons', () => {
  for (const [folder, names] of Object.entries(ICON_SETS)) assert.ok(names.length, folder)
  assert.ok(Object.keys(ICON_SETS).length > 40)
})

test('the converter uses the icons, and an explicit icon still wins', () => {
  assert.equal(inventoryToItem({ name: 'Stick of Dynamite', properties: {} }, 'consumable').img, 'icons/weapons/ammunition/explosive-dynamite.webp')
  assert.equal(inventoryToItem({ name: 'Stick of Dynamite', properties: { icon: 'my/icon.png' } }, 'consumable').img, 'my/icon.png')
  const skill = convertRow({ id: 1, content_type: 'skill', name: 'Bow', data: { name: 'Bow' } }, 'homebrew')
  assert.equal(skill.data.img, 'icons/weapons/bows/shortbow-recurve-red.webp')
})
