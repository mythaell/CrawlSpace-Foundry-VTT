/**
 * The inventory's paper doll: the mannequin with a framed slot for each gear slot and both hands, leader lines
 * from each slot to its place on the body, and one accessory slot per accessory worn (up to 10, plus an empty one
 * to drop onto). Coordinates are in the doll's 560×490 viewBox; slots are placed in percentages of it.
 */
import { ACCESSORY_LIMIT, GEAR_SLOTS } from '../config'
import { heldItems } from '../rules/hands'

const W = 560
const H = 490
const SLOT = 64
/** The mannequin image (2:3) and points on it, as fractions of the image. */
const FIGURE = { x: 160, y: 16, w: 245, h: 368 }
const at = (fx: number, fy: number) => ({ x: FIGURE.x + fx * FIGURE.w, y: FIGURE.y + fy * FIGURE.h })

/** Worn gear down each side of the figure; the two hands in a row under it. */
type SlotDef = { key: string; side: 'left' | 'right' | 'below'; row: number; icon: string; point: { x: number; y: number } }
const ROWS = [72, 196, 320]
/** Centres of the main-hand and off-hand slots under the figure. */
const BELOW = { y: 428, x: [W / 2 - 90, W / 2 + 90] }
const SLOTS: SlotDef[] = [
  { key: 'head', side: 'left', row: 0, icon: 'fa-helmet-safety', point: at(0.5, 0.07) },
  { key: 'arms', side: 'left', row: 1, icon: 'fa-hand-fist', point: at(0.25, 0.32) },
  { key: 'hands', side: 'left', row: 2, icon: 'fa-mitten', point: at(0.2, 0.56) },
  { key: 'torso', side: 'right', row: 0, icon: 'fa-shirt', point: at(0.5, 0.3) },
  { key: 'legs', side: 'right', row: 1, icon: 'fa-socks', point: at(0.62, 0.68) },
  { key: 'feet', side: 'right', row: 2, icon: 'fa-shoe-prints', point: at(0.63, 0.95) },
  { key: 'mainHand', side: 'below', row: 0, icon: 'fa-khanda', point: at(0.21, 0.5) },
  { key: 'offHand', side: 'below', row: 1, icon: 'fa-shield-halved', point: at(0.8, 0.5) },
]

const pct = (value: number, total: number) => `${((value / total) * 100).toFixed(3)}%`

/** Item facts for the hover card. */
function tooltip(item: any) {
  const system = item.system
  const facts = [
    game.i18n.localize(`TYPES.Item.${item.type}`),
    item.type === 'equipment' ? GEAR_SLOTS[system.slot as keyof typeof GEAR_SLOTS] : '',
    system.armorDr ? `${game.i18n.localize('CRAWLSPACE.Item.ArmorDr')} ${system.armorDr}` : '',
    system.damage?.formula ? `${system.damage.formula} ${(system.damage.types ?? []).join(', ')}` : '',
    item.type === 'weapon' && system.skill ? `${game.i18n.localize('CRAWLSPACE.Item.Skill')}: ${system.skill}` : '',
  ].filter(Boolean)
  const text = String(system.description ?? '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  const short = text.length > 220 ? `${text.slice(0, 217)}…` : text
  const escape = foundry.utils.escapeHTML
  return `<div class="crawl-doll-tip"><strong>${escape(item.name)}</strong>${system.broken ? ` <em class="broken">${escape(game.i18n.localize('CRAWLSPACE.Item.Broken'))}</em>` : ''}<div class="facts">${facts.map((fact) => `<span>${escape(String(fact))}</span>`).join('')}</div>${short ? `<p>${escape(short)}</p>` : ''}</div>`
}

const slotItem = (item: any) => (item ? { id: item.id, uuid: item.uuid, name: item.name, img: item.img, tooltip: tooltip(item), broken: !!item.system.broken } : null)

export function paperDollContext(actor: any) {
  const items = [...actor.items]
  const equipped = items.filter((item: any) => item.system?.equipped)
  const held = heldItems(items)
  const inHand = (hand: string) => {
    const entry = held.find((h) => h.hand === hand)
    return entry ? actor.items.get(entry.id) : undefined
  }
  const twoHanded = held.find((h) => h.twoHanded)
  const shields = new Set(held.filter((h) => h.shield).map((h) => h.id))
  // Shields are held, whatever gear slot they list.
  const gear = (slot: string) => equipped.find((item: any) => item.type === 'equipment' && !item.system.isShield && item.system.slot === slot)
  const filled: Record<string, any> = {
    head: gear('head'),
    arms: gear('arms'),
    hands: gear('hands'),
    torso: gear('torso'),
    legs: gear('legs'),
    feet: gear('feet'),
    mainHand: inHand('main'),
    // A two-handed weapon fills the off hand too.
    offHand: inHand('off') ?? (twoHanded ? actor.items.get(twoHanded.id) : undefined),
  }
  const slots = SLOTS.map((def) => {
    let x: number
    let y: number
    let line: string
    if (def.side === 'below') {
      // Up from the slot's top edge, then across to the hand.
      const cx = BELOW.x[def.row]
      x = cx - SLOT / 2
      y = BELOW.y - SLOT / 2
      line = `${cx},${y} ${cx},${y - 18} ${def.point.x.toFixed(1)},${def.point.y.toFixed(1)}`
    } else {
      x = def.side === 'left' ? 34 : W - 34 - SLOT
      y = ROWS[def.row] - SLOT / 2
      const edge = def.side === 'left' ? x + SLOT : x
      const elbow = def.side === 'left' ? edge + 22 : edge - 22
      line = `${edge},${ROWS[def.row]} ${elbow},${ROWS[def.row]} ${def.point.x.toFixed(1)},${def.point.y.toFixed(1)}`
    }
    return {
      key: def.key,
      label: game.i18n.localize(`CRAWLSPACE.Doll.${def.key}`),
      icon: def.icon,
      slot: ['mainHand', 'offHand'].includes(def.key) ? '' : def.key,
      hand: def.key === 'mainHand' ? 'main' : def.key === 'offHand' ? 'off' : '',
      style: `left:${pct(x, W)};top:${pct(y, H)};width:${pct(SLOT, W)};height:${pct(SLOT, H)}`,
      item: slotItem(filled[def.key]),
      twoHandedEcho: def.key === 'offHand' && !!twoHanded && filled.offHand?.id === twoHanded.id,
      line,
      point: def.point,
    }
  })
  const accessories = equipped.filter((item: any) => item.type === 'equipment' && !shields.has(item.id) && !item.system.isShield && item.system.slot === 'accessory').slice(0, ACCESSORY_LIMIT)
  return {
    viewBox: `0 0 ${W} ${H}`,
    figure: FIGURE,
    frame: `M14,2 H${W - 14} L${W - 2},14 V${H - 14} L${W - 14},${H - 2} H14 L2,${H - 14} V14 Z`,
    slots,
    accessories: accessories.map(slotItem),
    accessoryCount: accessories.length,
    accessoryLimit: ACCESSORY_LIMIT,
    canAddAccessory: accessories.length < ACCESSORY_LIMIT,
  }
}
