import { test } from 'node:test'
import assert from 'node:assert/strict'
import { damageShields, isRepairSkill, needsRepair, shieldDrLoss, shieldRemaining } from '../src/rules/shield-block.ts'

test('a failed Shield Block costs the shield DR by tier', () => {
  assert.equal(shieldDrLoss('Major miss'), 1)
  assert.equal(shieldDrLoss('Crit miss'), 2)
  for (const outcome of ['Miss', 'Hit', 'Amazing hit', 'Critical hit', null, undefined]) assert.equal(shieldDrLoss(outcome), 0)
})

test('lost DR comes off the first working shield and breaks it at zero', () => {
  const shields = [
    { id: 'a', dr: 2, lost: 0, broken: false },
    { id: 'b', dr: 3, lost: 0, broken: false },
  ]
  assert.deepEqual(damageShields(shields, 1), [{ id: 'a', lost: 1, broken: false }])
  assert.deepEqual(damageShields(shields, 2), [{ id: 'a', lost: 2, broken: true }])
  // More than the first shield has left runs on to the next one.
  assert.deepEqual(damageShields([{ id: 'a', dr: 2, lost: 1, broken: false }, ...shields.slice(1)], 2), [
    { id: 'a', lost: 2, broken: true },
    { id: 'b', lost: 1, broken: false },
  ])
  // Broken shields are skipped; nothing to lose, nothing changes.
  assert.deepEqual(damageShields([{ id: 'a', dr: 2, lost: 0, broken: true }], 1), [])
  assert.deepEqual(damageShields(shields, 0), [])
})

test('shield DR left never goes below zero', () => {
  assert.equal(shieldRemaining({ dr: 3, lost: 1 }), 2)
  assert.equal(shieldRemaining({ dr: 2, lost: 5 }), 0)
  assert.equal(shieldRemaining({ dr: 0, lost: 0 }), 0)
})

test('Repair skill and what needs repairing', () => {
  assert.ok(isRepairSkill('Repair'))
  assert.ok(isRepairSkill(' repair '))
  assert.ok(!isRepairSkill('Repair Bot'))
  assert.ok(needsRepair({ type: 'weapon', system: { broken: true } }))
  assert.ok(needsRepair({ type: 'equipment', system: { broken: false, isShield: true, drLost: 1 } }))
  assert.ok(!needsRepair({ type: 'equipment', system: { broken: false, isShield: true, drLost: 0 } }))
  assert.ok(!needsRepair({ type: 'spell', system: { broken: true } }))
})
