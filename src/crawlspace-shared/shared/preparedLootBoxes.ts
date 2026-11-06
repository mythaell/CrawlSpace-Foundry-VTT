import { lootTiers, lootTypes, type LootTier, type LootType } from './lootData'
import type { InventoryItem } from './inventoryItems'

/** Contents a GM sealed into a database loot box ahead of the session; awarding hands these out unchanged. */
export type PreparedLoot = { tier: LootTier; type: LootType; floor: number; gold: number; items: InventoryItem[] }

export function normalizePreparedLoot(value: unknown): PreparedLoot | undefined {
  const loot = value as Partial<PreparedLoot> | undefined
  if (
    !loot ||
    !lootTiers.includes(loot.tier as LootTier) ||
    !lootTypes.includes(loot.type as LootType) ||
    !Array.isArray(loot.items)
  )
    return undefined
  return {
    tier: loot.tier as LootTier,
    type: loot.type as LootType,
    floor: Number.isSafeInteger(loot.floor) && Number(loot.floor) >= 1 ? Number(loot.floor) : 1,
    gold: Number.isSafeInteger(loot.gold) && Number(loot.gold) >= 0 ? Number(loot.gold) : 0,
    items: loot.items.filter((item) => item && typeof item === 'object' && typeof item.name === 'string'),
  }
}

export const preparedLootSummary = (loot: PreparedLoot) =>
  [
    `${loot.tier} ${loot.type} Box (Floor ${loot.floor})`,
    loot.gold ? `${loot.gold} Gold` : '',
    loot.items.map((item) => `${item.name} ×${item.quantity ?? 1}`).join(', ') || 'No items',
  ]
    .filter(Boolean)
    .join(' · ')
