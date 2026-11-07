import { test } from 'node:test'
import assert from 'node:assert/strict'
import { automaticAttackItems, damageEffectSettings, linkedDamageEffects, toggledRollMode } from '../src/rules/damage-effects.ts'

const skill = (id, name, system = {}) => ({ id, type: 'skill', name, system: { isAttack: true, ...system } })
const weapon = (id, name, system = {}) => ({ id, type: 'weapon', name, system: { equipped: true, skill: '', broken: false, ...system } })

test('a weapon with a linked skill replaces that skill on the attacks table', () => {
  const handgunSkill = skill('s1', 'Handgun')
  const handgun = weapon('w1', 'Handgun', { skill: 'Handgun' })
  const skillOf = (item) => (item.system.skill === 'Handgun' ? handgunSkill : null)
  assert.deepEqual(automaticAttackItems([handgunSkill, handgun], skillOf).map((item) => item.id), ['w1'])
})

test('unequipped, broken and skill-less weapons stay off the attacks table', () => {
  const handgunSkill = skill('s1', 'Handgun')
  const skillOf = (item) => (item.system.skill === 'Handgun' ? handgunSkill : null)
  for (const extra of [{ equipped: false }, { broken: true }, { skill: '' }]) {
    const handgun = weapon('w1', 'Handgun', { skill: 'Handgun', ...extra })
    // The skill keeps its own row when no weapon stands in for it.
    assert.deepEqual(automaticAttackItems([handgunSkill, handgun], skillOf).map((item) => item.id), ['s1'], JSON.stringify(extra))
  }
})

test('broken explosives and non-attack skills are left out', () => {
  const bomb = { id: 'c1', type: 'consumable', name: 'Bomb', system: { consumableType: 'explosives', broken: false } }
  const brokenBomb = { ...bomb, id: 'c2', system: { ...bomb.system, broken: true } }
  const passive = skill('s2', 'Cooking', { isAttack: false })
  assert.deepEqual(automaticAttackItems([bomb, brokenBomb, passive], () => null).map((item) => item.id), ['c1'])
})

test('Aiming defaults to its rank on the attack, rolled keep-lower', () => {
  assert.deepEqual(damageEffectSettings({ name: 'Aiming' }), { addRank: true, mode: 'disadvantage' })
  assert.deepEqual(damageEffectSettings({ name: 'Brutal Strike' }), { addRank: false, mode: 'normal' })
  assert.deepEqual(damageEffectSettings({ name: 'Aiming', addRank: false, mode: 'normal' }), { addRank: false, mode: 'normal' })
})

test('damage effect skills linked to the attack skill become switched-off toggles', () => {
  const skills = [
    { name: 'Aiming', rank: 3, effect: { enabled: true, skills: ['Handgun', 'Bow'] }, damage: { base: '', dice: '' } },
    { name: 'Brutal Strike', rank: 2, effect: { enabled: true, skills: ['unarmed combat'] }, damage: { base: '1d6', dice: '1d4' } },
    { name: 'Unranked', rank: 0, effect: { enabled: true, skills: ['Handgun'] }, damage: { base: '1d6', dice: '' } },
    { name: 'Not an effect', rank: 4, effect: { enabled: false, skills: ['Handgun'] }, damage: { base: '1d6', dice: '' } },
  ]
  assert.deepEqual(linkedDamageEffects(skills, 'handgun'), [
    { label: 'Aiming', value: 3, enabled: false, rollMode: 'disadvantage', damage: '', undoubled: '' },
  ])
  assert.deepEqual(linkedDamageEffects(skills, 'Unarmed  Combat'), [
    { label: 'Brutal Strike', value: 0, enabled: false, rollMode: undefined, damage: '1d6', undoubled: '1d4' },
  ])
  assert.deepEqual(linkedDamageEffects(skills, ''), [])
})

test('ticked effects set the roll mode, keep-lower first', () => {
  assert.equal(toggledRollMode('normal', [{ rollMode: 'disadvantage' }]), 'disadvantage')
  assert.equal(toggledRollMode('advantage', [{ rollMode: 'disadvantage' }]), 'disadvantage')
  assert.equal(toggledRollMode('normal', [{ rollMode: 'advantage' }]), 'advantage')
  assert.equal(toggledRollMode('disadvantage', [{ rollMode: 'advantage' }]), 'disadvantage')
  assert.equal(toggledRollMode('advantage', [{}]), 'advantage')
})
