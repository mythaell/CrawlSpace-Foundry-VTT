/**
 * Equipping a weapon or shield follows the hand rules (hands.ts): it takes a hand, and what no longer fits is put
 * away (or moves to the free hand). Runs for every way of equipping: the sheet's toggle, the item sheet, the doll.
 */
import { handItem, heldItems, isHandItem, planEquip, type Hand } from './hands'

export function registerHandRules() {
  Hooks.on('preUpdateItem', (item: any, changes: any, _options: any, userId: string) => {
    const actor = item.actor
    if (userId !== game.user.id || !actor || !isHandItem(item)) return
    const wanted = (foundry.utils.getProperty(changes, 'system.hand') || undefined) as Hand | undefined
    if (item.system.equipped) {
      // Moving a held one-handed weapon to the other hand (on the doll) swaps it with what is there.
      const current = heldItems([...actor.items]).find((entry) => entry.id === item.id)
      if (!current || !wanted || wanted === current.hand || current.twoHanded || current.shield) return
      const occupant = heldItems([...actor.items]).find((entry) => entry.id !== item.id && entry.hand === wanted)
      if (occupant && !occupant.shield) actor.updateEmbeddedDocuments('Item', [{ _id: occupant.id, 'system.hand': current.hand }])
      else if (occupant) foundry.utils.setProperty(changes, 'system.hand', current.hand)
      return
    }
    if (foundry.utils.getProperty(changes, 'system.equipped') !== true) return
    const plan = planEquip(heldItems([...actor.items].filter((owned: any) => owned.id !== item.id)), handItem(item), wanted)
    foundry.utils.setProperty(changes, 'system.hand', plan.hand)
    const updates = [
      ...plan.unequip.map((id) => ({ _id: id, 'system.equipped': false })),
      ...plan.move.map((entry) => ({ _id: entry.id, 'system.hand': entry.hand })),
    ]
    if (!updates.length) return
    actor.updateEmbeddedDocuments('Item', updates)
    const names = plan.unequip.map((id) => actor.items.get(id)?.name).filter(Boolean)
    if (names.length) ui.notifications.info(game.i18n.format('CRAWLSPACE.Hands.PutAway', { names: names.join(', '), name: item.name }))
  })
}
