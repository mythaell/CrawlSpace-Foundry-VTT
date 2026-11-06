export type WornItem = {
  id: string
  equipped: boolean
  name?: string
  properties: { itemType: string; equipment: { slot: string }; weapon?: { twoHanded?: boolean; hands?: string } }
}

export const isTwoHandedWeapon = (item: Pick<WornItem, 'properties'>) =>
  item.properties.itemType === 'weapon' && (item.properties.weapon?.twoHanded ?? item.properties.weapon?.hands === '2')

export function handEquipmentConflict(items: WornItem[], id: string): string {
  const item = items.find((item) => item.id === id)
  if (!item?.equipped) return ''
  const usesHands = (item: WornItem) =>
    item.properties.itemType === 'weapon' ||
    (item.properties.itemType === 'equipment' && item.properties.equipment.slot === 'Hands')
  if (!usesHands(item)) return ''
  const other = items.find(
    (other) =>
      other.id !== id && other.equipped && usesHands(other) && (isTwoHandedWeapon(item) || isTwoHandedWeapon(other)),
  )
  return other
    ? `The Hands slot is blocked by a two-handed weapon. Unequip ${other.name || 'the other hand item'} first.`
    : ''
}

export const normalizeAccessorySlot = (slot: string) => (/^Accessory(?: \d+)?$/.test(slot.trim()) ? 'Accessory' : slot)

/** Treat legacy numbered accessory slots as the single Accessory category. */
export function paperDollSlot(_items: WornItem[], item: WornItem): string {
  return normalizeAccessorySlot(item.properties.equipment.slot)
}

export function equipPaperDollItem<T extends WornItem>(items: T[], slot: string, id: string): T[] {
  if (slot === 'Hands' && items.some((item) => item.equipped && item.id !== id && isTwoHandedWeapon(item))) return items
  return items.map((item) => {
    if (item.id === id && item.properties.itemType === 'equipment') {
      return {
        ...item,
        equipped: true,
        properties: { ...item.properties, equipment: { ...item.properties.equipment, slot } },
      }
    }
    if (
      slot !== 'Accessory' &&
      item.equipped &&
      item.properties.itemType === 'equipment' &&
      paperDollSlot(items, item) === slot
    )
      return { ...item, equipped: false }
    return item
  })
}
