/** Killing-blow bonuses belong to the individual spell and expire with game time, rests or floors. */
import { actorAction } from '../socket'
import { killingBlowBonus, expireKillingBlowStacks } from '../rules/killingBlowStacks'

export function spellKillBonus(item: any, rank: number) {
  const stamp = item?.getFlag('crawlspace', 'killingBlowTime')
  if (rank >= 10 && item.system.killingBlowFloor && Number(item.system.killingBlowFloor) !== Number(item.actor?.system.details.floor)) return 0
  if (rank >= 5 && rank < 10 && Number.isFinite(stamp) && game.time.worldTime - stamp >= 7 * 24 * 3600) return 0
  if (item && !Number.isFinite(stamp)) {
    const timer = game.settings.get('crawlspace', 'timers').find((entry: any) => entry.floor)
    const remaining = timer ? Math.max(0, timer.end === null ? timer.remaining : timer.end - game.time.worldTime) * 1000 : null
    const row = { ...item.system.toObject(), killingBlowGameClock: item.system.killingBlowGameClock ?? undefined }
    const [current] = expireKillingBlowStacks([row], () => rank, { now: Date.now(), gameClock: remaining, floor: item.actor?.system.details.floor })
    return killingBlowBonus(current, rank)
  }
  return killingBlowBonus(item?.system, rank)
}

export async function creditKillingBlow(uuid: string | undefined) {
  if (!uuid) return
  const item = await fromUuid(uuid)
  if (item?.type !== 'spell' || !item.actor || !item.system.killingBlowStacking) return
  await actorAction(item.actor, 'awardKillingBlow', item.id)
}

export async function clearKillingBlows(actor: any, event: 'longRest' | 'leaveFloor') {
  const updates = actor.items.filter((item: any) => item.type === 'spell' && item.system.killingBlowStacks > 0 && (event === 'leaveFloor' ? item.system.rank.total >= 10 : item.system.rank.total < 5)).map((item: any) => ({ _id: item.id, 'system.killingBlowStacks': 0 }))
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates)
}

/** Persist timed/floor expiry so the spell sheet agrees with its effective damage bonus. */
export async function expireKillingBlows(actor: any) {
  const updates = actor.items.filter((item: any) => item.type === 'spell' && item.system.killingBlowStacking && item.system.killingBlowStacks > 0 && item.system.rank.total >= 5 && spellKillBonus(item, item.system.rank.total) === 0).map((item: any) => ({ _id: item.id, 'system.killingBlowStacks': 0 }))
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates)
}
