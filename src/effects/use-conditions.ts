/**
 * A skill or spell's cast-time conditions (CrawlSpace useEffects, ConditionCardActions.tsx). They live on the item
 * as non-transferring effects. Using the item posts a card listing the ones its current Rank gives; the caster
 * applies one to their targeted tokens, or drags it onto a token on the scene. A target the user doesn't own
 * gets it through the active GM. The new condition's origin is the item, so effects like Second Chance know
 * who cast them.
 */
import { effectDuration } from '../import/convert'
import { conditionAction } from '../socket'
import { areaButton } from './areas'

/** The Rank window of a rank-variant condition: its flags, else the "Ranks 5–9" line the importer wrote. */
function rankWindow(effect: any): { min: number; max: number } | null {
  const flagged = effect.flags?.crawlspace?.useRanks
  if (flagged) return { min: Number(flagged.min) || 0, max: Number(flagged.max) || Infinity }
  const match = String(effect.description ?? '').match(/Ranks?\s*(\d+)\s*[–-]\s*(\d*)/)
  return match ? { min: Number(match[1]), max: match[2] ? Number(match[2]) : Infinity } : null
}

/** The conditions this item gives when used, at its current Rank. */
export function useConditions(item: any): any[] {
  return rankedEffects(item, false)
}

/** A spell's own effects ("Applies to the owner") that its caster gets when casting it, at its current Rank. */
export function castSelfEffects(item: any): any[] {
  return item?.type === 'spell' ? rankedEffects(item, true).filter((effect: any) => !effect.disabled) : []
}

/**
 * Casting a spell puts its self effects on the caster as buffs (or debuffs, by their Kind), timed by their
 * duration. Recasting refreshes them: the copies from the last cast are replaced.
 */
export async function applyCastEffects(item: any) {
  const actor = item?.actor
  const effects = castSelfEffects(item)
  if (!actor?.isOwner || !effects.length) return
  const rank = Math.floor(Number(item.system?.rank?.total) || 0)
  const old = actor.effects.filter((effect: any) => effect.flags?.crawlspace?.castFrom?.spell === item.name)
  if (old.length) await actor.deleteEmbeddedDocuments('ActiveEffect', old.map((effect: any) => effect.id))
  await actor.createEmbeddedDocuments(
    'ActiveEffect',
    effects.map((effect: any) => {
      // An effect without a duration of its own lasts as long as the spell does.
      const own = effectDuration(effect.system?.durationText)
      const data = conditionData(own || !item.system?.duration ? effect : effect.clone({ 'system.durationText': item.system.duration }), { origin: item })
      data.system = { ...data.system, conditionType: data.system?.conditionType || 'buff', rank, castBy: actor.name }
      data.flags = foundry.utils.mergeObject(data.flags ?? {}, { crawlspace: { castFrom: { spell: item.name, effect: effect.id } } })
      return data
    }),
  )
}

function rankedEffects(item: any, transfer: boolean): any[] {
  const rank = Math.floor(Number(item.system?.rank?.total) || 0)
  return item.effects.filter((effect: any) => {
    if (!!effect.transfer !== transfer) return false
    const window = rankWindow(effect)
    if (window && ['skill', 'spell'].includes(item.type) && (rank < window.min || rank > window.max)) return false
    const required = effect.system?.requiredRank
    return required === null || required === undefined || rank >= required
  })
}

/** The condition as it lands on a target: active, timed by its duration text, and from the item. */
export function conditionData(effect: any, options: { origin?: any } = {}) {
  const data = effect.toObject()
  delete data._id
  delete data.start
  const timed = effectDuration(data.system?.durationText)
  data.duration = { ...data.duration, ...(timed ? { expiry: null, ...timed } : {}), expired: false }
  const item = options.origin ?? effect.parent
  return { ...data, transfer: true, disabled: false, origin: item?.documentName === 'Item' ? item.uuid : effect.origin }
}

/** Put a condition on an actor (the caller has already checked permission). */
export async function giveCondition(effect: any, target: any) {
  return target.createEmbeddedDocuments('ActiveEffect', [conditionData(effect)])
}

