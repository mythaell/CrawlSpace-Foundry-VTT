/** Isolated-world regression checks for sheet rendering, scrolling and round-down rolls. */
export async function testFoundrySheets() {
  if (location.port !== '30001') throw new Error('Use the isolated test world')
  const checks = []
  const assert = (ok, label) => { if (!ok) throw new Error(label); checks.push(label) }
  let actor, spell, effect
  try {
    const positive = await Roll.create('3/2').evaluate()
    assert(positive.total === 1, 'Async rolls round fractional totals down')
    assert((await Roll.create('-3/2').evaluate()).total === -2, 'Negative rolls round toward negative infinity')
    assert(Roll.create('7/2').evaluateSync().total === 3, 'Synchronous rolls round down')
    assert(positive.constructor.name === 'CrawlRoll' && Roll.fromJSON(JSON.stringify(positive)).total === 1, 'Custom roll name and rounded total survive serialization')
    const die = await Roll.create('1d20+0.9').evaluate()
    assert(die.dice[0].results.some((result) => result.active && result.result === die.total), 'Rounding preserves the native die results')
    actor = await Actor.create({ name: 'Sheet rounding test', type: 'crawler', system: { attributes: { int: { value: 15 } }, mana: { value: 0 }, move: { bonus: 1 } } })
    ;[spell] = await actor.createEmbeddedDocuments('Item', [{ name: 'Spell properties test', type: 'spell', system: { rank: { value: 1 }, mana: '1.9', killingBlowStacking: true } }])
    await spell.sheet.render({ force: true })
    assert(spell.sheet.rendered && !!spell.sheet.element.querySelector('[name="system.killingBlowStacking"]'), 'Spell properties render with stacking controls inside the details part')
    assert(spell.system.manaCost === 1, 'Fractional spell mana costs round down')
    const [potion] = await actor.createEmbeddedDocuments('Item', [{ name: 'Percentage potion', type: 'consumable', system: { manaRestore: '50%' } }])
    await potion.use()
    assert(actor.system.mana.value === 7, '50 percent of 15 mana restores 7, not 8')
    ;[effect] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Scrolling effect test', description: '<p>Long effect description</p>'.repeat(20), system: { changes: Array.from({ length: 12 }, (_, index) => ({ type: 'add', key: 'system.mana.bonus', value: String(index) })) } }])
    await effect.sheet.render({ force: true })
    const body = effect.sheet.element.querySelector('.effect-body')
    assert(body.clientHeight > 0 && body.scrollHeight > body.clientHeight && getComputedStyle(body).overflowY === 'auto', 'Effect body has a constrained native scroll area')
    body.scrollTop = body.scrollHeight
    assert(body.scrollTop > 0, 'Effect rules below the fold can be scrolled into view')
    return { passed: checks.length, checks }
  } catch (error) { return { passed: checks.length, checks, error: error.stack } }
  finally {
    if (effect?.sheet.rendered) await effect.sheet.close()
    if (spell?.sheet.rendered) await spell.sheet.close()
    if (actor) {
      const messages = game.messages.filter((message) => message.speaker.actor === actor.id).map((message) => message.id)
      if (messages.length) await ChatMessage.deleteDocuments(messages)
      await actor.delete()
    }
  }
}
