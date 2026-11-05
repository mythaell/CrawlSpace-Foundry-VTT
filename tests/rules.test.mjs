import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abilityScoreModifier, attackOutcome, doubleDice, resolveFormulaTokens } from '../src/rules/core.ts'
import { debuffById } from '../src/rules/debuffs.ts'

test('ability modifier bands', () => {
  assert.equal(abilityScoreModifier(2), 1)
  assert.equal(abilityScoreModifier(8), 3)
  assert.equal(abilityScoreModifier(30), 5)
  assert.equal(abilityScoreModifier(300), 10)
  assert.equal(abilityScoreModifier(''), 0)
})

test('attack outcomes', () => {
  assert.equal(attackOutcome(15, 10, 1), 'Crit miss')
  assert.equal(attackOutcome(5, 10, 20), 'Critical hit')
  assert.equal(attackOutcome(20, 10, 12), 'Amazing hit')
  assert.equal(attackOutcome(12, 10, 9), 'Hit')
  assert.equal(attackOutcome(8, 10, 5), 'Miss')
  assert.equal(attackOutcome(0, 10, 2), 'Major miss')
})

test('formula tokens resolve once and stay stable', () => {
  const once = resolveFormulaTokens('2d6 + DEX MOD + F', { floor: 3 })
  assert.equal(once, '2d6+@dexMod+3')
  assert.equal(resolveFormulaTokens(once, { floor: 3 }), once)
  assert.equal(resolveFormulaTokens('1d4+RANK', { rank: 4 }), '1d4+4')
})

test('critical hits double dice only', () => {
  assert.equal(doubleDice('1d10+@strMod'), '2d10+@strMod')
  assert.equal(doubleDice('3d6+2'), '6d6+2')
})

test('debuff definitions', () => {
  assert.equal(debuffById('fatigued')?.checkPenalty, -1)
  assert.ok(debuffById('poisoned')?.stackable)
})
