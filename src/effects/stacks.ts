/**
 * Condition stacks (CrawlSpace debuffStacks, the party frames' badges). One click model everywhere a condition is
 * shown as an icon: left click applies it or adds a stack, right click takes a stack off (removing it at the last
 * one), shift-click removes it outright.
 */
import { debuffById } from '../rules/debuffs'

/** A stackable standard debuff, or a condition with a stack limit above 1. */
export function isStackable(effect: any) {
  for (const status of effect?.statuses ?? []) {
    const debuff = debuffById(status)
    if (debuff) return debuff.stackable
  }
  return Number(effect?.system?.maxStacks) > 1
}

const stacksOf = (effect: any) => Math.max(1, Number(effect.system?.stacks) || 1)

/** The actor's active conditions for a status id. */
const withStatus = (actor: any, statusId: string) => actor.effects.filter((effect: any) => effect.statuses?.has(statusId))

/** Add a stack to a condition (up to its limit). Non-stacking conditions don't change. */
export async function addStack(effect: any) {
  if (!isStackable(effect)) return effect
  const max = Number(effect.system?.maxStacks) || Infinity
  return effect.update({ 'system.stacks': Math.min(max, stacksOf(effect) + 1) })
}

/** Take a stack off a condition; the last stack removes it. */
export async function removeStack(effect: any) {
  if (isStackable(effect) && stacksOf(effect) > 1) return effect.update({ 'system.stacks': stacksOf(effect) - 1 })
  return effect.delete()
}

/** Apply a status (or add a stack if the actor has it). Immunities are checked by addDebuff. */
export async function applyStatus(actor: any, statusId: string) {
  if (debuffById(statusId)) return actor.addDebuff(statusId)
  if (withStatus(actor, statusId).length) return
  return actor.toggleStatusEffect(statusId, { active: true, overlay: statusId === 'dead' })
}

/** Take one stack of a status off, or every stack when `all`. */
export async function reduceStatus(actor: any, statusId: string, all = false) {
  const effects = withStatus(actor, statusId)
  if (!effects.length) return
  if (all) return actor.deleteEmbeddedDocuments('ActiveEffect', effects.map((effect: any) => effect.id))
  return removeStack(effects[0])
}

/** The click model on a condition icon. */
export async function clickCondition(event: MouseEvent, effect: any) {
  if (event.shiftKey) return effect.delete()
  if (event.button === 2) return removeStack(effect)
  return addStack(effect)
}

/** Token HUD: the status palette follows the same clicks, and shows each status's stacks. */
export function createTokenHUD() {
  const Base = foundry.applications.hud.TokenHUD
  return class CrawlTokenHUD extends Base {
    static DEFAULT_OPTIONS = { actions: { effect: { handler: CrawlTokenHUD.#onEffect, buttons: [0, 2] } } }

    static async #onEffect(this: any, event: PointerEvent, target: HTMLElement) {
      if (!this.actor) return ui.notifications.warn('HUD.WarningEffectNoActor', { localize: true })
      const statusId = target.dataset.statusId as string
      if (event.shiftKey) await reduceStatus(this.actor, statusId, true)
      else if (event.button === 2) await reduceStatus(this.actor, statusId)
      else await applyStatus(this.actor, statusId)
    }

    async _onRender(context: any, options: any) {
      await super._onRender(context, options)
      if (!this.actor) return
      for (const button of (this.element as HTMLElement).querySelectorAll<HTMLElement>('[data-status-id]')) {
        const effect = withStatus(this.actor, button.dataset.statusId as string)[0]
        button.querySelector('.crawl-stack')?.remove()
        if (effect && isStackable(effect) && stacksOf(effect) > 1)
          button.insertAdjacentHTML('beforeend', `<span class="crawl-stack">${stacksOf(effect)}</span>`)
      }
    }
  }
}
