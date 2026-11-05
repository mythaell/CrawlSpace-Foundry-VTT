import { expireKillingBlows } from './effects/killing-blows'
/** World-time coordination: Foundry owns the clock, durations and expiry; upkeep advances it once. */
import { regenAdvance, hasRegen } from './effects/specials'
import { effectDuration } from './import/convert'
import { cooldownLabel } from './effects/cooldowns'

let updates: Promise<any> = Promise.resolve()
let advancing = false

/** World actors plus unlinked actors on every scene, deduplicated by UUID. */
export function timedActors(): any[] {
  const actors = new Map<string, any>([...game.actors].map((actor: any) => [actor.uuid, actor]))
  for (const scene of game.scenes) {
    for (const token of scene.tokens) if (!token.actorLink && token.actor) actors.set(token.actor.uuid, token.actor)
  }
  return [...actors.values()]
}

/** Trigger a native expiry event only for the actors participating in it. */
export async function expireActorEvent(event: string, actors: any[]) {
  await foundry.documents.ActiveEffect.registry.refresh(event, { actors: new Set(actors), combat: game.combat })
}

/** Standard conditions can end at combat's end OR their time limit (debuffs.ts). */
export async function expireCombatConditions(actors: any[]) {
  for (const actor of actors) {
    const effects = actor.effects.filter((effect: any) => effect.active && /\bend of (?:the )?combat\b/i.test(effect.system.durationText))
    if (effects.length) await actor.updateEmbeddedDocuments('ActiveEffect', effects.map((effect: any) => ({ _id: effect.id, duration: { value: 0, units: 'seconds', expiry: null, expired: true } })))
  }
}

/** Await regen writes caused by a clock update before applying rest recovery. */
export async function settleTime() {
  await updates
}

/** Serialize local GM skips; combat uses core's round advancement instead. */
export async function advanceTime(seconds: number) {
  if (!game.user.isGM) throw new Error(game.i18n.localize('CRAWLSPACE.Time.GMOnly'))
  if (!Number.isSafeInteger(seconds) || seconds < 0) throw new Error(game.i18n.localize('CRAWLSPACE.Time.InvalidDuration'))
  if (advancing) throw new Error(game.i18n.localize('CRAWLSPACE.Time.Busy'))
  if (game.combats.some((combat: any) => combat.started && combat.active)) throw new Error(game.i18n.localize('CRAWLSPACE.Time.InCombat'))
  advancing = true
  try {
    if (seconds) await game.time.advance(seconds)
    await settleTime()
  } finally {
    advancing = false
  }
}

/** Capture regeneration before core expires effects, then serialize document writes across clock ticks. */
export function registerTime() {
  // Instantiate off-scene token actors so core registers their timed effects too.
  timedActors()
  Hooks.on('updateActor', (actor: any, changes: any) => {
    if (game.user.isActiveGM && foundry.utils.hasProperty(changes, 'system.details.floor')) void expireKillingBlows(actor)
  })
  Hooks.on('preCreateActiveEffect', (effect: any) => {
    if (effect.parent?.documentName !== 'Actor' || effect._source.duration?.value != null || effect._source.duration?.expiry) return
    const duration = effectDuration(effect.system.durationText)
    if (duration) effect.updateSource({ duration })
  })
  Hooks.on('updateWorldTime', (_worldTime: number, delta: number) => {
    const actors = timedActors()
    for (const actor of actors) {
      if (!actor.sheet?.rendered) continue
      for (const label of actor.sheet.element.querySelectorAll('[data-cooldown-id]')) {
        const effect = actor.effects.get(label.dataset.cooldownId)
        if (effect) label.textContent = cooldownLabel(effect)
      }
    }
    if (!game.user.isActiveGM || !(delta > 0)) return
    const snapshots = actors.filter(hasRegen).map((actor) => ({
      actor,
      specials: foundry.utils.deepClone(actor.system.specials),
    }))
    updates = updates.catch(() => {}).then(async () => {
      for (const actor of actors) await expireKillingBlows(actor)
      for (const { actor, specials } of snapshots) {
        const proxy = { system: Object.assign(Object.create(actor.system), { specials }), items: actor.items, effects: actor.effects }
        const result = regenAdvance(proxy, actor.getFlag('crawlspace', 'regen') ?? {}, delta, _worldTime)
        await actor.regenerate(delta, result)
      }
    }).catch((error) => {
      console.error('CrawlSpace | time', error)
      ui.notifications.error(error.message)
      throw error
    })
    // Keep the queue usable after an error while retaining the rejection for settleTime callers.
    void updates.catch(() => {})
  })
}
