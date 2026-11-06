import { clearKillingBlows } from '../effects/killing-blows'
import { rankCap } from '../effects/rank-cap'
import { upkeepAction } from '../socket'
import { openGrinding } from './grinding'
import { openAwards } from './awards'
import { openLootBoxes } from '../loot/boxes'
import { advanceTime, expireActorEvent } from '../time'
import { restSeconds } from '../rules/time'
import { openTime } from './time'
import { STATS, STAT_KEYS } from '../config'
import { debuffByName } from '../rules/debuffs'
import { advancementCheck, advances, canAssignStats, pendingStatPoints, recoverCrawler, type AdvancementKind, type RecoveryKind } from '../rules/upkeep'

async function report(actor: any, title: string, lines: string[]) {
  const content = `<div class="crawlspace chat-card upkeep-card"><h3>${title}</h3><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul></div>`
  await ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor }) })
}

export async function rest(actor: any, kind: RecoveryKind, hours = 1, options: { advance?: boolean } = {}) {
  if (!game.user.isGM) return upkeepAction([actor.uuid], kind, hours)
  if (options.advance !== false) {
    await advanceTime(restSeconds(kind, hours))
  }
  const before = { health: actor.system.health.value, mana: actor.system.mana.value }
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
  if (kind === 'long' || kind === 'full') {
    await expireActorEvent('longRest', [actor])
    await clearKillingBlows(actor, 'longRest')
  }
  if (result.health > before.health) await expireActorEvent('healed', [actor])
  const restored = (result.health - before.health) / 10
  await report(actor, game.i18n.localize(`CRAWLSPACE.Upkeep.${kind}`), [
    game.i18n.format('CRAWLSPACE.Upkeep.Restored', { slots: Math.max(0, restored), mana: result.mana - before.mana }),
    ...(removed.length ? [game.i18n.format('CRAWLSPACE.Upkeep.Cleared', { list: removed.join(', ') })] : []),
  ])
}

/** Roll a d20 for each marked skill/spell; meeting its rank advances it (abilityAdvancement.ts). */
export async function advanceMarked(actor: any, kind: AdvancementKind) {
  if (!game.user.isGM) return upkeepAction([actor.uuid], kind)
  const floor = Number(actor.system.details.floor) || 1
  const lines: string[] = []
  const updates: any[] = []
  const untrained = actor.items.filter((item: any) => item.type === 'skill' && item.system.rank.base === 0)
  const candidates = floor <= 3 ? untrained.filter((item: any) => item.system.marked && item.name.trim()) : []
  if (candidates.length) {
    const chosen = candidates.length === 1 ? candidates[0].id : await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('CRAWLSPACE.Upkeep.Untrained') }, classes: ['crawlspace'], rejectClose: false,
      content: `<p>${game.i18n.localize('CRAWLSPACE.Upkeep.UntrainedHint')}</p><select name="skill">${candidates.map((item: any) => `<option value="${item.id}">${foundry.utils.escapeHTML(item.name)}</option>`).join('')}</select>`,
      ok: { callback: (_event: Event, button: any) => button.form.elements.skill.value },
    })
    if (!chosen) return
    await actor.updateEmbeddedDocuments('Item', [{ _id: chosen, 'system.rank.value': 1, 'system.marked': false }])
    const removed = untrained.filter((item: any) => item.id !== chosen).map((item: any) => item.id)
    if (removed.length) await actor.deleteEmbeddedDocuments('Item', removed)
    lines.push(game.i18n.format('CRAWLSPACE.Upkeep.Learned', { name: actor.items.get(chosen).name }))
  }
  for (const item of actor.items) {
    if (!['skill', 'spell'].includes(item.type) || !item.system.marked) continue
    const rank = Number(item.system.rank.base) || 0
    if (item.type === 'skill' && rank === 0) continue
    const { eligible: allowed } = advancementCheck(rank, kind, floor, rankCap(actor, item.name) === 20)
    const eligible = allowed && rank < rankCap(actor, item.name)
    if (!eligible) {
      if (kind === 'floor' || rank <= 4) {
        lines.push(game.i18n.format('CRAWLSPACE.Upkeep.Capped', { name: item.name, rank }))
        updates.push({ _id: item.id, 'system.marked': false })
      }
      continue
    }
    const roll = await Roll.create('1d20').evaluate()
    const advanced = advances(roll.total, rank)
    lines.push(game.i18n.format(advanced ? 'CRAWLSPACE.Upkeep.Advanced' : 'CRAWLSPACE.Upkeep.NotAdvanced', { name: item.name, roll: roll.total, rank, next: rank + 1 }))
    updates.push({ _id: item.id, 'system.marked': false, ...(advanced ? { 'system.rank.value': item.system.rank.value + 1 } : {}) })
  }
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates)
  if (kind === 'safeRoom') await expireActorEvent('safeRoom', [actor])
  if (kind === 'floor') {
    await expireActorEvent('leaveFloor', [actor])
    await clearKillingBlows(actor, 'leaveFloor')
    await actor.update({ 'system.details.floor': floor + 1 })
    lines.push(game.i18n.format('CRAWLSPACE.Upkeep.FloorAdvanced', { floor: floor + 1 }))
  }
  if (kind === 'safeRoom') await actor.update({ 'system.upkeep.lastSafeRoomLevel': actor.system.details.level })
  if (kind === 'safeRoom' && actor.items.some((item: any) => item.type === 'lootBox' && item.system.sealed)) await openLootBoxes(actor)
  await report(actor, game.i18n.localize(`CRAWLSPACE.Upkeep.${kind}`), lines.length ? lines : [game.i18n.localize('CRAWLSPACE.Upkeep.NothingMarked')])
}

