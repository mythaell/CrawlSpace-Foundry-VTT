import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actorSize, sizedPrototype, resizedPrototype } from '../src/rules/token-size.ts'

const token = (width, height = width) => ({ width, height })

test('a creature’s size sets its token size, as in CrawlSpace', () => {
  const sizes = ['1', '2', '3', '4', '5', '6', '7', '8'].map((size) => sizedPrototype(size, token(1))?.width ?? 1)
  assert.deepEqual(sizes, [0.5, 0.7, 0.9, 1, 2, 3, 4, 5])
  assert.deepEqual(sizedPrototype('Large', token(1)), { width: 2, height: 2 })
  assert.deepEqual(sizedPrototype('10', token(1)), { width: 5, height: 5 }, 'size 8 and up: 5×5')
})

test('the old compendium sizes are replaced, a GM’s own size is kept', () => {
  assert.deepEqual(sizedPrototype('7', token(2)), { width: 4, height: 4 })
  assert.equal(sizedPrototype('6', token(3, 2)), null)
  assert.equal(sizedPrototype('2', token(4)), null)
  assert.equal(sizedPrototype('4', token(1)), null, 'already right')
  assert.equal(sizedPrototype('', token(1)), null, 'no size: left alone')
})

test('changing the size moves a token that followed the old size', () => {
  assert.deepEqual(resizedPrototype('4', '6', token(1)), { width: 3, height: 3 })
  assert.deepEqual(resizedPrototype('6', '2', token(3)), { width: 0.7, height: 0.7 })
  assert.equal(resizedPrototype('4', '6', token(2)), null, 'resized by hand')
})

test('crawlers keep their size in details, NPCs have none', () => {
  assert.equal(actorSize('crawler', { details: { size: '3' } }), '3')
  assert.equal(actorSize('mob', { size: '6' }), '6')
  assert.equal(actorSize('companion', { size: '5' }), '5')
  assert.equal(actorSize('npc', {}), '')
})
