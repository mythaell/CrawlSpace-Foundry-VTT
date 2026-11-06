/**
 * Raised minions (minions.ts, PartySceneCanvas raiseTokenAsMinion). A "Raise as minion" condition landing on a
 * mob turns that same mob into its caster's minion: it rises at half its Health slots, its tokens turn friendly,
 * it fights on the crawlers' side, and the caster's players can move it and roll for it (but not edit it).
 * Nothing else about the mob changes. When it dies again or the raising condition ends (removed, disabled or
 * expired), it goes back to being the dead mob it was.
 *
 * The active GM's client does both, since players can't change others' ownership or tokens.
 */
import { raisedHealth } from '../crawlspace-shared/shared/minions'
import { ownersOf } from './companions'

const RAISE = { type: 'crawlspace.special', key: 'raiseMinion' }

export const raisesMinion = (effect: any) =>
  !effect.disabled && (effect.system?.changes ?? effect.changes ?? []).some((change: any) => change.type === RAISE.type && change.key === RAISE.key)

/** Is this actor a mob raised as a minion right now? */
export const isRaised = (actor: any) => !!actor?.system?.minion?.temporary

/** The crawler who cast the raising condition: its origin's actor, else the applying user's character. */
function casterOf(effect: any, userId: string) {
  const origin = effect.origin ? fromUuidSync(effect.origin) : null
  const actor = origin?.actor ?? (origin?.documentName === 'Actor' ? origin : null)
  if (actor?.type === 'crawler') return actor
  return game.users.get(userId)?.character ?? null
}

/** The token documents showing this actor: its own token if unlinked, else its tokens on every scene. */
const tokensOf = (actor: any): any[] =>
  actor.isToken ? [actor.token] : game.scenes.contents.flatMap((scene: any) => scene.tokens.filter((token: any) => token.actorLink && token.actorId === actor.id))

const combatantsOf = (tokens: any[]) => {
  const ids = new Set(tokens.map((token) => token.id))
  return game.combats.contents.flatMap((combat: any) => combat.combatants.filter((entry: any) => ids.has(entry.tokenId)))
}

const card = (actor: any, content: string) => ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="crawl-card"><p>${content}</p></div>` })

export async function raiseMinion(effect: any, userId: string) {
  const mob = effect.parent
  if (isRaised(mob)) return
  const caster = casterOf(effect, userId)
  const max = Number(mob.system.health.max) || 1
  const health = raisedHealth(max)
  const owners = ownersOf(caster)
  // What changes, so it can all go back: who owned it, who it followed, and which way each token faced.
  const before = { ownership: foundry.utils.deepClone(mob.ownership), master: mob.system.master ?? '' }
  await mob.update({
    'system.master': caster?.uuid ?? '',
    'system.minion': { temporary: true, condition: effect.name },
    'system.slotsLost': max - health,
    ownership: { ...mob.ownership, ...owners },
    'flags.crawlspace.raised': before,
  })
  // It rises alive: the corpse's "dead" marker goes.
  const dead = mob.effects.filter((entry: any) => entry.statuses?.has?.('dead')).map((entry: any) => entry.id)
  if (dead.length) await mob.deleteEmbeddedDocuments('ActiveEffect', dead)
  const tokens = tokensOf(mob)
  for (const token of tokens)
    await token.update({ disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY, 'flags.crawlspace.raisedDisposition': token.disposition })
  for (const combatant of combatantsOf(tokens)) await combatant.update({ defeated: false })
  const name = foundry.utils.escapeHTML(mob.name)
  const casterName = foundry.utils.escapeHTML(caster?.name ?? game.i18n.localize('CRAWLSPACE.Minion.NoCaster'))
  await card(mob, game.i18n.format('CRAWLSPACE.Minion.Raised', { name, caster: casterName, health, max }))
  return mob
}

const ending = new Set<string>()

/** End a raised minion: it is the mob it was again, dead, with its old owners and token dispositions. */
export async function endMinion(mob: any, reason: 'died' | 'ended' | 'released') {
  if (!isRaised(mob) || ending.has(mob.uuid)) return
  ending.add(mob.uuid)
  try {
    const before = mob.flags?.crawlspace?.raised ?? { ownership: {}, master: '' }
    // Owners the raising added go back to inheriting the default.
    const ownership: Record<string, number> = { ...before.ownership }
    for (const id of Object.keys(mob.ownership)) if (!(id in ownership)) ownership[id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT
    await mob.update({
      'system.master': before.master ?? '',
      'system.minion': { temporary: false, condition: '' },
      'system.slotsLost': Number(mob.system.health.max) || 0,
      ownership,
      'flags.crawlspace.-=raised': null,
    })
    const raises = mob.effects.filter(raisesMinion).map((effect: any) => effect.id)
    if (raises.length) await mob.deleteEmbeddedDocuments('ActiveEffect', raises)
    if (!mob.statuses.has('dead')) await mob.toggleStatusEffect('dead', { active: true, overlay: true })
    const tokens = tokensOf(mob)
    for (const token of tokens) {
      const disposition = token.flags?.crawlspace?.raisedDisposition
      if (disposition === undefined) continue
      await token.update({ disposition, 'flags.crawlspace.-=raisedDisposition': null })
    }
    for (const combatant of combatantsOf(tokens)) await combatant.update({ defeated: true })
    await card(mob, game.i18n.format(`CRAWLSPACE.Minion.Ended.${reason}`, { name: foundry.utils.escapeHTML(mob.name) }))
  } finally {
    ending.delete(mob.uuid)
  }
}

/** Paths a player may still change on a raised minion they don't fully control: the damage it takes. */
const PLAY_PATHS = ['system.slotsLost', 'flags']

export function registerMinions() {
  Hooks.on('createActiveEffect', (effect: any, _options: any, userId: string) => {
    const actor = effect.parent
    if (!game.user.isActiveGM || actor?.documentName !== 'Actor' || actor.type !== 'mob' || !raisesMinion(effect)) return
    raiseMinion(effect, userId).catch((error: any) => console.error('CrawlSpace | raise minion', error))
  })
  const conditionGone = (effect: any) => {
    const actor = effect.parent
    if (!game.user.isActiveGM || actor?.documentName !== 'Actor' || !isRaised(actor) || actor.effects.some(raisesMinion)) return
    endMinion(actor, 'ended').catch((error: any) => console.error('CrawlSpace | end minion', error))
  }
  Hooks.on('deleteActiveEffect', conditionGone)
  Hooks.on('updateActiveEffect', conditionGone)
  Hooks.on('updateActor', (actor: any) => {
    if (!game.user.isActiveGM || !isRaised(actor) || Number(actor.system.health?.value) > 0) return
    endMinion(actor, 'died').catch((error: any) => console.error('CrawlSpace | end minion', error))
  })

  // Players move and roll for a raised minion but can't edit it.
  const locked = () => {
    ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Minion.Locked'))
    return false
  }
  Hooks.on('preUpdateActor', (actor: any, changes: any, _options: any, userId: string) => {
    if (!isRaised(actor) || game.users.get(userId)?.isGM) return
    const paths = Object.keys(foundry.utils.flattenObject(changes)).filter((path) => path !== '_id')
    if (paths.some((path) => !PLAY_PATHS.some((allowed) => path === allowed || path.startsWith(`${allowed}.`)))) return locked()
  })
  for (const hook of ['preCreateItem', 'preUpdateItem', 'preDeleteItem'])
    Hooks.on(hook, (item: any, ...rest: any[]) => {
      const userId = rest[rest.length - 1]
      if (isRaised(item.parent) && !game.users.get(userId)?.isGM) return locked()
    })
}