export async function levelUp(actor: any) {
  if (!game.user.isGM) return upkeepAction([actor.uuid], 'level')
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
    ok: { callback: (_event: Event, button: any) => Object.fromEntries(STAT_KEYS.map((key) => [key, Math.max(0, Math.floor(Number(button.form.elements[key].value) || 0))])) },
  })
  if (!additions) return
  const total = Object.values(additions as Record<string, number>).reduce((sum, value) => sum + value, 0)
  if (total !== points) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Upkeep.AssignAll', { points }))
  const update: Record<string, number> = { 'system.upkeep.allocatedThroughLevel': system.details.level }
  for (const key of STAT_KEYS) update[`system.attributes.${key}.value`] = (Number(system.attributes[key].value) || 0) + (additions as any)[key]
  await actor.update(update)
}

/** One GM session advances time once, regardless of the number of participating crawlers. */
export async function performUpkeep(uuids: string[], kind: string, hours = 1, skipTime = false) {
  if (!game.user.isGM) return
  const actors = (await Promise.all([...new Set(uuids)].map((uuid) => fromUuid(uuid)))).filter((actor) => actor?.type === 'crawler')
  if (!actors.length) return
  if (['short', 'long', 'full', 'hourly'].includes(kind)) {
    const seconds = restSeconds(kind as RecoveryKind, hours)
    if (!skipTime) await advanceTime(seconds)
    for (const actor of actors) await rest(actor, kind as RecoveryKind, hours, { advance: false })
  } else if (['safeRoom', 'session', 'floor'].includes(kind)) {
    for (const actor of actors) await advanceMarked(actor, kind as AdvancementKind)
  } else if (kind === 'grinding') {
    await openGrinding(actors, hours, { advance: !skipTime })
  } else if (kind === 'level') {
    for (const actor of actors) await levelUp(actor)
  }
}

export async function openUpkeep(actor?: any) {
  const gm = game.user.isGM
  if (!gm && !game.settings.get('crawlspace', 'playerUpkeep')) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Upkeep.GMRequired'))
  const actors = actor ? [actor] : game.actors.filter((entry: any) => entry.type === 'crawler')
  const esc = foundry.utils.escapeHTML
  const labels = ['short', 'long', 'full', 'hourly', 'safeRoom', 'session', 'floor', 'grinding', 'assign', ...(gm ? ['level', 'awards', 'time'] : [])]
  const content = `<p>${game.i18n.localize(gm ? 'CRAWLSPACE.Upkeep.Hint' : 'CRAWLSPACE.Upkeep.NoTime')}</p>
    ${actors.map((entry: any) => `<label class="upkeep-participant"><input type="checkbox" name="actor" value="${esc(entry.uuid)}" checked> ${esc(entry.name)}</label>`).join('')}
    <div class="form-group"><label>${game.i18n.localize('CRAWLSPACE.Time.Hours')}</label><input name="hours" type="number" min="1" max="30" value="1"></div>`
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize('CRAWLSPACE.Upkeep.Party') }, position: { width: 560 }, content, rejectClose: false,
    classes: ['crawlspace', 'upkeep-dialog'],
    buttons: labels.map((kind) => ({ action: kind, label: game.i18n.localize(`CRAWLSPACE.Upkeep.Actions.${kind}`), callback: (_event: Event, button: any) => ({ kind, hours: Number(button.form.elements.hours.value), uuids: [...button.form.querySelectorAll('[name=actor]:checked')].map((input: any) => input.value) }) })),
  })
  if (!answer) return
  if (answer.kind === 'time') return openTime()
  const chosen = actors.filter((entry: any) => answer.uuids.includes(entry.uuid))
  if (!chosen.length) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Time.SelectActors'))
  try {
    if (answer.kind === 'awards') return openAwards(chosen)
    if (answer.kind === 'assign') { for (const entry of chosen) await assignStats(entry); return }
    return await upkeepAction(answer.uuids, answer.kind, answer.hours)
  } catch (error: any) { ui.notifications.error(error.message) }
}

export function registerUpkeep() {
  game.settings.register('crawlspace', 'playerUpkeep', {
    name: 'CRAWLSPACE.Upkeep.PlayerSetting', hint: 'CRAWLSPACE.Upkeep.PlayerSettingHint',
    scope: 'world', config: true, restricted: true, type: Boolean, default: false,
  })
  Hooks.on('getSceneControlButtons', (controls: any) => {
    if (!game.user.isGM || !controls.tokens) return
    controls.tokens.tools.crawlspaceUpkeep = { name: 'crawlspaceUpkeep', title: 'CRAWLSPACE.Upkeep.Party', icon: 'fa-solid fa-campground', button: true, onChange: () => openUpkeep() }
  })
}
