import { withPublishedAbilityTemplates } from './abilityTemplates'
import catalogue from './lootSpellTiers.json'
import type { DatabaseContent } from '../api/types'
import { createSpell, type ContentLink, type SpellEntry } from './contentModels'
import { normalizeHealing } from './healing'
import type { LootTier } from './lootData'

export type SpellRarity = 'Weak' | 'Standard' | 'Rare'
export const spellKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '')
export function spellRarity(name: string): SpellRarity | undefined {
  return catalogue.find((s) => spellKey(s.name) === spellKey(name))?.tier as SpellRarity | undefined
}
export function spellRarities(tier: LootTier, usage: 'scroll' | 'tome' | 'inherent'): SpellRarity[] {
  if (tier === 'Bronze' || (tier === 'Silver' && usage === 'tome')) return ['Weak']
  if (tier === 'Silver' || tier === 'Gold') return ['Weak', 'Standard']
  if (tier === 'Celestial') return ['Standard', 'Rare']
  return ['Weak', 'Standard', 'Rare']
}
export function linkedContent(content: DatabaseContent & { source?: string }): ContentLink {
  return {
    id: content.id,
    source: content.source ?? 'game',
    name: content.name,
    content_type: content.content_type,
    data: structuredClone(content.data),
  }
}
export function spellRecord(name: string, data: Record<string, unknown> = {}): SpellEntry {
  const row = catalogue.find((s) => spellKey(s.name) === spellKey(name))
  const fallback = row
    ? {
        checkType: row.type,
        mana: row.mana == null ? '' : String(row.mana),
        range: row.range ?? '',
        stat: row.stat?.toUpperCase() ?? '',
        details: row.notes ?? '',
        damageFormula: row.type === 'Attack' && /^\d+d\d+$/.test(row.damage ?? '') ? row.damage! : '',
        damageTypes: row.damageType ? row.damageType.split('/') : [],
      }
    : {}
  const isAttackSpell =
    typeof data.isAttackSpell === 'boolean'
      ? data.isAttackSpell
      : Boolean(
          data.isAttackSkill ||
          fallback.damageFormula ||
          data.damageFormula ||
          data.rank5DamageFormula ||
          data.rank10DamageFormula ||
          data.rank15DamageFormula,
        )
  const spell = { ...createSpell(), ...fallback, ...data, ...normalizeHealing(data), isAttackSpell, name } as SpellEntry
  // Blank character fields must not erase the database/spreadsheet description.
  for (const [key, value] of Object.entries(fallback))
    if (spell[key as keyof SpellEntry] === '') Object.assign(spell, { [key]: value })
  return withPublishedAbilityTemplates(spell, 'spell')
}
export function consumableSpellKind(content: DatabaseContent): 'scroll' | 'tome' | undefined {
  if (/tome/i.test(content.name)) return 'tome'
  if (/spell.*scroll|scroll.*(?:weak|standard|rare)|^scroll of (?!upgrade)/i.test(content.name)) return 'scroll'
  return undefined
}
export function consumableSpellName(content: DatabaseContent): string | undefined {
  const properties = content.data.properties as { spells?: { spell?: { name?: string } }[] } | undefined
  const existing = properties?.spells?.[0]?.spell?.name
  if (existing) return existing
  const match = /^(?:scroll|tome) of (.+)$/i.exec(content.name)
  return match?.[1]
}
export function consumableRarity(content: DatabaseContent): SpellRarity | undefined {
  const match = /\b(weak|standard|rare)\b/i.exec(content.name)
  return match
    ? ((match[1][0].toUpperCase() + match[1].slice(1).toLowerCase()) as SpellRarity)
    : spellRarity(consumableSpellName(content) ?? '')
}
