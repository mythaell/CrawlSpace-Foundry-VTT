import { performUpkeep } from './apps/upkeep'
/**
 * GM relay. Players can't update actors or combats they don't own, so those requests travel over the system
 * socket and the active GM's client performs them. Only whitelisted methods can be called this way.
 */
const CHANNEL = 'system.crawlspace'

const ACTOR_METHODS = new Set(['applyDamage', 'applyHealing', 'restoreHealth', 'addDebuff', 'awardKillingBlow'])
const COMBAT_METHODS = new Set(['markDone', 'respondToDeclaration', 'recordDeclarationDamage'])

type Request =
  | { type: 'upkeep'; uuids: string[]; kind: string; hours: number; userId: string }
  | { type: 'actor'; uuid: string; method: string; args: unknown[] }
  | { type: 'combat'; combatId: string; method: string; args: unknown[]; userId: string }

async function perform(request: Request) {
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

/** Call an actor method directly when permitted, otherwise through the GM. */
export async function actorAction(actor: any, method: string, ...args: unknown[]) {
  if (actor.isOwner) return actor[method](...args)
  relay({ type: 'actor', uuid: actor.uuid, method, args })
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
