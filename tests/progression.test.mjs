import { characterToActor } from '../src/import/convert.ts'
import test from 'node:test'
import assert from 'node:assert/strict'
import { bladeClapAllowed } from '../src/rules/blade-clap.ts'
import { advancementCap } from '../src/rules/advancementCaps.ts'
import { advancementCheck } from '../src/rules/upkeep.ts'
import { normalizeGrinding, creditGrindingHour, creditGrindingAid, allocateGrindingHours, nextGrindingDay, isUniqueLowestCrawler } from '../src/rules/grinding.ts'
import { floorCheckDc } from '../src/rules/floor-checks.ts'
import { awardNumber } from '../src/rules/crawler-awards.ts'
import { killingBlowBonus, addKillingBlowStack, expireKillingBlowStacks } from '../src/rules/killingBlowStacks.ts'

test('Blade Clap catches edged weapons only, missiles require rank 5', () => {
  const edged = { toHit: 12, damageTypes: ['Slashing'] }
  assert.equal(bladeClapAllowed(edged, 1), true)
  for (const extra of [{ toHit: null }, { isArea: true }, { magic: true }, { damageTypes: ['Bludgeoning'] }, { ranged: true }]) assert.equal(bladeClapAllowed({ ...edged, ...extra }, 4), false)
  assert.equal(bladeClapAllowed({ ...edged, ranged: true }, 5), true)
})
test('rank 20 needs both floor 7 and a matching cap exception', () => {
  const abilities = [{ properties: { effects: [{ type: 'rankCap', target: 'Fireball', value: '20' }] } }]
  assert.equal(advancementCap('Fireball', 6, abilities), 15)
  assert.equal(advancementCap('Fireball', 7, abilities), 20)
  assert.equal(advancementCap('Ice', 7, abilities), 15)
  assert.equal(advancementCheck(15, 'floor', 7).eligible, false)
  assert.equal(advancementCheck(15, 'floor', 7, true).eligible, true)
  assert.equal(advancementCheck(5, 'session', 7, true).eligible, false)
})
test('grinding preserves actual hours, caps aid, and banks progress between days', () => {
  let state = normalizeGrinding()
  for (let i = 0; i < 5; i++) state = creditGrindingHour(state, true)
  state = creditGrindingHour(state, false)
  state = creditGrindingAid(state, 'neighborhood')
  state = creditGrindingAid(state, 'borough')
  state = creditGrindingAid(state, 'borough')
  assert.equal(state.hoursToday, 6)
  assert.equal(state.levelHours, 7)
  const partial = allocateGrindingHours(state, 'skill', 3, 2)
  assert.equal(partial.ready, false)
  const complete = allocateGrindingHours(partial.state, 'skill', 3, 1)
  assert.equal(complete.ready, true)
  assert.throws(() => allocateGrindingHours(complete.state, 'skill', 3, 1))
  assert.equal(nextGrindingDay(partial.state).skillHours.skill, 2)
  assert.equal(isUniqueLowestCrawler(2, [3, 4]), true)
  assert.equal(isUniqueLowestCrawler(2, [2, 4]), false)
  assert.equal(isUniqueLowestCrawler(2, []), false)
})
test('floor checks and signed awards follow source arithmetic', () => {
  assert.equal(floorCheckDc(4, 'skill'), 18)
  assert.equal(floorCheckDc(4, 'stat'), 14)
  assert.equal(awardNumber('', 8), 8)
  assert.equal(awardNumber('+5', 8), 13)
  assert.equal(awardNumber('-2', 8), 6)
  assert.equal(awardNumber('2.5', 8), 2.5)
  assert.throws(() => awardNumber('Infinity', 8))
})
test('killing-blow stacks are spell-specific, rank-capped and expire', () => {
  const spells = [{ id: 'a', killingBlowStacking: true, killingBlowStacks: 4 }, { id: 'b', killingBlowStacking: true, killingBlowStacks: 2 }]
  const next = addKillingBlowStack(spells, 'a', 5, { at: 1, floor: 2 })
  assert.equal(killingBlowBonus(next[0], 3), 3)
  assert.equal(next[1].killingBlowStacks, 2)
  assert.equal(expireKillingBlowStacks(next, () => 10, { now: 1, floor: 3 })[0].killingBlowStacks, 0)
  assert.equal(expireKillingBlowStacks(next, () => 5, { now: 7 * 24 * 3600000 + 1, gameClock: null })[0].killingBlowStacks, 0)
})

test('imports retain spell stacks and remap grinding progress to Foundry item ids', () => {
  const actor = characterToActor({ character: { name: 'Importer' }, skills: [{ id: 'skill-one', name: 'Endurance', unenhancedRank: '2' }], spells: [{ id: 'spell-one', name: 'Stack spell', unenhancedRank: '5', killingBlowStacking: true, killingBlowStacks: 3 }], upkeep: { grinding: { day: 4, levelHours: 2, skillHours: { 'spell:spell-one': 4 }, attempted: { 'skill-one': 4 } } } })
  const spell = actor.items.find((item) => item.type === 'spell')
  const skill = actor.items.find((item) => item.type === 'skill')
  assert.equal(spell.system.killingBlowStacks, 3)
  assert.equal(actor.flags.crawlspace.grinding.skillHours[spell._id], 4)
  assert.equal(actor.flags.crawlspace.grinding.attempted[skill._id], 4)
})
