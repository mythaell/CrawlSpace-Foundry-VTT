import { isUnarmedSkill } from './characterSheetRules'
import { cloneContentEffects, preserveContentFields } from './contentPreservation'
import { normalizeHealing } from './healing'
import { normalizeAbilityTemplateFields } from './abilityTemplates'
import { normalizeDamageTypes } from './rollDamage'
import { importInventoryItem } from './inventoryItems'
import { createSkill, createSpell, createInventoryItem, createBuff } from './characterSheetModel'
import type { DatabaseContent } from '../api/types'

export type DatabasePickerType = 'skill' | 'spell' | 'item' | 'buff'
export type DatabasePickerSource = 'game' | 'homebrew'
export type DatabaseBuffTarget = 'internal' | 'external'

export const cloneDatabaseEffects = (value: unknown) => cloneContentEffects(value, true)

export const copyDatabaseSkill = (content: DatabaseContent): ReturnType<typeof createSkill> =>
  preserveContentFields(content.data, {
    ...createSkill(),
    ...content.data,
    ...normalizeHealing(content.data),
    ...normalizeAbilityTemplateFields(content.data),
    id: crypto.randomUUID(),
    name: content.name,
    isAttackSkill: Boolean(content.data.isAttackSkill),
    isUnarmed: isUnarmedSkill({ name: content.name, isUnarmed: content.data.isUnarmed as boolean | undefined }),
    damageTypes: normalizeDamageTypes(content.data.damageTypes),
    damageFormula: typeof content.data.damageFormula === 'string' ? content.data.damageFormula : '',
    rank5DamageFormula: typeof content.data.rank5DamageFormula === 'string' ? content.data.rank5DamageFormula : '',
    rank10DamageFormula: typeof content.data.rank10DamageFormula === 'string' ? content.data.rank10DamageFormula : '',
    rank15DamageFormula: typeof content.data.rank15DamageFormula === 'string' ? content.data.rank15DamageFormula : '',
    effects: cloneDatabaseEffects(content.data.effects),
  }) as ReturnType<typeof createSkill>

export const copyDatabaseSpell = (content: DatabaseContent): ReturnType<typeof createSpell> =>
  preserveContentFields(content.data, {
    ...createSpell(),
    ...content.data,
    ...normalizeHealing(content.data),
    ...normalizeAbilityTemplateFields(content.data),
    id: crypto.randomUUID(),
    name: content.name,
    isAttackSpell:
      typeof content.data.isAttackSpell === 'boolean'
        ? content.data.isAttackSpell
        : Boolean(
            content.data.isAttackSkill ||
            content.data.damageFormula ||
            content.data.rank5DamageFormula ||
            content.data.rank10DamageFormula ||
            content.data.rank15DamageFormula,
          ),
    damageTypes: normalizeDamageTypes(content.data.damageTypes),
    damageFormula: typeof content.data.damageFormula === 'string' ? content.data.damageFormula : '',
    rank5DamageFormula: typeof content.data.rank5DamageFormula === 'string' ? content.data.rank5DamageFormula : '',
    rank10DamageFormula: typeof content.data.rank10DamageFormula === 'string' ? content.data.rank10DamageFormula : '',
    rank15DamageFormula: typeof content.data.rank15DamageFormula === 'string' ? content.data.rank15DamageFormula : '',
  }) as ReturnType<typeof createSpell>

export const copyDatabaseItem = (content: DatabaseContent): ReturnType<typeof createInventoryItem> =>
  importInventoryItem(content) as ReturnType<typeof createInventoryItem>

export const copyDatabaseBuff = (content: DatabaseContent): ReturnType<typeof createBuff> => {
  const base = createBuff()

  const rawProperties =
    content.data.properties && typeof content.data.properties === 'object'
      ? (content.data.properties as Record<string, unknown>)
      : {}

  return preserveContentFields(content.data, {
    ...base,
    ...content.data,
    id: crypto.randomUUID(),
    name: content.name,
    expanded: false,
    properties: {
      ...base.properties,
      ...rawProperties,
      effects: cloneDatabaseEffects(rawProperties.effects),
    },
  }) as ReturnType<typeof createBuff>
}
