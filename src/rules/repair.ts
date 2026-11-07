/**
 * Broken gear, shield wear and the Repair skill. A Shield Block that Major Fails costs the shield 1 DR, a
 * Critical Fail 2 (shield-block.ts damageShields); a shield with no DR left breaks and can't block. A successful
 * Repair check puts a "Repair Item" button on its card, which mends one broken item (and a shield's lost DR).
 */
import { damageShields, equippedShields, needsRepair, shieldDrLoss } from './shield-block'

const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ''))
const t = (key: string, data: Record<string, unknown> = {}) => game.i18n.format(`CRAWLSPACE.${key}`, data)

/** After a Shield Block roll: wear the actor's shields by the outcome, and say so in chat. */
export async function wearShields(actor: any, outcome: string | null | undefined) {
  const loss = shieldDrLoss(outcome)
  if (!loss || !actor?.isOwner) return
  const shields = equippedShields(actor).map((item: any) => ({
    id: item.id,
    dr: Number(item.system.armorDr) || 0,
    lost: Number(item.system.drLost) || 0,
    broken: !!item.system.broken,
  }))
  const changes = damageShields(shields, loss)
  if (!changes.length) return
  await actor.updateEmbeddedDocuments(
    'Item',
    changes.map((change) => ({ _id: change.id, 'system.drLost': change.lost, 'system.broken': change.broken })),
  )
  const lines = changes.map((change) => {
    const item = actor.items.get(change.id)
    const before = shields.find((shield) => shield.id === change.id)
    const max = before?.dr ?? 0
    const taken = change.lost - (before?.lost ?? 0)
    const data = { name: esc(actor.name), shield: esc(item?.name), loss: taken, left: Math.max(0, max - change.lost), max }
    return `<p>${change.broken ? t('ShieldWear.Broke', data) : t('ShieldWear.Lost', data)}</p>`
  })
  await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="crawl-shield-wear">${lines.join('')}</div>` })
}

/** Mend an item: no longer broken, and a shield gets its lost DR back. */
export async function repairItem(item: any) {
  await item.update({ 'system.broken': false, ...(item.type === 'equipment' ? { 'system.drLost': 0 } : {}) })
}

/** The sheet's shield button: repair every equipped shield (and clear older actor-level lost DR). */
export async function repairShields(actor: any) {
  const updates = equippedShields(actor)
    .filter((item: any) => needsRepair(item))
    .map((item: any) => ({ _id: item.id, 'system.broken': false, 'system.drLost': 0 }))
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates)
  if (actor.system.shieldDr?.lost) await actor.update({ 'system.shieldDr.lost': 0 })
  ui.notifications.info(t('Repair.ShieldsDone', { name: actor.name }))
}

/** The card's Repair Item button: pick one of the actor's broken items and mend it (once per card). */
export async function promptRepair(actor: any, message: any) {
  const used = message.flags?.crawlspace?.repaired
  if (used) return ui.notifications.info(t('Repair.Used', { item: used }))
  const broken = actor.items.filter((item: any) => needsRepair(item))
  if (!broken.length) return ui.notifications.info(t('Repair.None', { name: actor.name }))
  const rows = broken
    .map((item: any, index: number) => {
      const missing = item.type === 'equipment' && Number(item.system.drLost) > 0 ? ` <small>(${esc(t('Repair.Missing', { dr: item.system.drLost }))})</small>` : ''
      return `<label class="repair-choice"><input type="radio" name="repairItem" value="${esc(item.id)}" ${index ? '' : 'checked'}><img src="${esc(item.img)}" alt=""><span>${esc(item.name)}${missing}</span></label>`
    })
    .join('')
  const id = await foundry.applications.api.DialogV2.prompt({
    classes: ['crawlspace', 'repair-dialog'],
    window: { title: t('Repair.Title') },
    content: `<p>${esc(t('Repair.Pick'))}</p><div class="repair-list">${rows}</div>`,
    ok: { label: t('Repair.Button'), icon: 'fa-solid fa-hammer', callback: (_event: Event, button: any) => button.form.querySelector("input[name=repairItem]:checked")?.value },
    rejectClose: false,
  })
  const item = id ? actor.items.get(id) : null
  if (!item) return
  await repairItem(item)
  await message.update({ 'flags.crawlspace.repaired': item.name })
  ui.notifications.info(t('Repair.Done', { name: actor.name, item: item.name }))
}

/** Older worlds kept a crawler's lost shield DR on the actor; move it onto the first equipped shield. */
export async function migrateShieldLoss() {
  for (const actor of game.actors) {
    const lost = Number(actor.system?.shieldDr?.lost) || 0
    const shield = lost ? equippedShields(actor)[0] : null
    if (!shield) continue
    await shield.update({ 'system.drLost': Math.min(Number(shield.system.armorDr) || 0, (Number(shield.system.drLost) || 0) + lost) })
    await actor.update({ 'system.shieldDr.lost': 0 })
  }
}
