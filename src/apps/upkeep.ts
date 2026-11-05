import { STATS, STAT_KEYS } from '../config'
import { debuffByName } from '../rules/debuffs'
import { advancementCheck, advances, canAssignStats, pendingStatPoints, recoverCrawler, type AdvancementKind, type RecoveryKind } from '../rules/upkeep'

async function report(actor: any, title: string, lines: string[]) {
  const content = `<div class="crawlspace chat-card upkeep-card"><h3>${title}</h3><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul></div>`
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) })
}

export async function rest(actor: any, kind: RecoveryKind, hours = 1) {
  const system = actor.system
  const result = recoverCrawler(kind, system.health.value, system.mana.value, system.mana.max, hours)
  await actor.update({ 'system.health.value': result.health, 'system.mana.value': result.mana, 'system.health.dyingCountdown': null })
  const removed: string[] = []
  for (const name of result.cleared) {
    const debuff = debuffByName(name)
    if (!debuff) continue
    const effects = actor.effects.filter((effect: any) => effect.statuses.has(debuff.id))
    if (effects.length) {
      removed.push(name)
      await actor.deleteEmbeddedDocuments('ActiveEffect', effects.map((effect: any) => effect.id))
    }
  }
  const restored = (result.health - system.health.value) / 10
  await report(actor, game.i18n.localize(`CRAWLSPACE.Upkeep.${kind}`), [
    game.i18n.format('CRAWLSPACE.Upkeep.Restored', { slots: Math.max(0, restored), mana: result.mana - system.mana.value }),
    ...(removed.length ? [game.i18n.format('CRAWLSPACE.Upkeep.Cleared', { list: removed.join(', ') })] : []),
  ])
}

/** Roll a d20 for each marked skill/spell; meeting its rank advances it (abilityAdvancement.ts). */
export async function advanceMarked(actor: any, kind: AdvancementKind) {
  const floor = Number(actor.system.details.floor) || 1
  const lines: string[] = []
  const updates: any[] = []
  for (const item of actor.items) {
    if (!['skill', 'spell'].includes(item.type) || !item.system.marked) continue
    const rank = Number(item.system.rank.value) || 0
    const { eligible } = advancementCheck(rank, kind, floor)
    if (!eligible) {
      if (kind === 'floor' || rank <= 4) {
        lines.push(game.i18n.format('CRAWLSPACE.Upkeep.Capped', { name: item.name, rank }))
        updates.push({ _id: item.id, 'system.marked': false })
      }
      continue
    }
    const roll = await new Roll('1d20').evaluate()
    const advanced = advances(roll.total, rank)
    lines.push(game.i18n.format(advanced ? 'CRAWLSPACE.Upkeep.Advanced' : 'CRAWLSPACE.Upkeep.NotAdvanced', { name: item.name, roll: roll.total, rank, next: rank + 1 }))
    updates.push({ _id: item.id, 'system.marked': false, ...(advanced ? { 'system.rank.value': rank + 1 } : {}) })
  }
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates)
  if (kind === 'floor') {
    await actor.update({ 'system.details.floor': floor + 1 })
    lines.push(game.i18n.format('CRAWLSPACE.Upkeep.FloorAdvanced', { floor: floor + 1 }))
  }
  if (kind === 'safeRoom') await actor.update({ 'system.upkeep.lastSafeRoomLevel': actor.system.details.level })
  await report(actor, game.i18n.localize(`CRAWLSPACE.Upkeep.${kind}`), lines.length ? lines : [game.i18n.localize('CRAWLSPACE.Upkeep.NothingMarked')])
}

export async function levelUp(actor: any) {
  const level = (Number(actor.system.details.level) || 1) + 1
  await actor.update({ 'system.details.level': level })
  const pending = pendingStatPoints(level, actor.system.upkeep.allocatedThroughLevel)
  await report(actor, game.i18n.format('CRAWLSPACE.Upkeep.Level', { level }), [game.i18n.format('CRAWLSPACE.Upkeep.PointsWaiting', { points: pending })])
}

export async function assignStats(actor: any) {
  const system = actor.system
  const points = pendingStatPoints(system.details.level, system.upkeep.allocatedThroughLevel)
  if (!points) return ui.notifications.info(game.i18n.localize('CRAWLSPACE.Upkeep.NoPoints'))
  if (!canAssignStats(system.details.floor)) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Upkeep.FloorThree'))
  const content = `<p>${game.i18n.format('CRAWLSPACE.Upkeep.AssignHint', { points })}</p>${STAT_KEYS.map(
    (key) => `<div class="form-group"><label>${STATS[key].label} (${system.attributes[key].value ?? 0})</label><input type="number" name="${key}" value="0" min="0" step="1"></div>`,
  ).join('')}`
  const additions = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize('CRAWLSPACE.Upkeep.Assign') },
    content,
    rejectClose: false,
    ok: { callback: (_event: Event, button: any) => Object.fromEntries(STAT_KEYS.map((key) => [key, Math.max(0, Math.trunc(Number(button.form.elements[key].value) || 0))])) },
  })
  if (!additions) return
  const total = Object.values(additions as Record<string, number>).reduce((sum, value) => sum + value, 0)
  if (total !== points) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Upkeep.AssignAll', { points }))
  const update: Record<string, number> = { 'system.upkeep.allocatedThroughLevel': system.details.level }
  for (const key of STAT_KEYS) update[`system.attributes.${key}.value`] = (Number(system.attributes[key].value) || 0) + (additions as any)[key]
  await actor.update(update)
}

export async function openUpkeep(actor: any) {
  const action = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.format('CRAWLSPACE.Upkeep.Title', { name: actor.name }) },
    content: `<p>${game.i18n.localize('CRAWLSPACE.Upkeep.Hint')}</p>`,
    rejectClose: false,
    classes: ['crawlspace', 'upkeep-dialog'],
    buttons: [
      { action: 'short', label: game.i18n.localize('CRAWLSPACE.Upkeep.short'), icon: 'fa-solid fa-mug-hot' },
      { action: 'long', label: game.i18n.localize('CRAWLSPACE.Upkeep.long'), icon: 'fa-solid fa-bed' },
      { action: 'full', label: game.i18n.localize('CRAWLSPACE.Upkeep.full'), icon: 'fa-solid fa-sun' },
      { action: 'safeRoom', label: game.i18n.localize('CRAWLSPACE.Upkeep.safeRoom'), icon: 'fa-solid fa-door-closed' },
      { action: 'session', label: game.i18n.localize('CRAWLSPACE.Upkeep.session'), icon: 'fa-solid fa-flag-checkered' },
      { action: 'floor', label: game.i18n.localize('CRAWLSPACE.Upkeep.floor'), icon: 'fa-solid fa-stairs' },
      { action: 'level', label: game.i18n.localize('CRAWLSPACE.Upkeep.LevelUp'), icon: 'fa-solid fa-arrow-up' },
      { action: 'assign', label: game.i18n.localize('CRAWLSPACE.Upkeep.Assign'), icon: 'fa-solid fa-chart-simple' },
    ],
  })
  switch (action) {
    case 'short':
    case 'long':
    case 'full':
      return rest(actor, action)
    case 'safeRoom':
    case 'session':
    case 'floor':
      return advanceMarked(actor, action)
    case 'level':
      return levelUp(actor)
    case 'assign':
      return assignStats(actor)
  }
}
