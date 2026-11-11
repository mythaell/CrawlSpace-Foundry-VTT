/**
 * The inventory's paper doll: a framed slot for each gear slot and both hands, laid out like a body (head on top,
 * arms and legs either side of the torso, hands and feet below them, the two hands at the bottom), and one
 * accessory slot per accessory worn (up to 10, plus an empty one to drop onto). Coordinates are in the doll's
 * 420×440 viewBox; slots are placed in percentages of it.
 */
import { ACCESSORY_LIMIT, GEAR_SLOTS } from '../config'
import { heldItems } from '../rules/hands'

const W = 420
const H = 440
const SLOT = 72
/** Each slot's centre and the icon shown while it is empty. */
type SlotDef = { key: string; x: number; y: number; icon: string }
const SLOTS: SlotDef[] = [
  { key: 'head', x: 210, y: 58, icon: 'fa-helmet-battle' },
  { key: 'arms', x: 84, y: 158, icon: 'fa-bicep' },
  { key: 'torso', x: 210, y: 178, icon: 'fa-shirt' },
  { key: 'legs', x: 336, y: 158, icon: 'fa-shorts' },
  { key: 'hands', x: 84, y: 272, icon: 'fa-hand-fist' },
  { key: 'feet', x: 336, y: 272, icon: 'fa-boot' },
  { key: 'mainHand', x: 146, y: 376, icon: 'fa-sword' },
  { key: 'offHand', x: 274, y: 376, icon: 'fa-shield' },
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
    return {
      key: def.key,
      label: game.i18n.localize(`CRAWLSPACE.Doll.${def.key}`),
      icon: def.icon,
      slot: ['mainHand', 'offHand'].includes(def.key) ? '' : def.key,
      hand: def.key === 'mainHand' ? 'main' : def.key === 'offHand' ? 'off' : '',
      style: `left:${pct(def.x - SLOT / 2, W)};top:${pct(def.y - SLOT / 2, H)};width:${pct(SLOT, W)};height:${pct(SLOT, H)}`,
      item: slotItem(filled[def.key]),
      twoHandedEcho: def.key === 'offHand' && !!twoHanded && filled.offHand?.id === twoHanded.id,
    }
  })
  const accessories = equipped.filter((item: any) => item.type === 'equipment' && !shields.has(item.id) && !item.system.isShield && item.system.slot === 'accessory').slice(0, ACCESSORY_LIMIT)
  return {
    viewBox: `0 0 ${W} ${H}`,
    frame: `M14,2 H${W - 14} L${W - 2},14 V${H - 14} L${W - 14},${H - 2} H14 L2,${H - 14} V14 Z`,
    slots,
    accessories: accessories.map(slotItem),
    accessoryCount: accessories.length,
    accessoryLimit: ACCESSORY_LIMIT,
    canAddAccessory: accessories.length < ACCESSORY_LIMIT,
  }
}
