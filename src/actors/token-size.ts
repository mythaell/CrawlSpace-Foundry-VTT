/**
 * Prototype tokens follow the creature's size (rules/token-size.ts): when an actor is made or imported, when its
 * size changes, and once for the actors a world already had. Placed tokens keep their size.
 */
import { actorSize, resizedPrototype, sizedPrototype } from '../rules/token-size'

const prototypeOf = (source: any) => ({ width: source?.prototypeToken?.width, height: source?.prototypeToken?.height })

export function registerTokenSize() {
  game.settings.register('crawlspace', 'tokenSizesMigrated', { scope: 'world', config: false, type: Boolean, default: false })

  Hooks.on('preCreateActor', (actor: any) => {
    const sized = sizedPrototype(actorSize(actor.type, actor.system), prototypeOf(actor))
    if (sized) actor.updateSource({ 'prototypeToken.width': sized.width, 'prototypeToken.height': sized.height })
  })

  Hooks.on('preUpdateActor', (actor: any, changes: any) => {
    const path = actor.type === 'crawler' ? 'system.details.size' : 'system.size'
    if (actor.type === 'npc' || !foundry.utils.hasProperty(changes, path)) return
    // A width set in the same update wins.
    if (foundry.utils.hasProperty(changes, 'prototypeToken.width') || foundry.utils.hasProperty(changes, 'prototypeToken.height')) return
    const sized = resizedPrototype(actorSize(actor.type, actor.system), foundry.utils.getProperty(changes, path), prototypeOf(actor))
    if (sized) foundry.utils.mergeObject(changes, { prototypeToken: sized })
  })

  Hooks.once('ready', async () => {
    if (!game.user.isActiveGM || game.settings.get('crawlspace', 'tokenSizesMigrated')) return
    const updates = game.actors.contents
      .map((actor: any) => ({ actor, sized: sizedPrototype(actorSize(actor.type, actor.system), prototypeOf(actor)) }))
      .filter(({ sized }: any) => sized)
      .map(({ actor, sized }: any) => ({ _id: actor.id, 'prototypeToken.width': sized.width, 'prototypeToken.height': sized.height }))
    try {
      if (updates.length) await foundry.documents.Actor.implementation.updateDocuments(updates)
      await game.settings.set('crawlspace', 'tokenSizesMigrated', true)
    } catch (error) {
      console.error('CrawlSpace | token size migration', error)
    }
  })
}
