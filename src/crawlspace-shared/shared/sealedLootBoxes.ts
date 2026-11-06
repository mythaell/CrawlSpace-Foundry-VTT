import { lootTiers, lootTypes, tierRules, type LootTier, type LootType } from './lootData'
import { generateLoot, rollLootGold } from './lootGenerator'
import { lootContext } from './lootContext'
import { finalizeLootItem, type InventoryItem } from './inventoryItems'
import type { DatabaseContent } from '../api/types'

export type SealedLootBox = {
  id: string
  name: string
  tier: LootTier
  type: string
  quantity: number
  notes: string
  awardedAt: string
  contents?: { gold: number; items: InventoryItem[] }
}
export type OpenedLootBox = { id: string; name: string; gold: number; items: InventoryItem[] }
export const isInventoryLootBox = (item: { lootBox?: unknown; name?: unknown }) =>
  item.lootBox === true || /\bloot\s*box(?:es)?\b/i.test(String(item.name ?? ''))
export function boxIdentity(name: string) {
  const tier = lootTiers.find((tier) => new RegExp(`\\b${tier}\\b`, 'i').test(name)) ?? 'Bronze'
  const type =
    name
      .replace(new RegExp(`\\b${tier}\\b`, 'i'), '')
      .replace(/\b(?:loot\s*)?box(?:es)?\b/gi, '')
      .trim() || 'Adventurer'
  return { tier, type, name: `${tier} ${type} Box` }
}
export function characterLootBoxes(data: Record<string, any>): SealedLootBox[] {
  const stored: SealedLootBox[] = Array.isArray(data.lootBoxes) ? data.lootBoxes : []
  const ids = new Set(stored.map((box) => box.id))
  const legacy = (Array.isArray(data.inventory) ? data.inventory : [])
    .filter(isInventoryLootBox)
    .filter((item: any) => !ids.has(item.id))
    .map((item: any) => ({
      id: item.id,
      ...boxIdentity(String(item.name)),
      quantity: Math.max(0, Math.floor(Number(item.quantity) || 0)),
      notes: String(item.notes ?? ''),
      awardedAt: '',
    }))
  return [...stored, ...legacy].filter((box) => Number.isSafeInteger(box.quantity) && box.quantity > 0)
}
export function sortedLootBoxes(data: Record<string, any>) {
  return characterLootBoxes(data)
    .slice()
    .sort((a, b) => lootTiers.indexOf(a.tier) - lootTiers.indexOf(b.tier) || a.name.localeCompare(b.name))
}
export function lootBoxTotals(data: Record<string, any>) {
  const grouped = new Map<string, { name: string; quantity: number; tier: LootTier }>()
  for (const box of sortedLootBoxes(data)) {
    const key = box.name.trim().toLowerCase(),
      old = grouped.get(key)
    grouped.set(key, { name: box.name, quantity: (old?.quantity ?? 0) + box.quantity, tier: box.tier })
  }
  const rows = [...grouped.values()]
  return {
    total: rows.reduce((sum, row) => sum + row.quantity, 0),
    tooltip: rows.map((row) => `${row.name} - ${row.quantity}`).join('\n'),
  }
}

// Item identity ignores row IDs and database provenance, but retains actual item properties.
function stackKey(item: InventoryItem) {
  const canonical = (value: any): any => {
    if (Array.isArray(value)) return value.map(canonical)
    if (value && typeof value === 'object')
      return Object.fromEntries(
        Object.keys(value)
          .sort()
          .filter((key) => key !== 'contentLink' && !(key === 'id' && ('target' in value || 'usage' in value)))
          .map((key) => [key, canonical(value[key])]),
      )
    return value
  }
  return JSON.stringify(canonical({ name: item.name.trim().toLowerCase(), properties: item.properties }))
}

export function addLootToInventory(inventory: InventoryItem[], received: InventoryItem[]) {
  const result = inventory.map((item) => ({ ...item }))
  const positions = new Map<string, number>()
  result.forEach((item, index) => {
    const key = stackKey(item)
    if (!positions.has(key)) positions.set(key, index)
  })
  for (const item of received) {
    const key = stackKey(item),
      index = positions.get(key)
    if (index === undefined) {
      positions.set(key, result.length)
      result.push({ ...item })
    } else {
      const quantity = Number(result[index].quantity) + Number(item.quantity)
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Item quantity exceeds the supported range.')
      result[index] = { ...result[index], quantity: String(quantity) }
    }
  }
  return result
}
/** Only called by a confirmed, owner-authorized Safe Room upkeep request. */
export function openCharacterLootBoxes(
  data: Record<string, any>,
  newId: () => string,
  database: DatabaseContent[] = [],
  rng = Math.random,
) {
  const boxes = sortedLootBoxes(data),
    opened: OpenedLootBox[] = []
  if (!boxes.length) return { data, opened }
  const items: InventoryItem[] = []
  let gold = Number(data.character?.gold) || 0
  for (const box of boxes)
    for (let index = 0; index < box.quantity; index++) {
      let contents = box.contents
      if (!contents) {
        // Old inventory placeholders did not record their contents. Preserve the old generation behavior on opening.
        const type = (lootTypes.includes(box.type as LootType) ? box.type : 'Custom') as LootType
        const rule = tierRules[box.tier],
          context = lootContext(data, database)
        contents = {
          gold: rollLootGold(box.tier, context.floor, type, rng),
          items: generateLoot(
            {
              tier: box.tier,
              type,
              mode: 'Random',
              items: rule.items,
              consumables: rule.consumables,
              potions: rule.potions,
              choices: [],
            },
            context,
            rng,
          ).map((entry) => entry.item),
        }
      }
      if (!Number.isSafeInteger(contents.gold) || contents.gold < 0 || !Array.isArray(contents.items))
        throw new Error(`Invalid sealed contents for ${box.name}.`)
      const received = contents.items.map((item) =>
        finalizeLootItem({ ...structuredClone(item), id: newId(), equipped: false, expanded: false }),
      )
      gold += contents.gold
      if (!Number.isSafeInteger(gold)) throw new Error('Gold total exceeds the supported range.')
      items.push(...received)
      opened.push({ id: `${box.id}:${index}`, name: box.name, gold: contents.gold, items: received })
    }
  return {
    data: {
      ...data,
      character: { ...data.character, gold: String(gold) },
      inventory: addLootToInventory(
        (data.inventory ?? []).filter((item: any) => !isInventoryLootBox(item)),
        items,
      ),
      lootBoxes: [],
    },
    opened,
  }
}
