import { test } from 'node:test'
import assert from 'node:assert/strict'
import { automaticAttackItems, damageEffectSettings, joinFormula, linkedDamageEffects, toggledRollMode, usableAlone } from '../src/rules/damage-effects.ts'

const skill = (id, name, system = {}) => ({ id, type: 'skill', name, system: { isAttack: true, ...system } })
const weapon = (id, name, system = {}) => ({ id, type: 'weapon', name, system: { equipped: true, skill: '', broken: false, ...system } })

test('a weapon with a linked skill replaces that skill on the attacks table', () => {
  const handgunSkill = skill('s1', 'Handgun')
  const handgun = weapon('w1', 'Handgun', { skill: 'Handgun' })
  const skillOf = (item) => (item.system.skill === 'Handgun' ? handgunSkill : null)
  assert.deepEqual(automaticAttackItems([handgunSkill, handgun], skillOf).map((item) => item.id), ['w1'])
})

test('unequipped, broken and skill-less weapons stay off the attacks table, and so does their skill', () => {
  const handgunSkill = skill('s1', 'Handgun')
  const skillOf = (item) => (item.system.skill === 'Handgun' ? handgunSkill : null)
  for (const extra of [{ equipped: false }, { broken: true }, { skill: '' }]) {
    const handgun = weapon('w1', 'Handgun', { skill: 'Handgun', ...extra })
    // A weapon skill has no way to be used without its weapon.
    assert.deepEqual(automaticAttackItems([handgunSkill, handgun], skillOf).map((item) => item.id), [], JSON.stringify(extra))
  }
})

test('unarmed skills and attack spells keep their own rows', () => {
  const pugilism = skill('s1', 'Pugilism')
  const flagged = skill('s2', 'Headbutt', { isUnarmed: true })
  const longsword = skill('s3', 'Longsword')
  const spell = { id: 'p1', type: 'spell', name: 'Magic Missile', system: { isAttack: true } }
  assert.deepEqual(automaticAttackItems([pugilism, flagged, longsword, spell], () => null).map((item) => item.id), ['s1', 's2', 'p1'])
  assert.ok(usableAlone(pugilism))
  assert.ok(usableAlone({ type: 'skill', name: 'Unarmed  Combat', system: {} }))
  assert.ok(!usableAlone(longsword))
  assert.ok(usableAlone(spell))
})

test('formula parts join without doubled plus signs', () => {
  assert.equal(joinFormula('1d2+@strMod', '+1d2'), '1d2+@strMod+1d2')
  assert.equal(joinFormula('1d8', '+4d4', '', '-1'), '1d8+4d4-1')
  assert.equal(joinFormula('', '+1d6'), '1d6')
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
    { label: 'Aiming', value: 3, enabled: false, rollMode: 'disadvantage', damage: '', undoubled: '', skillRank: 3 },
  ])
  assert.deepEqual(linkedDamageEffects(skills, 'Unarmed  Combat'), [
    { label: 'Brutal Strike', value: 0, enabled: false, rollMode: undefined, damage: '1d6', undoubled: '1d4', skillRank: 2 },
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
