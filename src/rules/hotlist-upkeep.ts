/** A consumable that runs out leaves its owner's hotlist and actions tables (the item itself stays, at 0). */
import { spentConsumable, withoutSource } from './hotlist'

export function registerHotlistUpkeep() {
  Hooks.on('updateItem', (item: any, changes: any, _options: any, userId: string) => {
    const actor = item.actor
    if (userId !== game.user.id || !actor?.system?.hotlist || !foundry.utils.hasProperty(changes, 'system.quantity') || !spentConsumable(item)) return
    const next = withoutSource({ hotlist: [...(actor._source.system.hotlist?.items ?? [])], actions: [...(actor._source.system.sheetActions ?? [])] }, item.id)
    if (next) actor.update({ 'system.hotlist.items': next.hotlist, 'system.sheetActions': next.actions })
  })
}
