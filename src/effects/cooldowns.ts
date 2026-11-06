/** Cooldowns (cooldowns.ts): actor-owned ActiveEffects use Foundry's clock and expiry. */
import { durationEvent, durationSeconds, formatTime } from '../rules/time'

const pending = new Set<string>()

export type CooldownUse = { key: string; name: string; duration: string; img?: string }

/** Find the running cooldown for an item or a stable inherent-spell grant. */
export function cooldownFor(actor: any, key: string) {
  return actor?.effects.find((effect: any) => {
    if (effect.getFlag('crawlspace', 'cooldownKey') !== key || effect.disabled || effect.duration.expired) return false
    const end = effect.getFlag('crawlspace', 'cooldownEnd')
    return end == null || game.time.worldTime < end
  }) ?? null
}

/** Remaining world time, or the original conditional text for a manual/event cooldown. */
export function cooldownLabel(effect: any) {
  const end = effect.getFlag('crawlspace', 'cooldownEnd')
  return end == null ? effect.system.durationText : formatTime(end - game.time.worldTime)
}

/** Item cooldowns and granted spells share the same gate and only start after a completed use. */
export async function withCooldowns(actor: any, uses: CooldownUse[], action: () => Promise<any>) {
  const entries = [...new Map(uses.filter((use) => use.duration?.trim()).map((use) => [use.key, use])).values()]
  for (const use of entries) {
    const effect = cooldownFor(actor, use.key)
    if (effect || pending.has(`${actor.uuid}:${use.key}`)) {
      ui.notifications.warn(game.i18n.format('CRAWLSPACE.Time.OnCooldown', { name: use.name, remaining: effect ? cooldownLabel(effect) : use.duration }))
      return null
    }
  }
  for (const use of entries) pending.add(`${actor.uuid}:${use.key}`)
  try {
    const result = await action()
    if (!result) return result
    for (const use of entries) {
      const seconds = durationSeconds(use.duration)
      if (seconds === 0) continue
      const expiry = durationEvent(use.duration)
      const old = actor.effects.filter((effect: any) => effect.getFlag('crawlspace', 'cooldownKey') === use.key)
      if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old.map((effect: any) => effect.id))
      await actor.createEmbeddedDocuments('ActiveEffect', [{
        name: game.i18n.format('CRAWLSPACE.Time.CooldownName', { name: use.name }),
        img: use.img || 'icons/svg/clockwork.svg',
        transfer: false,
        // Cooldowns are bookkeeping, not conditions: no icon on the token.
        showIcon: CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER,
        duration: seconds === null ? { value: null, units: 'seconds', expiry } : { value: seconds, units: 'seconds' },
        system: { changes: [], durationText: use.duration },
        flags: { crawlspace: { cooldownKey: use.key, cooldownEnd: seconds === null ? null : game.time.worldTime + seconds } },
      }])
    }
    return result
  } finally {
    for (const use of entries) pending.delete(`${actor.uuid}:${use.key}`)
  }
}

/** Is this effect a skill, spell or granted spell's cooldown? */
export const isCooldown = (effect: any) => !!effect?.flags?.crawlspace?.cooldownKey

/** Cooldowns made before they hid their token icon: the active GM hides it once on load. */
export function registerCooldownIcons() {
  Hooks.once('ready', async () => {
    if (!game.user.isActiveGM) return
    const NONE = CONST.ACTIVE_EFFECT_SHOW_ICON.NEVER
    const actors = [...game.actors, ...game.scenes.contents.flatMap((scene: any) => scene.tokens.contents.filter((token: any) => !token.actorLink && token.actor).map((token: any) => token.actor))]
    for (const actor of actors) {
      const updates = actor.effects.filter((effect: any) => isCooldown(effect) && effect.showIcon !== NONE).map((effect: any) => ({ _id: effect.id, showIcon: NONE }))
      if (updates.length) await actor.updateEmbeddedDocuments('ActiveEffect', updates)
    }
  })
}

/** Cooldown identity for an embedded skill or spell. */
export function itemCooldown(item: any): CooldownUse {
  return { key: `item:${item.id}`, name: item.name, duration: item.system.cooldown ?? '', img: item.img }
}
