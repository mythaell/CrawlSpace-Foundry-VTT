import { test } from 'node:test'
import assert from 'node:assert/strict'
import { advancementPick, automaticAttackItems } from '../src/rules/damage-effects.ts'
import { actionKinds, hotlistActions, hotlistSlots, placeInSlot, spentConsumable, withoutSource } from '../src/rules/hotlist.ts'

const entry = (id, marked = false) => ({ id, marked })

test('a damage effect means only one skill is marked for advancement', () => {
  // No damage effect: the attack skill is marked as before.
  assert.deepEqual(advancementPick([entry('pugilism')], []), { mark: [entry('pugilism')], choose: [] })
  // Both unmarked: the player picks one.
  assert.deepEqual(advancementPick([entry('pugilism')], [entry('iron')]), { mark: [], choose: [entry('pugilism'), entry('iron')] })
  // One already marked: the other one is marked without asking.
  assert.deepEqual(advancementPick([entry('pugilism', true)], [entry('iron')]), { mark: [entry('iron')], choose: [] })
  assert.deepEqual(advancementPick([entry('pugilism')], [entry('iron', true)]), { mark: [entry('pugilism')], choose: [] })
  // Everything marked already: nothing to do.
  assert.deepEqual(advancementPick([entry('pugilism', true)], [entry('iron', true)]), { mark: [], choose: [] })
})

test('the hotlist is a fixed set of slots, and dropping onto a slot moves or swaps', () => {
  assert.deepEqual(hotlistSlots(['a', 'b'], 4), ['a', 'b', '', ''])
  assert.deepEqual(hotlistSlots(['a', '', 'c', 'd', 'e'], 3), ['a', '', 'c'])
  assert.deepEqual(placeInSlot(['a', '', ''], 3, 2, 'b'), ['a', '', 'b'])
  // Already on the list: it moves, and whatever was there takes its old slot.
  assert.deepEqual(placeInSlot(['a', 'b', ''], 3, 0, 'b'), ['b', 'a', ''])
  assert.deepEqual(placeInSlot(['a', 'b', ''], 3, 2, 'a'), ['', 'b', 'a'])
})

const spell = (id, system = {}) => ({ id, type: 'spell', name: id, img: `${id}.png`, system: { isAttack: false, actionKind: '', description: '', ...system } })

test('a spell is an action, an interrupt or both', () => {
  assert.deepEqual(actionKinds(spell('Bolt')), ['action'])
  assert.deepEqual(actionKinds(spell('Heal', { description: '<p>Cast it as an Interrupt when an ally drops.</p>' })), ['action', 'interrupt'])
  assert.deepEqual(actionKinds(spell('Ward', { actionKind: 'interrupt', description: 'Interrupt' })), ['interrupt'])
  assert.deepEqual(actionKinds(spell('Heal', { actionKind: 'both' })), ['action', 'interrupt'])
  assert.deepEqual(actionKinds(spell('Push', { actionKind: 'action', description: 'Interrupt' })), ['action'])
})

test('hotlisted spells fill the actions tables; attack spells go to the attacks table instead', () => {
  const heal = spell('Heal', { actionKind: 'both' })
  const bolt = spell('Bolt', { isAttack: true })
  const light = spell('Light')
  const rows = hotlistActions([heal, bolt, light], ['Heal', 'Bolt', ''])
  assert.deepEqual(
    rows.map((row) => [row.kind, row.sourceId]),
    [
      ['action', 'Heal'],
      ['interrupt', 'Heal'],
    ],
  )
  // Attack spells need the hotlist too.
  const items = [bolt, { ...spell('Fireball', { isAttack: true }) }]
  assert.deepEqual(automaticAttackItems(items, () => null, new Set(['Bolt'])).map((item) => item.id), ['Bolt'])
})

test('a consumable that runs out leaves the hotlist and the actions tables', () => {
  assert.ok(spentConsumable({ type: 'consumable', system: { quantity: 0 } }))
  assert.ok(!spentConsumable({ type: 'consumable', system: { quantity: 2 } }))
  assert.ok(!spentConsumable({ type: 'weapon', system: { quantity: 0 } }))
  const actions = [
    { id: '1', sourceId: 'potion' },
    { id: '2', sourceId: '' },
  ]
  assert.deepEqual(withoutSource({ hotlist: ['potion', 'sword', ''], actions }, 'potion'), { hotlist: ['', 'sword', ''], actions: [{ id: '2', sourceId: '' }] })
  assert.equal(withoutSource({ hotlist: ['sword'], actions: [{ id: '2', sourceId: '' }] }, 'potion'), null)
})
