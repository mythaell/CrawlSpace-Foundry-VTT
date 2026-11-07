import { test } from 'node:test'
import assert from 'node:assert/strict'
import { heldItems, planEquip } from '../src/rules/hands.ts'
import { moveInOrder, orderRows } from '../src/rules/row-order.ts'
import { damageResponsesFromText } from '../src/rules/build-text.ts'

const sword = { id: 'sword', twoHanded: false, shield: false }
const dagger = { id: 'dagger', twoHanded: false, shield: false }
const axe = { id: 'axe', twoHanded: true, shield: false }
const shield = { id: 'shield', twoHanded: false, shield: true }
const held = (...entries) => entries.map(([item, hand]) => ({ ...item, hand }))

test('a one-handed weapon fills the main hand, then the off hand', () => {
  assert.deepEqual(planEquip([], sword), { hand: 'main', unequip: [], move: [] })
  assert.deepEqual(planEquip(held([sword, 'main']), dagger), { hand: 'off', unequip: [], move: [] })
  // Both hands full: the off hand is swapped out.
  assert.deepEqual(planEquip(held([sword, 'main'], [dagger, 'off']), { id: 'club', twoHanded: false, shield: false }), { hand: 'off', unequip: ['dagger'], move: [] })
})

test('a shield always goes in the off hand', () => {
  assert.deepEqual(planEquip(held([sword, 'main']), shield), { hand: 'off', unequip: [], move: [] })
  // A one-handed weapon in the off hand moves to the empty main hand.
  assert.deepEqual(planEquip(held([dagger, 'off']), shield), { hand: 'off', unequip: [], move: [{ id: 'dagger', hand: 'main' }] })
})

test('a two-handed weapon takes both hands', () => {
  assert.deepEqual(planEquip(held([sword, 'main'], [shield, 'off']), axe), { hand: 'main', unequip: ['sword', 'shield'], move: [] })
  // Equipping a one-handed weapon or a shield replaces the two-handed one.
  assert.deepEqual(planEquip(held([axe, 'main']), sword), { hand: 'main', unequip: ['axe'], move: [] })
  assert.deepEqual(planEquip(held([axe, 'main']), shield), { hand: 'off', unequip: ['axe'], move: [] })
})

test('dropping on a hand slot puts the weapon there', () => {
  assert.deepEqual(planEquip(held([sword, 'main']), dagger, 'main'), { hand: 'main', unequip: ['sword'], move: [] })
  assert.deepEqual(planEquip([], dagger, 'off'), { hand: 'off', unequip: [], move: [] })
})

test('held items without a saved hand get one in order (shields first, more than two left out)', () => {
  const items = [
    { id: 'a', type: 'weapon', system: { equipped: true, hand: '', twoHanded: false, weaponType: 'melee' } },
    { id: 'b', type: 'weapon', system: { equipped: true, hand: '', twoHanded: false, weaponType: 'melee' } },
    { id: 'arrows', type: 'weapon', system: { equipped: true, hand: '', weaponType: 'ammunition' } },
    { id: 'c', type: 'equipment', system: { equipped: true, isShield: true, hand: '' } },
    { id: 'hat', type: 'equipment', system: { equipped: true, slot: 'head' } },
  ]
  assert.deepEqual(
    heldItems(items).map((entry) => [entry.id, entry.hand]),
    [['c', 'off'], ['a', 'main']],
  )
})

test('rows follow a saved order; new rows keep their place at the end', () => {
  const rows = ['a', 'b', 'c', 'd'].map((id) => ({ id }))
  assert.deepEqual(orderRows(rows, ['c', 'a']).map((row) => row.id), ['c', 'a', 'b', 'd'])
  assert.deepEqual(orderRows(rows, []).map((row) => row.id), ['a', 'b', 'c', 'd'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c', 'd'], 'd', 'b'), ['a', 'd', 'b', 'c'])
  assert.deepEqual(moveInOrder(['a', 'b', 'c', 'd'], 'a', 'c'), ['b', 'c', 'a', 'd'])
  assert.deepEqual(moveInOrder(['a', 'b'], 'a', 'a'), ['a', 'b'])
})

test('damage responses read from race and class text', () => {
  assert.deepEqual(damageResponsesFromText('Immunity to Poison'), [{ type: 'damageImmunity', target: 'Poison' }])
  assert.deepEqual(damageResponsesFromText('Resistance to Ice damage'), [{ type: 'damageResistance', target: 'Ice' }])
  assert.deepEqual(damageResponsesFromText('Vulnerable to Holy damage'), [{ type: 'damageVulnerability', target: 'Holy' }])
  assert.deepEqual(damageResponsesFromText('Immunity to Fire damage, and vulnerable to Ice damage'), [
    { type: 'damageImmunity', target: 'Fire' },
    { type: 'damageVulnerability', target: 'Ice' },
  ])
  assert.deepEqual(damageResponsesFromText('Immunity to Poison and all diseases'), [{ type: 'damageImmunity', target: 'Poison' }])
  assert.deepEqual(damageResponsesFromText('Fire and Acid Resistance'), [
    { type: 'damageResistance', target: 'Fire' },
    { type: 'damageResistance', target: 'Acid' },
  ])
  // Not a damage type, or not a damage response.
  assert.deepEqual(damageResponsesFromText('Vulnerability: Take double damage from Dogs and Beasts'), [])
  assert.deepEqual(damageResponsesFromText('Advantage on Checks to resist hunger and thirst'), [])
})
