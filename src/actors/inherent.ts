/**
 * Inherent spells (CrawlSpace cooldowns.ts inherentSpellGrants): spells granted by an active effect's
 * "Inherent Spell" rule, plus spell items whose usage is Inherent. Granted spells are looked up by name in
 * the world and in compendia, then cast as a temporary item at the granted Rank. They never cost mana.
 */
const cache = new Map<string, any>()

export async function findSpellData(name: string) {
  const key = name.trim().toLowerCase()
  if (cache.has(key)) return cache.get(key)
  let data: any = game.items.find((item: any) => item.type === 'spell' && item.name.toLowerCase() === key)?.toObject() ?? null
  if (!data) {
    for (const pack of game.packs.filter((pack: any) => pack.documentName === 'Item')) {
      const index = await pack.getIndex({ fields: ['type'] })
      const entry = index.find((entry: any) => entry.type === 'spell' && entry.name.toLowerCase() === key)
      if (!entry) continue
      data = (await pack.getDocument(entry._id))?.toObject() ?? null
      if (data) data._stats = { ...(data._stats ?? {}), compendiumSource: `Compendium.${pack.collection}.Item.${entry._id}` }
      break
    }
  }
  cache.set(key, data)
  return data
}

export type InherentRow = {
  key: string
  name: string
  img: string
  rank: number
  stat: string
  range: string
  checkType: string
  cooldown: string
  source: string
  itemId?: string
  missing?: boolean
}

export async function inherentSpellRows(actor: any): Promise<InherentRow[]> {
  const rows: InherentRow[] = []
  for (const item of actor.items) {
    if (item.type !== 'spell' || item.system.usage !== 'inherent') continue
    rows.push({
      key: item.id,
      itemId: item.id,
      name: item.name,
      img: item.img,
      rank: item.system.rank.total,
      stat: item.system.stat,
      range: item.system.range,
      checkType: item.system.checkType,
      cooldown: item.system.cooldown,
      source: '',
    })
  }
  for (const [index, special] of (actor.system.specials ?? []).entries()) {
    if (special.type !== 'inherentSpell' || !String(special.target ?? '').trim()) continue
    const name = String(special.target).trim()
    const data = await findSpellData(name)
    rows.push({
      key: `grant-${index}`,
      name: data?.name ?? name,
      img: data?.img ?? 'icons/svg/book.svg',
      rank: Number(special.value) || 1,
      stat: data?.system?.stat ?? 'INT',
      range: data?.system?.range ?? '',
      checkType: data?.system?.checkType ?? '',
      cooldown: String(special.cooldown ?? data?.system?.cooldown ?? ''),
      source: special.source ?? '',
      missing: !data,
    })
  }
  return rows
}

/** Cast a granted spell: a temporary copy of the spell at the granted Rank, owned by the actor. */
export async function castInherent(actor: any, name: string, rank: number, options: { fast?: boolean; toChat?: boolean } = {}) {
  const data = await findSpellData(name)
  if (!data) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.SpellNotFound', { name }))
  const copy = foundry.utils.mergeObject(foundry.utils.deepClone(data), {
    _id: foundry.utils.randomID(),
    system: { usage: 'inherent', rank: { value: rank, override: rank } },
  })
  const item = new CONFIG.Item.documentClass(copy, { parent: actor })
  return options.toChat ? item.toMessage() : item.use(options)
}
