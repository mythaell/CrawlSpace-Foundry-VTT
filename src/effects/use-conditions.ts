/**
 * A skill or spell's cast-time conditions (CrawlSpace useEffects, ConditionCardActions.tsx). They live on the item
 * as non-transferring effects. Using the item posts a card listing the ones its current Rank gives; the caster
 * applies one to their targeted tokens, or drags it onto a token on the scene. A target the user doesn't own
 * gets it through the active GM. The new condition's origin is the item, so effects like Second Chance know
 * who cast them.
 */
import { effectDuration } from '../import/convert'
import { conditionAction } from '../socket'

/** The Rank window of a rank-variant condition: its flags, else the "Ranks 5–9" line the importer wrote. */
function rankWindow(effect: any): { min: number; max: number } | null {
  const flagged = effect.flags?.crawlspace?.useRanks
  if (flagged) return { min: Number(flagged.min) || 0, max: Number(flagged.max) || Infinity }
  const match = String(effect.description ?? '').match(/Ranks?\s*(\d+)\s*[–-]\s*(\d*)/)
  return match ? { min: Number(match[1]), max: match[2] ? Number(match[2]) : Infinity } : null
}

/** The conditions this item gives when used, at its current Rank. */
export function useConditions(item: any): any[] {
  const rank = Math.floor(Number(item.system?.rank?.total) || 0)
  return item.effects.filter((effect: any) => {
    if (effect.transfer) return false
    const window = rankWindow(effect)
    if (window && ['skill', 'spell'].includes(item.type) && (rank < window.min || rank > window.max)) return false
    const required = effect.system?.requiredRank
    return required === null || required === undefined || rank >= required
  })
}

/** The condition as it lands on a target: active, timed by its duration text, and from the item. */
export function conditionData(effect: any) {
  const data = effect.toObject()
  delete data._id
  delete data.start
  const timed = effectDuration(data.system?.durationText)
  data.duration = { ...data.duration, ...(timed ? { expiry: null, ...timed } : {}), expired: false }
  const item = effect.parent
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

/** The card posted after using an item with conditions. */
export async function postConditionCard(item: any) {
  const conditions = useConditions(item)
  if (!conditions.length) return
  const esc = foundry.utils.escapeHTML
  const rows = conditions
    .map(
      (effect: any) => `<div class="condition-row">
        <a class="content-link" draggable="true" data-link data-uuid="${esc(effect.uuid)}" data-type="ActiveEffect" data-tooltip="${esc(game.i18n.localize('CRAWLSPACE.Condition.DragHint'))}"><img src="${esc(effect.img)}" alt=""> ${esc(effect.name)}</a>
        <button type="button" data-crawl-action="apply-condition" data-effect-uuid="${esc(effect.uuid)}"><i class="fa-solid fa-crosshairs"></i> ${esc(game.i18n.localize('CRAWLSPACE.Condition.ApplyTargets'))}</button>
      </div>`,
    )
    .join('')
  return ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor: item.actor }),
    content: `<div class="crawl-card crawl-conditions"><h4>${esc(item.name)}: ${esc(game.i18n.localize('CRAWLSPACE.Condition.Title'))}</h4>${rows}</div>`,
    flags: { crawlspace: { kind: 'conditions', itemUuid: item.uuid } },
  })
}

/** Dropping a condition (from a card or an item sheet) on a token applies it to that token's actor. */
export function registerConditionDrops() {
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
