/**
 * Opening sealed loot boxes (sealedLootBoxes.ts openCharacterLootBoxes): every unit of every sealed box gives its
 * gold and items. A box awarded without contents rolls them now, for its tier and type. Received items stack
 * with matching unequipped items already carried.
 */
import { lootTypes, tierRules, type LootTier, type LootType } from '../crawlspace-shared/shared/lootData'
import { generateLoot, rollLootGold } from '../crawlspace-shared/shared/lootGenerator'
import { finalizeLootItem, type InventoryItem } from '../crawlspace-shared/shared/inventoryItems'
import { boxSummary, contextFor, foundryItemData } from './database'

export type BoxContents = { gold: number; items: InventoryItem[] }

const isSealedBox = (item: any) => item.type === 'lootBox' && item.system.sealed && (Number(item.system.quantity) || 0) > 0

/** The contents one unit of a box gives: its sealed contents, or a fresh roll for its tier and type. */
async function unitContents(actor: any, box: any): Promise<BoxContents> {
  const sealed = box.system.loot
  if (sealed && Array.isArray(sealed.items)) return { gold: Math.max(0, Math.floor(Number(sealed.gold) || 0)), items: sealed.items }
  const tier = (Object.keys(tierRules).includes(box.system.tier) ? box.system.tier : 'Bronze') as LootTier
  const type = (lootTypes.find((known) => known.toLowerCase() === String(box.system.boxType).toLowerCase()) ?? 'Custom') as LootType
  const rule = tierRules[tier]
  const { context } = await contextFor(actor)
  const entries = generateLoot({ tier, type, mode: 'Random', items: rule.items, consumables: rule.consumables, potions: rule.potions, choices: [] }, context)
  return { gold: rollLootGold(tier, context.floor, type), items: entries.map((entry) => entry.item) }
}

/** Open the given boxes (or every sealed box) on an actor, add the loot, and report it to chat. */
export async function openLootBoxes(actor: any, boxes?: any[]) {
  const sealed = (boxes ?? [...actor.items]).filter(isSealedBox)
  if (!sealed.length) return ui.notifications.info(game.i18n.format('CRAWLSPACE.Loot.NoBoxes', { name: actor.name }))
  let gold = 0
  const received: InventoryItem[] = []
  const lines: string[] = []
  for (const box of sealed)
    for (let unit = 0; unit < Number(box.system.quantity); unit++) {
      const contents = await unitContents(actor, box)
      const items = contents.items.map((item) => finalizeLootItem({ ...foundry.utils.deepClone(item), id: foundry.utils.randomID(), equipped: false, expanded: false }))
      gold += contents.gold
      received.push(...items)
      lines.push(`<li><strong>${foundry.utils.escapeHTML(box.name)}</strong>: ${foundry.utils.escapeHTML(boxSummary({ gold: contents.gold, items }).join(', ') || game.i18n.localize('CRAWLSPACE.Loot.Empty'))}</li>`)
    }
  // Stack onto unequipped items of the same name and type, as addLootToInventory does.
  const creates: any[] = []
  const updates = new Map<string, number>()
  for (const entry of received) {
    const data = foundryItemData(entry)
    const match = actor.items.find((item: any) => item.name === data.name && item.type === data.type && !item.system.equipped && 'quantity' in item.system)
    if (match) updates.set(match.id, (updates.get(match.id) ?? (Number(match.system.quantity) || 0)) + (Number(data.system.quantity) || 1))
    else {
      const pending = creates.find((item) => item.name === data.name && item.type === data.type)
      if (pending) pending.system.quantity = (Number(pending.system.quantity) || 1) + (Number(data.system.quantity) || 1)
      else creates.push(data)
    }
  }
  if (creates.length) await actor.createEmbeddedDocuments('Item', creates)
  if (updates.size) await actor.updateEmbeddedDocuments('Item', [...updates].map(([_id, quantity]) => ({ _id, 'system.quantity': quantity })))
  await actor.deleteEmbeddedDocuments('Item', sealed.map((box: any) => box.id))
  if (gold) await actor.update({ 'system.details.gold': (Number(actor.system.details.gold) || 0) + gold })
  await ChatMessage.create({
    speaker: ChatMessage.getSpeaker({ actor }),
    content: `<div class="crawl-card loot-opened"><h4 class="card-title"><i class="fa-solid fa-box-open"></i> ${game.i18n.format('CRAWLSPACE.Loot.Opened', { name: foundry.utils.escapeHTML(actor.name) })}</h4><ul>${lines.join('')}</ul></div>`,
  })
}
