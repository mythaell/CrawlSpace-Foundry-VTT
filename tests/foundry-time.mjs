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
  let mob
  let other
  const assert = (condition, message) => {
    if (!condition) throw new Error(message)
    checks.push(message)
  }
  try {
    await game.settings.set('crawlspace', 'clockRunning', false)
    for (const entry of activeCombats) await entry.update({ active: false })
    actor = await Actor.create({ name: 'Time integration test', type: 'crawler', system: { attributes: { int: { value: 20 }, con: { value: 20 } }, mana: { value: 0 } } })
    other = await Actor.create({ name: 'Party integration test', type: 'crawler' })
    const beforeParty = game.time.worldTime
    await game.crawlspace.performUpkeep([actor.uuid, other.uuid], 'short', 1)
    assert(game.time.worldTime - beforeParty === 7200, 'Party rest advances time once for two crawlers')
    await game.crawlspace.performUpkeep([actor.uuid], 'short', 1, true)
    assert(game.time.worldTime - beforeParty === 7200, 'No-skip upkeep preserves world time')
    await actor.createEmbeddedDocuments('Item', [
      { name: 'Capped skill', type: 'skill', system: { rank: { value: 25 } } },
      { name: 'Race exception', type: 'ability', system: { category: 'racial' }, effects: [{ name: 'Rank cap', transfer: true, system: { changes: [{ type: 'crawlspace.special', key: 'rankCap', value: JSON.stringify({ target: 'Capped skill', value: '20' }) }] } }] },
    ])
    const capped = actor.items.find((item) => item.name === 'Capped skill')
    const exception = actor.items.find((item) => item.name === 'Race exception')
    assert(capped.system.rank.total === 15, 'Derived ranks cap at 15 before Floor 7')
    await actor.update({ 'system.details.floor': 7 })
    assert(capped.system.rank.total === 20, 'Race exception allows Rank 20 on Floor 7')
    await exception.update({ 'system.category': 'other' })
    assert(capped.system.rank.total === 15, 'Ordinary abilities cannot raise rank caps')
    const [killSpell] = await actor.createEmbeddedDocuments('Item', [{ name: 'Stack spell', type: 'spell', system: { rank: { value: 2 }, killingBlowStacking: true } }])
    mob = await Actor.create({ name: 'Killing-blow target', type: 'mob' })
    await mob.applyDamage(10000, { killingBlowSpell: killSpell.uuid })
    assert(killSpell.system.killingBlowStacks === 1, 'Lethal damage credits the source spell')
    await mob.applyDamage(10000, { killingBlowSpell: killSpell.uuid })
    assert(killSpell.system.killingBlowStacks === 1, 'Repeated damage to a dead target gives no stack')
    await game.crawlspace.rest(actor, 'long', 1, { advance: false })
    assert(killSpell.system.killingBlowStacks === 0, 'Long rest clears low-rank killing-blow stacks')
    const [explosive] = await actor.createEmbeddedDocuments('Item', [{ name: 'Test explosive', type: 'consumable', system: { consumableType: 'explosives', quantity: 2, damage: { formula: '2d6', types: ['Fire'], area: true } } }])
    Hooks.once('renderDialogV2', (dialog) => { void dialog.close() })
    await explosive.use()
    assert(explosive.system.quantity === 2, 'Canceling explosive attack preserves its quantity')
    await explosive.use({ fast: true })
    assert(explosive.system.quantity === 1, 'Rolling explosive attack consumes one item')
    await actor.addDebuff('fatigued')
    await actor.createEmbeddedDocuments('ActiveEffect', [{ name: 'Fatigue immunity', system: { changes: [{ type: 'add', key: 'system.traits.conditionImmunities', value: 'Fatigued' }] } }])
    for (let attempt = 0; attempt < 30 && actor.effects.some((effect) => effect.statuses.has('fatigued')); attempt++) await new Promise((resolve) => setTimeout(resolve, 100))
    assert(!actor.effects.some((effect) => effect.statuses.has('fatigued')), 'New immunity removes an existing matching condition')
    const [grindSkill] = await other.createEmbeddedDocuments('Item', [{ name: 'Grinding skill', type: 'skill', system: { rank: { value: 1 } } }])
    const originalPrompt = foundry.applications.api.DialogV2.prompt
    let promptCount = 0
    try {
      foundry.applications.api.DialogV2.prompt = async () => ++promptCount === 1 ? { aid: 'none', newDay: false } : { [grindSkill.id]: 1 }
      const beforeGrinding = game.time.worldTime
      await game.crawlspace.openGrinding([other], 1)
      assert(game.time.worldTime - beforeGrinding === 3600, 'Grinding advances actual hours once')
      assert(grindSkill.system.rank.value === 2, 'Completed grinding hours resolve skill advancement')
      assert(other.system.details.level > 1 && other.getFlag('crawlspace', 'grinding').levelHours === 0, 'Grinding automatically awards level progress and resets the level bank')
      assert(other.getFlag('crawlspace', 'grinding').attempted[grindSkill.id] === 1, 'Grinding records the once-per-day skill attempt')
      foundry.applications.api.DialogV2.prompt = async () => ({ aiFavor: '+5', popularity: '2.5', name: 'Test award', description: 'An achievement', reward: '', box: 'Legendary Adventurer Box', quantity: '2', notes: '', link: true })
      await game.crawlspace.openAwards([other])
      assert(other.system.details.aiFavor === 5 && other.system.details.popularity === 2.5, 'Awards apply signed favor and exact popularity')
      const award = other.items.find((item) => item.type === 'achievement')
      const box = other.items.find((item) => item.type === 'lootBox')
      assert(box.system.sealed && box.system.quantity === 2 && box.system.tier === 'Legendary', 'Awards create sealed boxes with the correct tier and quantity')
      assert(award.getFlag('crawlspace', 'lootBoxId') === box.id, 'Achievement links to its awarded box')
    } finally { foundry.applications.api.DialogV2.prompt = originalPrompt }
    const user = game.user
    const gmDescriptor = Object.getOwnPropertyDescriptor(user, 'isGM')
    const playerUpkeepBefore = game.settings.get('crawlspace', 'playerUpkeep')
    await game.settings.set('crawlspace', 'playerUpkeep', false)
    const beforeDenied = game.time.worldTime
    const healthBeforeDenied = actor.system.health.value
    try {
      Object.defineProperty(user, 'isGM', { configurable: true, value: false })
      let denied = false
      try { await game.crawlspace.advanceTime(3600) } catch { denied = true }
      assert(denied, 'Player-role clock advancement is rejected')
      await game.crawlspace.rest(actor, 'short')
      assert(game.time.worldTime === beforeDenied && actor.system.health.value === healthBeforeDenied, 'Disabled player upkeep changes neither time nor recovery')
    } finally {
      if (gmDescriptor) Object.defineProperty(user, 'isGM', gmDescriptor)
      else delete user.isGM
      await game.settings.set('crawlspace', 'playerUpkeep', playerUpkeepBefore)
    }
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
    await actor.createEmbeddedDocuments('Item', [{ name: 'Samurai Blade Clap', type: 'skill', system: { rank: { value: 5 } } }])
    const targetCombatant = combat.combatants.find((entry) => entry.actorId === actor.id)
    await combat.update({ 'flags.crawlspace.declarations': [{ id: 'clap-test', attack: { name: 'Blade', toHit: 12, damageTypes: ['Slashing'], ranged: true }, targets: [{ combatantId: targetCombatant.id, actorUuid: actor.uuid, name: actor.name }] }] })
    await combat.respondToDeclaration('clap-test', targetCombatant.id, 'clap', 15, 10)
    assert(combat.crawl.declarations[0].targets[0].response.hit === false, 'Successful ranged Blade Clap avoids the entire hit at Rank 5')
    await combat.respondToDeclaration('clap-test', targetCombatant.id, 'clap', 5, 5)
    assert(combat.crawl.declarations[0].targets[0].response.hit === true && !combat.crawl.declarations[0].targets[0].response.half, 'Failed Blade Clap takes the full hit')
    await combat.update({ 'flags.crawlspace.declarations': [] })
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
    if (other) await other.delete()
    if (mob) await mob.delete()
    const messages = game.messages.filter((message) => !messagesBefore.has(message.id)).map((message) => message.id)
    if (messages.length) await ChatMessage.deleteDocuments(messages)
    await game.time.set(timeBefore)
    await game.settings.set('crawlspace', 'timers', timersBefore)
    await game.settings.set('crawlspace', 'clockRunning', clockBefore)
    game.togglePause(pausedBefore, { broadcast: true })
  }
}
