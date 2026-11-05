/**
 * CrawlSpace character backups keep a skill's rank-up text but not its damage formulas, which live in the
 * skill database. Fill them from the compendium entry with the same name, so weapons and attack skills roll
 * the skill's damage at the current Rank (a weapon's own damage is only a bonus on top).
 */
const DAMAGE_KEYS = ['rank5Damage', 'rank10Damage', 'rank15Damage'] as const

let index: Map<string, { pack: any; id: string }> | null = null

async function compendiumIndex() {
  if (index) return index
  index = new Map()
  for (const pack of game.packs.filter((pack: any) => pack.documentName === 'Item')) {
    const entries = await pack.getIndex({ fields: ['type'] })
    for (const entry of entries) {
      if (entry.type !== 'skill' && entry.type !== 'spell') continue
      const key = `${entry.type}:${entry.name.trim().toLowerCase()}`
      if (!index.has(key)) index.set(key, { pack, id: entry._id })
    }
  }
  return index
}

const missingDamage = (system: any) => !String(system?.damage?.formula ?? '').trim() && DAMAGE_KEYS.every((key) => !String(system?.upgrades?.[key] ?? '').trim())

/** Damage fields for one skill/spell's data, or null when the compendium has nothing to add. */
async function damageFor(type: string, name: string, system: any) {
  if (!missingDamage(system)) return null
  const found = (await compendiumIndex()).get(`${type}:${name.trim().toLowerCase()}`)
  if (!found) return null
  const source = (await found.pack.getDocument(found.id))?.system
  if (!source || missingDamage(source)) return null
  return {
    damage: foundry.utils.deepClone(source.damage),
    isAttack: system.isAttack || source.isAttack,
    upgrades: Object.fromEntries(DAMAGE_KEYS.map((key) => [key, source.upgrades?.[key] ?? ''])),
  }
}

/** Fill raw item data before an actor is created (used by the importer). */
export async function fillDamageData(items: any[]) {
  for (const item of items) {
    if (item.type !== 'skill' && item.type !== 'spell') continue
    const fill = await damageFor(item.type, item.name, item.system)
    if (fill) item.system = foundry.utils.mergeObject(item.system ?? {}, fill, { inplace: false })
  }
  return items
}

/** Repair an existing actor's skills and spells. Returns how many were filled. */
export async function fillActorDamage(actor: any) {
  const updates: any[] = []
  for (const item of actor.items) {
    if (item.type !== 'skill' && item.type !== 'spell') continue
    const fill = await damageFor(item.type, item.name, item._source.system)
    if (fill) updates.push({ _id: item.id, system: fill })
  }
  if (updates.length) await actor.updateEmbeddedDocuments('Item', updates)
  return updates.length
}
