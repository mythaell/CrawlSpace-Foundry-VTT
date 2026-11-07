import test from 'node:test'
import assert from 'node:assert/strict'
import { defenseEvents, matchTriggers, rollEvents, unwrapTriggered, wrapTriggered } from '../src/effects/trigger-events.ts'

const entry = (when, extra = {}) => ({ when, timing: 'before', change: { key: 'note', type: 'crawlspace.special', value: '{}' }, source: 'x', effectId: 'e', itemId: 'i', itemName: 'Cloak', itemType: 'equipment', index: 0, ...extra })

test('roll and defense events per outcome', () => {
  assert.deepEqual(rollEvents('Amazing hit'), ['rollAmazing', 'rollAnySuccess'])
  assert.deepEqual(rollEvents('Crit miss'), ['rollCritFail', 'rollAnyFail'])
  assert.deepEqual(defenseEvents('Critical hit'), ['targeted', 'hitCrit', 'hitAny'])
  assert.deepEqual(defenseEvents('Major miss'), ['targeted', 'missMajor', 'missAny'])
  assert.deepEqual(rollEvents('nonsense'), [])
})

test('timing only splits events that have an after moment', () => {
  const entries = [entry('hitCrit'), entry('hitCrit', { timing: 'after' })]
  assert.equal(matchTriggers(entries, ['hitCrit'], { timing: 'before', afterPhase: true }).length, 1)
  assert.equal(matchTriggers(entries, ['hitCrit'], { timing: 'after', afterPhase: true })[0].timing, 'after')
  assert.equal(matchTriggers(entries, ['hitCrit'], { timing: 'before', afterPhase: false }).length, 2)
})

test("a weapon's roll triggers only count for its own attacks", () => {
  const sword = entry('rollAmazing', { itemName: 'Flame Sword', itemType: 'weapon' })
  const ring = entry('rollAmazing')
  assert.equal(matchTriggers([sword, ring], ['rollAmazing'], { timing: 'before', afterPhase: false, sources: ['Swords'] }).length, 1)
  assert.equal(matchTriggers([sword], ['rollAmazing'], { timing: 'before', afterPhase: false, sources: ['flame sword', 'Swords'] }).length, 1)
})

test('wrap and unwrap a triggered rule', () => {
  const wrapped = wrapTriggered({ key: 'shield', type: 'crawlspace.special', value: '{"value":"3"}' }, 'hitCrit', 'after')
  assert.equal(wrapped.type, 'crawlspace.triggered')
  assert.deepEqual(unwrapTriggered(wrapped), { when: 'hitCrit', timing: 'after', change: { key: 'shield', type: 'crawlspace.special', value: '{"value":"3"}' } })
  assert.equal(unwrapTriggered({ type: 'add', value: 1 }), null)
})
