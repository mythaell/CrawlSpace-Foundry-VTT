/**
 * The hotlist: a fixed set of slots (10 plus bonuses) holding owned items by id, set from its configure popup.
 * Hotlisted spells are what a crawler has ready: attack spells join the Attacks table, the rest the Actions or
 * Interrupt Actions table. Consumables leave the hotlist and the actions tables once they run out. Pure.
 */
export type ActionKind = 'action' | 'interrupt'
type ItemLike = { id: string; type: string; name: string; img?: string; system: any }

/** The hotlist's ids as exactly `capacity` slots ('' for an empty one). */
export function hotlistSlots(ids: string[], capacity: number): string[] {
  return Array.from({ length: Math.max(0, capacity) }, (_, index) => String(ids[index] ?? ''))
}

/** Put `id` in slot `index`. If it was already in another slot, it moves and the slot's old entry takes its place. */
export function placeInSlot(ids: string[], capacity: number, index: number, id: string): string[] {
  const slots = hotlistSlots(ids, capacity)
  if (index < 0 || index >= slots.length) return slots
  const from = slots.indexOf(id)
  if (from >= 0) slots[from] = slots[index]
  slots[index] = id
  return slots
}

/** Which actions table(s) a spell or skill belongs in: its own setting, else "both" when its text mentions Interrupt. */
export function actionKinds(item: ItemLike): ActionKind[] {
  const kind = String(item.system?.actionKind ?? '')
  if (kind === 'action' || kind === 'interrupt') return [kind]
  if (kind === 'both') return ['action', 'interrupt']
  return /\binterrupt/i.test(String(item.system?.description ?? '')) ? ['action', 'interrupt'] : ['action']
}

/** Rows the hotlist adds to the Actions and Interrupt Actions tables: its non-attack spells, in hotlist order. */
export function hotlistActions(items: ItemLike[], hotlist: string[]) {
  const byId = new Map(items.map((item) => [item.id, item]))
  return hotlist.flatMap((id) => {
    const item = id ? byId.get(id) : undefined
    if (!item || item.type !== 'spell' || item.system?.isAttack || item.system?.broken) return []
    return actionKinds(item).map((kind) => ({ id: `hotlist-${kind}-${item.id}`, kind, name: item.name, img: item.img ?? '', sourceId: item.id, auto: true }))
  })
}

/** A consumable with none left. */
export const spentConsumable = (item: { type: string; system: any }) => item.type === 'consumable' && (Number(item.system?.quantity) || 0) <= 0

/** The hotlist and actions with `itemId` taken out, or null when it was in neither. */
export function withoutSource<T extends { sourceId?: string }>(current: { hotlist: string[]; actions: T[] }, itemId: string) {
  const inHotlist = current.hotlist.includes(itemId)
  const actions = current.actions.filter((action) => action.sourceId !== itemId)
  if (!inHotlist && actions.length === current.actions.length) return null
  return { hotlist: current.hotlist.map((id) => (id === itemId ? '' : id)), actions }
}
