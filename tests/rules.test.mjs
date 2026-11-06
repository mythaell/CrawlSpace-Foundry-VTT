import { blockedDamage, applyDamageResponses, safeArithmetic } from '../src/rules/core.ts'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { abilityScoreModifier, attackOutcome, doubleDice, rankDie, resolveFormulaTokens, splitRankDice } from '../src/rules/core.ts'
import { endTriggers } from '../src/effects/end-triggers.ts'
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

test('fractional rule results round down, including negative values', () => {
  assert.equal(blockedDamage(5, 1, 0), 2)
  assert.equal(applyDamageResponses(5, ['Fire'], [{ damageType: 'Fire', response: 'Resistance' }]).damage, 2)
  assert.equal(applyDamageResponses(5, ['Fire', 'Cold'], []).damage, 4)
  assert.equal(safeArithmetic('-3/2'), -2)
  assert.equal(durationSeconds('1.9 seconds'), 1)
  assert.equal(timeParts(90.9).seconds, 30)
})

test('Rank dice come apart from the base so a Critical Hit leaves them single', () => {
  assert.deepEqual(splitRankDice('1d6+RANK_DIE', 6), { base: '1d6', dice: `(${rankDie(6)})` })
  assert.deepEqual(splitRankDice('RANK_DIE+2', 10), { base: '0+2', dice: `(${rankDie(10)})` })
  assert.deepEqual(splitRankDice('2d8+2*RANK_DIE', 4), { base: '2d8', dice: `(${rankDie(4)})+(${rankDie(4)})` })
  assert.deepEqual(splitRankDice('1d10+RANK', 3), { base: '1d10+RANK', dice: '' })
  assert.equal(doubleDice(splitRankDice('1d6+RANK_DIE', 6).base), '2d6')
})

test('special durations read the events that end a condition', () => {
  assert.deepEqual(endTriggers('Until you are healed'), ['healed'])
  assert.deepEqual(endTriggers('Until the end of the next round, or you take at least 1 HP slot damage'), ['damaged'])
  assert.deepEqual(endTriggers('Until the end of combat'), ['combatEnd'])
  assert.deepEqual(endTriggers('Once you make a check'), ['check'])
  assert.deepEqual(endTriggers('5 minutes'), [])
})

test('every special duration in the picker is one the end triggers read (or is kept manual)', async () => {
  const { SPECIAL_DURATIONS, endTriggers } = await import('../src/effects/end-triggers.ts')
  const expected = {
    'Until the end of combat': ['combatEnd'],
    'Until you are healed at least 1 health slot': ['healed'],
    'Until you take at least 1 HP slot of damage': ['damaged'],
    'Ends once you make a check': ['check'],
    'Until the end of the next action you take': ['action'],
    'Until you die': ['death'],
    'Until the end of a short rest': ['shortRest'],
    'Until you complete a long rest': ['longRest'],
    'Until you finish a full day of rest': ['fullRest'],
    'Until you enter a saferoom': ['safeRoom'],
    'Until you leave this floor': ['leaveFloor'],
    'Until cured with a bandage': [],
    'While the source is active': [],
  }
  assert.deepEqual([...SPECIAL_DURATIONS].sort(), Object.keys(expected).sort())
  for (const [text, triggers] of Object.entries(expected)) assert.deepEqual(endTriggers(text), triggers, text)
})
