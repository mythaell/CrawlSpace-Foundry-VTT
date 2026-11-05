import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abilityScoreModifier, attackOutcome, doubleDice, resolveFormulaTokens } from '../src/rules/core.ts'
import { debuffById } from '../src/rules/debuffs.ts'
import { durationSeconds, durationEvent, timeParts, timePartsSeconds, restSeconds } from '../src/rules/time.ts'
import { effectDuration } from '../src/import/convert.ts'

test('time entry carries overflow across thirty-hour days', () => {
  assert.deepEqual(timeParts(timePartsSeconds({ days: 0, hours: 0, minutes: 90, seconds: 0 })), { days: 0, hours: 1, minutes: 30, seconds: 0 })
  assert.deepEqual(timeParts(timePartsSeconds({ days: 1, hours: 35, minutes: 90, seconds: 90 })), { days: 2, hours: 6, minutes: 31, seconds: 30 })
  assert.throws(() => timePartsSeconds({ days: 0, hours: -1, minutes: 0, seconds: 0 }))
  assert.throws(() => timePartsSeconds({ days: 0, hours: Infinity, minutes: 0, seconds: 0 }))
})

test('duration parser preserves CrawlSpace units and conditional text', () => {
  assert.equal(durationSeconds('1 day'), 108000)
  assert.equal(durationSeconds('For 1 hour and 90 minutes.'), 9000)
  assert.equal(durationSeconds('Until the end of the next round.'), 10)
  assert.equal(durationSeconds('1 minute or 6 rounds'), 60)
  assert.equal(durationSeconds('1 minute or 2 rounds'), null)
  assert.equal(durationSeconds('Until healed'), null)
  assert.equal(durationSeconds('-1 hour'), null)
  assert.equal(durationSeconds(''), null)
  assert.equal(durationEvent('Until you enter a saferoom'), 'safeRoom')
  assert.deepEqual(effectDuration('1 day'), { value: 108000, units: 'seconds' })
  assert.deepEqual(effectDuration('Until end of combat'), { value: null, units: 'seconds', expiry: 'combatEnd' })
})

test('rests use source durations and reject invalid hourly skips', () => {
  assert.equal(restSeconds('short'), 7200)
  assert.equal(restSeconds('long'), 28800)
  assert.equal(restSeconds('full'), 108000)
  assert.equal(restSeconds('hourly', 3), 10800)
  assert.throws(() => restSeconds('hourly', 0))
  assert.throws(() => restSeconds('hourly', 1.5))
  assert.throws(() => restSeconds('other'))
})

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
