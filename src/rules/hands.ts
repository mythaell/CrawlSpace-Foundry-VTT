/**
 * Hands: a crawler holds at most a main-hand and an off-hand item. Weapons (not ammunition) and shields are held.
 * A two-handed weapon takes both hands; a shield always goes in the off hand.
 */
export type Hand = 'main' | 'off'
export type HandItem = { id: string; twoHanded: boolean; shield: boolean }
export type Held = HandItem & { hand: Hand }

/** Is this item held in a hand when equipped? */
export function isHandItem(item: any) {
  if (item?.type === 'weapon') return item.system?.weaponType !== 'ammunition'
  return item?.type === 'equipment' && !!item.system?.isShield
}

export function handItem(item: any): HandItem {
  const system = item.system ?? {}
  return {
    id: item.id,
    twoHanded: item.type === 'weapon' && (!!system.twoHanded || String(system.hands ?? '').trim() === '2'),
    shield: item.type === 'equipment' && !!system.isShield,
  }
}

/**
 * What the crawler holds, each with its hand. Items saved with a hand keep it; the rest are placed in order
 * (shields in the off hand first). Anything beyond two hands is left out.
 */
export function heldItems(items: any[]): Held[] {
  const candidates = items.filter((item) => item.system?.equipped && isHandItem(item)).map((item) => ({ ...handItem(item), saved: item.system.hand as string }))
  const held: Held[] = []
  const taken = () => new Set(held.flatMap((entry) => (entry.twoHanded ? ['main', 'off'] : [entry.hand])))
  const place = (entry: (typeof candidates)[number], hand: Hand) => {
    const busy = taken()
    if (entry.twoHanded ? busy.size : busy.has(hand)) return false
    const { saved: _saved, ...rest } = entry
    held.push({ ...rest, hand })
    return true
  }
  for (const entry of candidates.filter((entry) => entry.shield)) place(entry, 'off')
  const weapons = candidates.filter((entry) => !entry.shield)
  const unplaced = weapons.filter((entry) => !((entry.saved === 'main' || entry.saved === 'off') && place(entry, entry.twoHanded ? 'main' : (entry.saved as Hand))))
  for (const entry of unplaced) if (!place(entry, 'main')) place(entry, 'off')
  return held
}

/**
 * Equipping `item` (optionally into `wanted`): which hand it takes, what is put away, and what moves hands.
 * - A two-handed weapon empties both hands.
 * - A one-handed weapon or shield replaces a two-handed weapon.
 * - A shield takes the off hand; a weapon there moves to an empty main hand.
 * - A one-handed weapon takes the main hand, else the off hand (swapping out what was there).
 */
export function planEquip(held: Held[], item: HandItem, wanted?: Hand) {
  const others = held.filter((entry) => entry.id !== item.id)
  if (item.twoHanded) return { hand: 'main' as Hand, unequip: others.map((entry) => entry.id), move: [] as { id: string; hand: Hand }[] }
  const unequip = others.filter((entry) => entry.twoHanded).map((entry) => entry.id)
  const rest = others.filter((entry) => !entry.twoHanded)
  const holds = (hand: Hand) => rest.find((entry) => entry.hand === hand)
  const hand: Hand = item.shield ? 'off' : (wanted ?? (holds('main') ? 'off' : 'main'))
  const move: { id: string; hand: Hand }[] = []
  const occupant = holds(hand)
  if (occupant) {
    const other: Hand = hand === 'main' ? 'off' : 'main'
    // A weapon pushed out of the off hand by a shield moves to an empty main hand.
    if (item.shield && !occupant.shield && !holds(other)) move.push({ id: occupant.id, hand: other })
    else unequip.push(occupant.id)
  }
  return { hand, unequip, move }
}
