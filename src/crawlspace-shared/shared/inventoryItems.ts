import { effectChange } from './effectValues'
import { cloneContentEffects } from './contentPreservation'
import { createInventoryItem, type InventoryEntry, type EffectProperty } from './contentModels'
import { normalizeHealing } from './healing'
import { withManaRestore } from './manaRestore'
import type { DatabaseContent } from '../api/types'
import { normalizeAccessorySlot } from './equipmentSlots'

export type InventoryItem = InventoryEntry & { id: string }
export const statDefinitions = [
  { code: 'STR', name: 'Strength', mod: 'STR MOD' },
  { code: 'INT', name: 'Intelligence', mod: 'INT MOD' },
  { code: 'CON', name: 'Constitution', mod: 'CON MOD' },
  { code: 'DEX', name: 'Dexterity', mod: 'DEX MOD' },
  { code: 'CHA', name: 'Charisma', mod: 'CHA MOD' },
] as const
export const gearSlots = ['Head', 'Torso', 'Arms', 'Hands', 'Legs', 'Feet', 'Accessory']

/** Clear dependent choices when their parent classification changes. */
type ItemProperties = Omit<InventoryEntry['properties'], 'itemType'> & { itemType: string }
export function updateItemProperties<T extends ItemProperties>(properties: T, updates: Partial<ItemProperties>): T {
  const next = { ...properties, ...updates } as T
  if (updates.itemType !== undefined && updates.itemType !== properties.itemType) {
    next.equipment = { slot: '' }
    next.weapon = { type: '' }
    next.consumable = { type: '' }
    next.tattoo = { location: '' }
    next.armorDr = ''
  }
  if (updates.weapon && updates.weapon.type !== properties.weapon.type) delete next.weapon.ammunitionId
  if (
    properties.itemType === 'consumable' &&
    properties.consumable.type === 'explosives' &&
    (next.itemType !== 'consumable' || next.consumable.type !== 'explosives')
  ) {
    next.damageFormula = ''
    next.damageTypes = []
  }
  return next
}

/** Convert percentage stat effects to a fixed bonus when an item is first equipped. */
export function resolveItemStatPercentBonuses<T extends { properties: { effects: EffectProperty[] } }>(
  item: T,
  baseStats: Partial<Record<(typeof statDefinitions)[number]['code'], string>>,
): T {
  let changed = false
  const effects = item.properties.effects.map((effect) => {
    if (effect.type !== 'statBonusPercent' || effect.value.trim() === '') return effect
    const baseValue = baseStats[effect.target as (typeof statDefinitions)[number]['code']]
    if (baseValue === undefined || baseValue.trim() === '') return effect
    const base = Number(baseValue)
    const percent = Number(effect.value)
    if (!Number.isFinite(base) || !Number.isFinite(percent)) return effect
    changed = true
    const value = String(Math.floor((base * percent) / 100))
    return {
      ...effect,
      type: 'statBonus' as const,
      value,
      statPercent: { percent: effect.value, target: effect.target, fixedValue: value },
    }
  })
  return changed ? { ...item, properties: { ...item.properties, effects } } : item
}

/** Percentages use only the raw stat, never an enhanced value or another bonus. */
export function statEffectValue(
  effect: { type?: string; target?: string; value?: unknown; statPercent?: EffectProperty['statPercent'] },
  base: unknown,
  dynamic = false,
) {
  const saved = effect.statPercent
  if (
    effect.type === 'statBonusPercent' &&
    !dynamic &&
    saved &&
    saved.target === effect.target &&
    saved.percent === effect.value
  )
    return Number(saved.fixedValue) || 0
  const percent =
    effect.type === 'statBonusPercent'
      ? effect.value
      : dynamic && saved && saved.target === effect.target && saved.fixedValue === effect.value
        ? saved.percent
        : undefined
  if (percent !== undefined) {
    if (base === '' || base === undefined || !Number.isFinite(Number(base)) || !Number.isFinite(Number(percent)))
      return 0
    return Math.floor((Number(base) * Number(percent)) / 100)
  }
  if (effect.type !== 'statBonus') return 0
  const number = Number(effect.value)
  if (Number.isFinite(number)) return number
  return effectChange(String(effect.value ?? ''), Number(base) || 0)
}

export function snapshotStatPercentBonuses<T extends { properties: { effects: EffectProperty[] } }>(
  item: T,
  base: Partial<Record<(typeof statDefinitions)[number]['code'], string>>,
): T {
  let changed = false
  const effects = item.properties.effects.map((effect) => {
    if (
      effect.type !== 'statBonusPercent' ||
      !effect.value.trim() ||
      (effect.statPercent?.target === effect.target && effect.statPercent.percent === effect.value)
    )
      return effect
    const value = base[effect.target as keyof typeof base]
    if (
      value === undefined ||
      value === '' ||
      !Number.isFinite(Number(value)) ||
      !Number.isFinite(Number(effect.value))
    )
      return effect
    changed = true
    return {
      ...effect,
      statPercent: {
        target: effect.target,
        percent: effect.value,
        fixedValue: String(Math.floor((Number(value) * Number(effect.value)) / 100)),
      },
    }
  })
  return changed ? { ...item, properties: { ...item.properties, effects } } : item
}

