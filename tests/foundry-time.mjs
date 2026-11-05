/** Run only in an isolated Foundry world. Creates and removes its own actors, effects, combat and chat. */
export async function testFoundryTime() {
  if (window.location.port !== '30001') throw new Error('Use the isolated Foundry test server on port 30001')
  const checks = []
  const messagesBefore = new Set(game.messages.map((message) => message.id))
  const timeBefore = game.time.worldTime
  const timersBefore = foundry.utils.deepClone(game.settings.get('crawlspace', 'timers'))
  const clockBefore = game.settings.get('crawlspace', 'clockRunning')
  const activeCombats = game.combats.filter((entry) => entry.active)
  const pausedBefore = game.paused
  let actor
  let combat
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
    checks.push(message)
  }
  try {
    await game.settings.set('crawlspace', 'clockRunning', false)
    for (const entry of activeCombats) await entry.update({ active: false })
    actor = await Actor.create({ name: 'Time integration test', type: 'crawler', system: { attributes: { int: { value: 20 }, con: { value: 20 } }, mana: { value: 0 } } })
    const [skill] = await actor.createEmbeddedDocuments('Item', [{ name: 'Timed skill', type: 'skill', system: { cooldown: '2 rounds', checkType: 'Passive' } }])
    assert(!!(await skill.use({ fast: true })), 'Initial skill use succeeds')
    assert((await skill.use({ fast: true })) === null, 'Cooldown blocks repeated use')
    await game.crawlspace.advanceTime(19)
    assert((await skill.use({ fast: true })) === null, 'Cooldown remains blocked before boundary')
    await game.crawlspace.advanceTime(1)
    assert(!!(await skill.use({ fast: true })), 'Cooldown expires at exact boundary')
    const [attackSkill, weapon] = await actor.createEmbeddedDocuments('Item', [
      { name: 'Timed attack', type: 'skill', system: { cooldown: '1 minute', isAttack: true, damage: { formula: '1d4' } } },
      { name: 'Test weapon', type: 'weapon', system: { skill: 'Timed attack', equipped: true, damage: { formula: '1' } } },
    ])
    assert(!!(await weapon.use({ fast: true })), 'Weapon attack starts linked skill cooldown')
    assert((await attackSkill.use({ fast: true })) === null, 'Direct skill use cannot bypass weapon-started cooldown')
    assert((await weapon.use({ fast: true })) === null, 'Weapon attack cannot bypass linked skill cooldown')
    const [spell] = await actor.createEmbeddedDocuments('Item', [{ name: 'Canceled spell', type: 'spell', system: { cooldown: '1 minute', mana: '1', checkType: 'Unopposed' } }])
    await actor.update({ 'system.mana.value': 5 })
    Hooks.once('renderDialogV2', (dialog) => { void dialog.close() })
    assert((await spell.use()) === null, 'Canceled check returns without a use')
    assert(actor.system.mana.value === 5 && !actor.effects.some((effect) => effect.getFlag('crawlspace', 'cooldownKey') === `item:${spell.id}`), 'Canceling a spell spends neither mana nor cooldown')
    const [regen] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Timed regeneration', duration: { value: 20, units: 'seconds' }, system: { changes: [{ type: 'crawlspace.special', key: 'manaPerRound', value: JSON.stringify({ value: '1', interval: '10 seconds' }) }] } }])
    await actor.update({ 'system.mana.value': 0 })
    await game.crawlspace.advanceTime(100)
    assert(actor.system.mana.value === 2, `Expiring regeneration grants only its active time (${actor.system.mana.value} mana)`)
    for (let attempt = 0; attempt < 30 && !actor.effects.get(regen.id).duration.expired; attempt++) await new Promise((resolve) => setTimeout(resolve, 100))
    assert(actor.effects.get(regen.id).duration.expired, 'Core expires timed effects during skips')
    const [statRegen] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Stat regeneration', duration: { value: 10, units: 'seconds' }, system: { changes: [{ type: 'crawlspace.special', key: 'manaPerRound', value: JSON.stringify({ value: 'INT', interval: '10 seconds' }) }] } }])
    await actor.update({ 'system.mana.value': 0 })
    await game.crawlspace.advanceTime(10)
    assert(actor.system.mana.value === actor.system.statMod('INT'), 'Stat-based regeneration retains actor modifiers')
    const [untilRest] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Until long rest', duration: { value: null, units: 'seconds', expiry: 'longRest' } }])
    const beforeRest = game.time.worldTime
    await game.crawlspace.rest(actor, 'short')
    assert(game.time.worldTime - beforeRest === 7200, 'Short rest advances exactly two hours')
    assert(!actor.effects.get(untilRest.id).duration.expired, 'Short rest preserves long-rest effects')
    await game.crawlspace.rest(actor, 'long')
    assert(actor.effects.get(untilRest.id).duration.expired, 'Long rest triggers event expiry')
    await game.settings.set('crawlspace', 'timers', [{ id: 'integration', label: 'Integration countdown', floor: false, visible: false, remaining: 15, end: game.time.worldTime + 15, announced: false }])
    await game.crawlspace.advanceTime(20)
    for (let attempt = 0; attempt < 30 && !game.settings.get('crawlspace', 'timers')[0].announced; attempt++) await new Promise((resolve) => setTimeout(resolve, 100))
    assert(game.settings.get('crawlspace', 'timers')[0].announced, 'Countdown completion is recorded')
    combat = await Combat.create({ active: true })
    await combat.createEmbeddedDocuments('Combatant', [{ actorId: actor.id }])
    await combat.startCombat()
    const [cleanupEffect] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Until cleanup', duration: { value: null, units: 'seconds', expiry: 'cleanUp' } }])
    const beforeRound = game.time.worldTime
    await combat.nextTurn()
    await combat.nextTurn()
    await combat.nextTurn()
    await combat.nextTurn()
    assert(actor.effects.get(cleanupEffect.id).duration.expired, 'Clean Up triggers native expiry')
    assert(game.time.worldTime === beforeRound, 'Combat phases do not each advance time')
    await combat.nextTurn()
    assert(game.time.worldTime - beforeRound === 10, 'One full combat round advances ten seconds')
    let blocked = false
    try { await game.crawlspace.advanceTime(3600) } catch { blocked = true }
    assert(blocked, 'Hour skips are blocked during active combat')
    const [combatEffect] = await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Combat or five minutes', duration: { value: 300, units: 'seconds' }, system: { durationText: 'Until the end of combat or 5 minutes.' } }])
    await combat.delete()
    combat = null
    assert(actor.effects.get(combatEffect.id).duration.expired, 'End of combat clears earlier-of-combat-or-time conditions')
    for (const entry of game.combats) if (entry.active) await entry.update({ active: false })
    game.togglePause(false, { broadcast: true })
    await game.settings.set('crawlspace', 'clockRunning', true)
    const beforeTick = game.time.worldTime
    await new Promise((resolve) => setTimeout(resolve, 2200))
    assert(game.time.worldTime > beforeTick, 'Exploration clock advances world time')
    game.togglePause(true, { broadcast: true })
    await game.crawlspace.settleTime()
    const beforePause = game.time.worldTime
    await new Promise((resolve) => setTimeout(resolve, 1200))
    assert(game.time.worldTime === beforePause, 'Foundry pause stops exploration time')
    await game.settings.set('crawlspace', 'clockRunning', false)
    return { passed: checks.length, checks }
  } catch (error) {
    return { passed: checks.length, checks, error: error.stack }
  } finally {
    if (combat) await combat.delete()
    for (const entry of activeCombats) await entry.update({ active: true })
    if (actor) await actor.delete()
    const messages = game.messages.filter((message) => !messagesBefore.has(message.id)).map((message) => message.id)
    if (messages.length) await ChatMessage.deleteDocuments(messages)
    await game.time.set(timeBefore)
    await game.settings.set('crawlspace', 'timers', timersBefore)
    await game.settings.set('crawlspace', 'clockRunning', clockBefore)
    game.togglePause(pausedBefore, { broadcast: true })
  }
}
