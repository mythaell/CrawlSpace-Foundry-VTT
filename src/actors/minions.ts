/**
 * Minions (minions.ts, PartySceneCanvas raiseTokenAsMinion). A "Raise as minion" condition landing on a mob
 * raises it: a `minion` actor copies the creature at half its Health slots, its token switches to that actor,
 * and the caster's players control it on the crawlers' side. When the minion dies or the raising condition
 * ends (removed, disabled or expired), its token returns to the mob as the dead creature it was.
 * The active GM's client does both, since players can't create actors or change others' tokens.
 */
import { raisedHealth } from '../crawlspace-shared/shared/minions'

const RAISE = { type: 'crawlspace.special', key: 'raiseMinion' }

export const raisesMinion = (effect: any) =>
  !effect.disabled && (effect.system?.changes ?? effect.changes ?? []).some((change: any) => change.type === RAISE.type && change.key === RAISE.key)

/** The crawler who cast the raising condition: its origin's actor, else the applying user's character. */
function casterOf(effect: any, userId: string) {
  const origin = effect.origin ? fromUuidSync(effect.origin) : null
  const actor = origin?.actor ?? (origin?.documentName === 'Actor' ? origin : null)
  if (actor?.type === 'crawler') return actor
  return game.users.get(userId)?.character ?? null
}

/** The scene token showing this actor: its own token for an unlinked actor, else the first on the viewed scene. */
const tokenOf = (actor: any) => actor.token ?? actor.getActiveTokens(false, true)[0] ?? null

export async function raiseMinion(effect: any, userId: string) {
  const mob = effect.parent
  const token = tokenOf(mob)
  if (!token) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Minion.NoToken', { name: mob.name }))
  const caster = casterOf(effect, userId)
  const data = mob.toObject()
  const max = Number(mob.system.health.max) || 1
  const health = raisedHealth(max)
  // The caster's players own the minion, as the app hands it to the caster's controller.
  const owners = Object.fromEntries(Object.entries(caster?.ownership ?? {}).filter(([id, level]) => id !== 'default' && Number(level) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER))
  const minion = await Actor.implementation.create({
    name: mob.name,
    type: 'minion',
    img: mob.img,
    system: { ...data.system, slotsLost: max - health, minion: { caster: caster?.uuid ?? '', condition: effect.name } },
    items: data.items,
    // It rises alive: the corpse's "dead" marker stays behind.
    effects: data.effects.filter((entry: any) => !(entry.statuses ?? []).includes('dead')),
    prototypeToken: { ...data.prototypeToken, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY },
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, ...owners },
    flags: { crawlspace: { raisedFrom: mob.uuid } },
  })
  const original = { actorId: token.actorId, actorLink: token.actorLink, disposition: token.disposition, delta: token.delta?.toObject?.() ?? null }
  await token.update({ actorId: minion.id, actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, 'flags.crawlspace.raisedFrom': original })
  for (const combatant of game.combats.contents.flatMap((combat: any) => combat.combatants.filter((entry: any) => entry.tokenId === token.id)))
    await combatant.update({ actorId: minion.id, defeated: false })
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: minion }),
    content: `<div class="crawl-card"><p>${game.i18n.format('CRAWLSPACE.Minion.Raised', { name: foundry.utils.escapeHTML(mob.name), caster: foundry.utils.escapeHTML(caster?.name ?? game.i18n.localize('CRAWLSPACE.Minion.NoCaster')), health, max })}</p></div>`,
  })
  return minion
}

const ending = new Set<string>()

/** End a minion: every token showing it goes back to its mob, dead, and the minion actor is deleted. */
export async function endMinion(minion: any, reason: 'died' | 'ended' | 'released') {
  if (ending.has(minion.id)) return
  ending.add(minion.id)
  try {
    for (const scene of game.scenes)
      for (const token of scene.tokens.filter((entry: any) => entry.actorId === minion.id && entry.flags?.crawlspace?.raisedFrom)) {
        const original = token.flags.crawlspace.raisedFrom
        await token.update({ actorId: original.actorId, actorLink: original.actorLink, disposition: original.disposition, 'flags.crawlspace.-=raisedFrom': null })
        if (!original.actorLink && original.delta) await token.delta?.update?.(original.delta, { diff: false, recursive: false })
        const mob = token.actor
        if (!mob) continue
        // The creature was dead before it rose, and it is dead again; the raising condition stays with the minion.
        const raises = mob.effects.filter(raisesMinion).map((effect: any) => effect.id)
        if (raises.length) await mob.deleteEmbeddedDocuments('ActiveEffect', raises)
        await mob.update({ 'system.slotsLost': Number(mob.system.health.max) || 0 })
        if (!mob.statuses.has('dead')) await mob.toggleStatusEffect('dead', { active: true, overlay: true })
        for (const combatant of game.combats.contents.flatMap((combat: any) => combat.combatants.filter((entry: any) => entry.tokenId === token.id)))
          await combatant.update({ actorId: original.actorId, defeated: true })
      }
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: minion }), content: `<div class="crawl-card"><p>${game.i18n.format(`CRAWLSPACE.Minion.Ended.${reason}`, { name: foundry.utils.escapeHTML(minion.name) })}</p></div>` })
    await minion.delete()
  } finally {
    ending.delete(minion.id)
  }
}

/** A minion still raised: alive, with an active raising condition. */
const stillRaised = (actor: any) => actor.effects.some(raisesMinion)

export function registerMinions() {
  Hooks.on('createActiveEffect', (effect: any, _options: any, userId: string) => {
    const actor = effect.parent
    if (!game.user.isActiveGM || actor?.documentName !== 'Actor' || actor.type !== 'mob' || !raisesMinion(effect)) return
    raiseMinion(effect, userId).catch((error: any) => console.error('CrawlSpace | raise minion', error))
  })
  const conditionGone = (effect: any) => {
    const actor = effect.parent
    if (!game.user.isActiveGM || actor?.documentName !== 'Actor' || actor.type !== 'minion' || stillRaised(actor)) return
    endMinion(actor, 'ended').catch((error: any) => console.error('CrawlSpace | end minion', error))
  }
  Hooks.on('deleteActiveEffect', conditionGone)
  Hooks.on('updateActiveEffect', conditionGone)
  Hooks.on('updateActor', (actor: any) => {
    if (!game.user.isActiveGM || actor.type !== 'minion' || Number(actor.system.health?.value) > 0) return
    endMinion(actor, 'died').catch((error: any) => console.error('CrawlSpace | end minion', error))
  })
}