export function freezeStatPercentEntries<T extends { properties: { effects: EffectProperty[] } }>(
  entries: T[],
  base: Partial<Record<(typeof statDefinitions)[number]['code'], string>>,
  active: (entry: T) => boolean,
) {
  const next = entries.map((entry) => (active(entry) ? snapshotStatPercentBonuses(entry, base) : entry))
  return next.some((entry, index) => entry !== entries[index]) ? next : entries
}

/** Shared database-to-sheet import used by both the sheet and loot preview. */
export function importInventoryItem(content: DatabaseContent): InventoryItem {
  const base = createInventoryItem()
  const raw =
    content.data.properties && typeof content.data.properties === 'object'
      ? (content.data.properties as Partial<InventoryEntry['properties']>)
      : {}
  const type = ['equipment', 'weapon', 'consumable', 'tattoos'].includes(raw.itemType ?? '')
    ? raw.itemType
    : content.content_type.startsWith('equipment_')
      ? 'equipment'
      : content.content_type === 'tattoo'
        ? 'tattoos'
        : ['weapon', 'consumable'].includes(content.content_type)
          ? content.content_type
          : 'other'
  return {
    ...base,
    ...content.data,
    id: crypto.randomUUID(),
    name: content.name,
    expanded: false,
    properties: {
      ...base.properties,
      ...withManaRestore(raw),
      ...normalizeHealing(raw),
      itemType: type as InventoryEntry['properties']['itemType'],
      equipment: {
        ...base.properties.equipment,
        ...raw.equipment,
        slot: normalizeAccessorySlot(raw.equipment?.slot ?? ''),
      },
      weapon: { ...base.properties.weapon, ...raw.weapon },
      consumable: { ...base.properties.consumable, ...raw.consumable },
      tattoo: {
        ...base.properties.tattoo,
        ...raw.tattoo,
        location: normalizeAccessorySlot(raw.tattoo?.location ?? ''),
      },
      effects: cloneContentEffects(raw.effects, true),
      ...(raw.spells ? { spells: structuredClone(raw.spells).map((s) => ({ ...s, id: crypto.randomUUID() })) } : {}),
    },
  }
}

export function inventoryContentType(item: InventoryEntry) {
  const type = item.properties.itemType
  if (type === 'tattoos') return 'tattoo'
  if (type !== 'equipment') return type
  const slot = item.properties.equipment.slot
  return `equipment_${['Head', 'Torso', 'Arms', 'Hands', 'Legs', 'Feet'].includes(slot) ? slot.toLowerCase() : 'accessory'}`
}

export function describeInventoryItem(item: InventoryEntry) {
  const p = item.properties
  return [
    p.itemType,
    p.equipment.slot,
    p.weapon.type,
    p.consumable.type,
    p.armorDr && `Armor DR +${p.armorDr}`,
    ...p.effects.map(
      (e) => `${e.type} ${e.target} ${e.value}${e.slots.length ? ` (slots ${e.slots.join(', ')})` : ''}`,
    ),
    ...(p.spells ?? []).map(
      (s) =>
        `${s.usage} Spell ${s.spell.name}, Rank ${s.rank}, Mana ${s.mana}${s.cooldown ? `, cooldown ${s.cooldown}` : ''}: ${s.spell.details}`,
    ),
    ...p.statBonuses.filter((e) => e.stat && e.value).map((e) => `${e.stat} +${e.value}`),
    ...p.skillBonuses.filter((e) => e.skill && e.value).map((e) => `${e.skill} +${e.value}`),
    ...p.spellBonuses.filter((e) => e.spell && e.value).map((e) => `${e.spell} +${e.value}`),
    ...p.healthBonuses.filter((e) => e.value).map((e) => `Health +${e.value} (slots ${e.slots.join(', ')})`),
    ...p.manaBonuses.filter((e) => e.value).map((e) => `Mana +${e.value}`),
    ...p.moveBonuses.filter((e) => e.value).map((e) => `Move +${e.value}`),
    ...p.stepBonuses.filter((e) => e.value).map((e) => `Step +${e.value}`),
    p.isHealing && `Healing: ${p.healingFormula} ${p.healingUnit}`,
    p.details,
  ]
    .filter(Boolean)
    .join('; ')
}

export function finalizeLootItem(item: InventoryItem): InventoryItem {
  // Replace only the generated summary, preserving the GM's other notes.
  const notes = item.notes.replace(/(?:^|\n)\[Structured loot\][\s\S]*$/, '')
  return {
    ...item,
    equipped: false,
    expanded: false,
    notes: `${notes}\n[Structured loot] ${describeInventoryItem(item)}`.trim(),
  }
}