/** Apply a condition to these actors: directly when the user owns them, else through the GM. */
export async function applyCondition(effect: any, targets: any[]) {
  if (!targets.length) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Condition.NoTargets'))
  for (const target of targets) {
    if (target.isOwner) await giveCondition(effect, target)
    else conditionAction(effect, target)
  }
  ui.notifications.info(game.i18n.format('CRAWLSPACE.Condition.Applied', { name: effect.name, targets: targets.map((target) => target.name).join(', ') }))
}

/** May this user hand out this condition? The GM, or an owner of the item's actor. */
export function mayGive(effect: any, user: any) {
  if (user?.isGM) return true
  const owner = effect?.parent?.actor ?? effect?.parent
  return !!owner?.testUserPermission?.(user, 'OWNER')
}

/** The conditions an item gives, as rows to drag onto a token or apply to targets. */
export function conditionRows(item: any) {
  const conditions = useConditions(item)
  if (!conditions.length) return ''
  const esc = foundry.utils.escapeHTML
  const rows = conditions
    .map(
      (effect: any) => `<div class="condition-row">
        <a class="condition-link" draggable="true" data-link data-uuid="${esc(effect.uuid)}" data-type="ActiveEffect" data-tooltip="${esc(game.i18n.localize('CRAWLSPACE.Condition.DragHint'))}"><img src="${esc(effect.img)}" alt=""><span>${esc(effect.name)}</span></a>
        <button type="button" data-crawl-action="apply-condition" data-effect-uuid="${esc(effect.uuid)}" data-tooltip="${esc(game.i18n.localize('CRAWLSPACE.Condition.ApplyTargets'))}"><i class="fa-solid fa-crosshairs"></i></button>
      </div>`,
    )
    .join('')
  return `<div class="card-conditions">${rows}</div>`
}

/**
 * What a skill or spell's roll card shows under the roll: its description and the Rank upgrades the user has
 * reached (not for attacks, whose card is just the roll), then its conditions.
 */
export async function itemCardDetails(item: any, options: { attack?: boolean } = {}) {
  if (!item) return ''
  const parts: string[] = []
  if (!options.attack) {
    const enrich = (text: string) =>
      foundry.applications.ux.TextEditor.implementation.enrichHTML(text, { relativeTo: item, rollData: item.actor?.getRollData?.() ?? {} })
    const description = String(item.system.description ?? '').trim()
    if (description) parts.push(`<div class="card-description">${await enrich(description)}</div>`)
    const rank = Math.floor(Number(item.system.rank?.total) || 0)
    for (const step of [5, 10, 15]) {
      const text = String(item.system.upgrades?.[`rank${step}`] ?? '').trim()
      if (text && rank >= step)
        parts.push(`<div class="card-upgrade"><b>${game.i18n.format('CRAWLSPACE.Effect.AtRank', { rank: step })}</b> ${await enrich(text)}</div>`)
    }
  }
  parts.push(areaButton(item))
  parts.push(conditionRows(item))
  return parts.filter(Boolean).join('')
}

/** Dropping a condition (from a card or an item sheet) on a token applies it to that token's actor. */
export function registerConditionDrops() {
  // A card's condition can be dragged like any document link.
  document.addEventListener('dragstart', (event) => {
    const link = (event.target as HTMLElement)?.closest?.('.condition-link') as HTMLElement | null
    if (!link?.dataset.uuid || !event.dataTransfer) return
    event.stopPropagation()
    event.dataTransfer.setData('text/plain', JSON.stringify({ type: 'ActiveEffect', uuid: link.dataset.uuid }))
  }, true)
  Hooks.on('dropCanvasData', (_canvas: any, data: any) => {
    if (data?.type !== 'ActiveEffect' || !data.uuid) return
    const token = canvas.tokens.placeables
      .filter((placeable: any) => placeable.visible && placeable.bounds?.contains(data.x, data.y))
      .sort((a: any, b: any) => (b.document.sort ?? 0) - (a.document.sort ?? 0))[0]
    if (!token?.actor) return
    const effect = fromUuidSync(data.uuid)
    if (!effect) return
    if (!mayGive(effect, game.user)) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NotYours'))
    applyCondition(effect, [token.actor]).catch((error: any) => ui.notifications.error(error.message))
    return false
  })
}
