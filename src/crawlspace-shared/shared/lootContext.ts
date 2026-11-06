import type { DatabaseContent } from '../api/types'
import type { LootContext } from './lootGenerator'
import { statDefinitions } from './inventoryItems'
import { linkedContent, spellKey, spellRecord, spellRarity } from './lootSpells'

export function lootContext(data: Record<string, unknown>, database: DatabaseContent[]): LootContext {
  const rows = (value: unknown): Record<string, any>[] => (Array.isArray(value) ? value : [])
  const character = (data.character ?? {}) as Record<string, unknown>
  const effects = [
    ...rows(data.inventory)
      .filter((i) => i.equipped)
      .flatMap((i) => rows(i.properties?.effects)),
    ...['internalBuffs', 'externalBuffs', 'customDebuffs'].flatMap((key) =>
      rows(data[key])
        .filter((b) => b.active)
        .flatMap((b) => rows(b.properties?.effects)),
    ),
    ...['racialAbilities', 'classAbilities', 'otherAbilities'].flatMap((key) =>
      rows(data[key]).flatMap((a) => rows(a.properties?.effects)),
    ),
  ]
  const alwaysEffects = [...effects]
  // Skill-granted effects use the same required-Rank condition as the sheet.
  for (const skill of rows(data.skills)) {
    const overrides = data.skillEnhancedOverrides as Record<string, string> | undefined
    const rank = overrides?.[skill.id]
      ? Number(overrides[skill.id])
      : skill.unenhancedRank === ''
        ? Number.NaN
        : Number(skill.unenhancedRank || 0) +
          alwaysEffects
            .filter((e) => e.type === 'skillRank' && e.target === skill.name)
            .reduce((sum, e) => sum + (Number(e.value) || 0), 0)
    effects.push(
      ...rows(skill.effects).filter((e) => String(e.requiredRank ?? '').trim() && rank >= Number(e.requiredRank)),
    )
  }
  const stats = Object.fromEntries(
    statDefinitions.map((stat, i) => {
      const override = (data.attributeOverrides as Record<string, string> | undefined)?.[i]
      const base = Number(rows(data.attributeValues)[i]?.unenhanced || 0)
      return [
        stat.code,
        override !== undefined && override !== ''
          ? Number(override) || 0
          : base +
            effects
              .filter((e) => e.type === 'statBonus' && e.target === stat.code)
              .reduce((sum, e) => sum + (Number(e.value) || 0), 0),
      ]
    }),
  )
  const skills = new Map<string, LootContext['skills'][number]>()
  for (const entry of database.filter((e) => e.content_type === 'skill')) {
    skills.set(spellKey(entry.name), {
      name: entry.name,
      passive: /passive/i.test(String(entry.data.checkType ?? '')),
      details: String(entry.data.details ?? ''),
      contentLink: linkedContent(entry),
    })
  }
  for (const skill of rows(data.skills)) {
    const name = String(skill.name ?? '').trim()
    const existing = skills.get(spellKey(name))
    if (name && !existing)
      skills.set(spellKey(name), {
        name,
        passive: /passive/i.test(String(skill.checkType ?? skill.details ?? '')),
        details: String(skill.details ?? ''),
      })
  }
  const spells = new Map<string, LootContext['spells'][number]>()
  for (const entry of database.filter((e) => e.content_type === 'spell')) {
    const record = spellRecord(entry.name, entry.data)
    spells.set(spellKey(entry.name), {
      name: entry.name,
      details: record.details,
      record,
      rarity: spellRarity(entry.name),
      contentLink: linkedContent(entry),
    })
  }
  for (const spell of rows(data.spells)) {
    const name = String(spell.name ?? '').trim()
    if (name && !spells.has(spellKey(name))) {
      const record = spellRecord(name, spell)
      spells.set(spellKey(name), { name, details: record.details, record, rarity: spellRarity(name) })
    }
  }
  return {
    floor: lootFloor(character.floor),
    stats,
    skills: [...skills.values()],
    spells: [...spells.values()],
    consumables: database.filter(
      (e) => e.content_type === 'consumable' || /^(?:magic tome|spell scroll)/i.test(e.name),
    ),
    potions: database.filter((e) => itemContentType(e.content_type) && /potion/i.test(e.name)),
  }
}
const itemContentType = (type: string) =>
  type.startsWith('equipment_') || ['weapon', 'consumable', 'tattoo', 'other'].includes(type)
/** Crawlers start on Floor 1, so a blank or invalid sheet Floor generates Floor 1 loot. */
export function lootFloor(value: unknown) {
  const floor = Math.trunc(Number(value))
  return Number.isFinite(floor) && floor >= 1 ? floor : 1
}
