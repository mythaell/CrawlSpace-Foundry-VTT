import { performUpkeep } from './apps/upkeep'
import { createBuiltCrawler, type Draft } from './apps/builder'
import { giveCondition, mayGive } from './effects/use-conditions'
/**
 * GM relay. Players can't update actors or combats they don't own, so those requests travel over the system
 * socket and the active GM's client performs them. Only whitelisted methods can be called this way.
 */
const CHANNEL = 'system.crawlspace'

const ACTOR_METHODS = new Set(['applyDamage', 'applyHealing', 'restoreHealth', 'addDebuff', 'awardKillingBlow', 'endMinion'])
const COMBAT_METHODS = new Set(['markDone', 'respondToDeclaration', 'recordDeclarationDamage'])

type Request =
  | { type: 'upkeep'; uuids: string[]; kind: string; hours: number; userId: string }
  | { type: 'actor'; uuid: string; method: string; args: unknown[] }
  | { type: 'combat'; combatId: string; method: string; args: unknown[]; userId: string }
  | { type: 'buildCrawler'; draft: Draft; userId: string }
  | { type: 'builderError'; userId: string; error: string }
  | { type: 'condition'; effectUuid: string; targetUuid: string; userId: string }

async function perform(request: Request) {
  if (request.type === 'buildCrawler') {
    // The builder checks every choice again here; a refusal goes back to the player.
    try {
      // GMs build on their own client; a relayed request naming a GM would skip the roll check.
      if (game.users.get(request.userId)?.isGM !== false) return
      await createBuiltCrawler(request.draft, request.userId)
    } catch (error: any) {
      game.socket.emit(CHANNEL, { type: 'builderError', userId: request.userId, error: error.message })
    }
    return
  }
  if (request.type === 'condition') {
    // Only the caster's owners (or a GM) may hand out a skill or spell's condition.
    const effect = await fromUuid(request.effectUuid)
    const target = await fromUuid(request.targetUuid)
    if (!effect || target?.documentName !== 'Actor' || !mayGive(effect, game.users.get(request.userId))) return
    await giveCondition(effect, target)
    return
  }
  if (request.type === 'upkeep') {
    const user = game.users.get(request.userId)
    if (!user || !Array.isArray(request.uuids) || request.uuids.length > 100) return
    if (!user.isGM) {
      if (!game.settings.get('crawlspace', 'playerUpkeep')) return
      for (const uuid of request.uuids) {
        const actor = await fromUuid(uuid)
        if (!actor?.testUserPermission(user, 'OWNER')) return
      }
    }
    return performUpkeep(request.uuids, request.kind, request.hours, !user.isGM)
  }
  if (request.type === 'actor') {
    if (!ACTOR_METHODS.has(request.method)) return
    const actor = await fromUuid(request.uuid)
    if (actor) await actor[request.method](...request.args)
  } else if (request.type === 'combat') {
    if (!COMBAT_METHODS.has(request.method)) return
    const combat = game.combats.get(request.combatId)
    if (combat) await combat[request.method](...request.args, { userId: request.userId })
  }
}

let queue = Promise.resolve()

export function registerSocket() {
  game.socket.on(CHANNEL, (request: Request) => {
    if (request.type === 'builderError') {
      if (request.userId === game.user.id) ui.notifications.error(request.error)
      return
    }
    if (game.user.isActiveGM) queue = queue.then(() => perform(request)).catch((error) => { console.error('CrawlSpace | socket', error); ui.notifications.error(error.message) })
  })
}

function relay(request: Request) {
  if (!game.users.activeGM) {
    ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NeedGM'))
    return
  }
  game.socket.emit(CHANNEL, request)
}

/** Call an actor method on the active GM's client, for work only a GM may do (ending a minion swaps tokens). */
export function gmActorAction(actor: any, method: string, ...args: unknown[]) {
  if (game.user.isGM) return actor[method](...args)
  relay({ type: 'actor', uuid: actor.uuid, method, args })
}

/** Call an actor method directly when permitted, otherwise through the GM. */
export async function actorAction(actor: any, method: string, ...args: unknown[]) {
  if (actor.isOwner) return actor[method](...args)
  relay({ type: 'actor', uuid: actor.uuid, method, args })
}

/** Put a condition on an actor the user doesn't own, through the GM. */
export function conditionAction(effect: any, target: any) {
  relay({ type: 'condition', effectUuid: effect.uuid, targetUuid: target.uuid, userId: game.user.id })
}

/** Call a combat method as the GM. */
export async function combatAction(combat: any, method: string, ...args: unknown[]) {
  if (game.user.isGM) return combat[method](...args, { userId: game.user.id })
  relay({ type: 'combat', combatId: combat.id, method, args, userId: game.user.id })
}

/** Route party upkeep through the GM relay; players never supply the time-skip policy. */
export async function upkeepAction(uuids: string[], kind: string, hours = 1) {
  const request: Request = { type: 'upkeep', uuids, kind, hours, userId: game.user.id }
  if (game.user.isGM) return perform(request)
  if (!game.settings.get('crawlspace', 'playerUpkeep')) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Upkeep.GMRequired'))
  relay(request)
}
