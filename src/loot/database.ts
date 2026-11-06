/**
 * The loot generator's view of Foundry: compendium and world items as CrawlSpace database rows, the crawler as
 * the sheet shape lootContext.ts reads, and generated CrawlSpace inventory items back into Foundry items.
 * Pack items carry their original CrawlSpace record in `flags.crawlspace.data` (see convert.ts).
 */
import type { DatabaseContent } from '../crawlspace-shared/api/types'
import { lootContext } from '../crawlspace-shared/shared/lootContext'
import { importInventoryItem, statDefinitions, type InventoryItem } from '../crawlspace-shared/shared/inventoryItems'
import { createInventoryItem } from '../crawlspace-shared/shared/contentModels'
import { inventoryToItem } from '../import/convert'

// The CrawlSpace rules name rows with crypto.randomUUID, which browsers only give secure (https/localhost) pages.
// Players often reach Foundry over plain http on a LAN address.
if (globalThis.crypto && !globalThis.crypto.randomUUID)
  Object.defineProperty(globalThis.crypto, 'randomUUID', {
    value: () =>
      '10000000-1000-4000-8000-100000000000'.replace(/[018]/g, (c) =>
        (Number(c) ^ (crypto.getRandomValues(new Uint8Array(1))[0] & (15 >> (Number(c) / 4)))).toString(16),
      ),
  })

export type DatabaseRow =DatabaseContent & { source: string; uuid: string }

/** CrawlSpace's choice key for a database row ("game-12", "homebrew-4"), which is also our sourceId flag. */
export const rowKey = (row: { source: string; id: number }) => `${row.source}-${row.id}`

let cache: { at: number; rows: DatabaseRow[] } | null = null

/** Every item with a CrawlSpace record, from Item compendia and the world. Cached for a minute. */
export async function databaseRows(): Promise<DatabaseRow[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.rows
  const rows: DatabaseRow[] = []
  const add = (entry: any, uuid: string) => {
    const flags = entry.flags?.crawlspace
    const match = /^(game|homebrew)-(\d+)$/.exec(String(flags?.sourceId ?? ''))
    if (!match || !flags?.data || !flags.contentType) return
    rows.push({ id: Number(match[2]), source: match[1], content_type: flags.contentType, name: entry.name, data: flags.data, uuid } as DatabaseRow)
  }
  for (const pack of game.packs.filter((pack: any) => pack.documentName === 'Item')) {
    const index = await pack.getIndex({ fields: ['type', 'flags.crawlspace'] })
    for (const entry of index) add(entry, entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}`)
  }
  // World copies win over compendium ones with the same record, as a GM's edits should.
  for (const item of game.items) add(item, item.uuid)
  const byKey = new Map<string, DatabaseRow>()
  for (const row of rows) byKey.set(`${rowKey(row)}:${row.content_type}`, row)
  cache = { at: Date.now(), rows: [...byKey.values()] }
  return cache.rows
}

/** The sheet fields lootContext.ts reads, filled from a crawler's prepared data. */
export function sheetData(actor: any, floor?: number) {
  const system = actor?.system ?? {}
  const keys = statDefinitions.map((stat) => stat.code.toLowerCase())
  const skills = (actor?.items ?? []).filter((item: any) => item.type === 'skill')
  return {
    character: { floor: floor ?? system.details?.floor ?? 1 },
    // Final Stat totals stand in for the app's overrides, so effects are already counted once.
    attributeOverrides: Object.fromEntries(keys.map((key, index) => [index, String(system.attributes?.[key]?.total ?? 0)])),
    skillEnhancedOverrides: Object.fromEntries(skills.map((item: any) => [item.id, String(item.system.rank?.total ?? 0)])),
    skills: skills.map((item: any) => ({ id: item.id, name: item.name, checkType: item.system.checkType, unenhancedRank: String(item.system.rank?.value ?? 0) })),
    spells: (actor?.items ?? []).filter((item: any) => item.type === 'spell').map((item: any) => ({ name: item.name })),
  }
}

export async function contextFor(actor: any, floor?: number) {
  const rows = await databaseRows()
  return { rows, context: lootContext(sheetData(actor, floor), rows) }
}

/** A Foundry item dropped into a box: its CrawlSpace record when it has one, else the Foundry data itself. */
export function inventoryFromFoundry(item: any): InventoryItem {
  const flags = item.flags?.crawlspace
  const base = { ...createInventoryItem(), id: foundry.utils.randomID(), name: item.name, quantity: String(item.system?.quantity ?? 1), expanded: false } as any
  if (flags?.data) {
    const imported = importInventoryItem({ id: 0, content_type: flags.contentType, name: item.name, data: flags.data } as DatabaseContent)
    return { ...imported, quantity: String(item.system?.quantity ?? imported.quantity ?? 1) }
  }
  const data = item.toObject()
  delete data._id
  return { ...base, foundry: data }
}

/** Foundry item data for a box item. Items dropped in from Foundry keep their own data. */
export function foundryItemData(entry: InventoryItem & { foundry?: any; contentLink?: any }) {
  if (entry.foundry) return { ...foundry.utils.deepClone(entry.foundry), system: { ...entry.foundry.system, quantity: Number(entry.quantity) || 1 } }
  const contentType = String((entry as any).properties?.contentLink?.content_type ?? '')
  const data: any = inventoryToItem(entry as any, contentType)
  data.system.equipped = data.type === 'tattoo' ? data.system.equipped : false
  data.flags = { crawlspace: { lootItem: true } }
  return data
}

/** Gold and a readable line for every item in a box, for chat cards and previews. */
export function boxSummary(contents: { gold?: number; items?: InventoryItem[] }) {
  const items = (contents.items ?? []).map((item) => `${item.name} ×${item.quantity ?? 1}`)
  return [contents.gold ? `${contents.gold} ${game.i18n.localize('CRAWLSPACE.Crawler.Gold')}` : '', ...items].filter(Boolean)
}
