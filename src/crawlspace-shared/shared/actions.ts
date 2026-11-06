import type { AbilityTemplateFields } from './abilityTemplates'
import type { UseEffectFields } from './useEffects'
import { isHealingSource, rankHealingFormula, type HealingFields } from './healing'

export type SheetAction = {
  id: string
  name: string
  formula: string
  effects: string
  notes: string
  expanded: boolean
  sourceType?: 'skill' | 'spell' | 'item' | ''
  sourceId?: string
  linkedSkillId?: string
  linkedItemId?: string
  rank?: string
  modifier?: string
  isHealing?: boolean
  healingFormula?: string
  consumable?: boolean
}
export type ActionSource = HealingFields &
  UseEffectFields &
  AbilityTemplateFields & {
    id: string
    name: string
    type: 'skill' | 'spell' | 'item'
    rank: string
    modifier: string
    checkType?: string
    stat?: string
    baseRank?: string
    mana?: string
    inherentGrantId?: string
    inherentItemId?: string
    inherentCooldown?: string
    /** A Skill's or Spell's cooldown, started when the action uses it. */
    cooldown?: string
    effects: string
    notes: string
    consumable?: boolean
  }
type InventorySource = {
  id: string
  name: string
  equipped: boolean
  quantity: string
  notes: string
  properties: HealingFields & { itemType: string; details: string }
}

export function availableActionItems<T extends InventorySource>(items: T[], hotlist: string[]) {
  return items.filter(
    (item) =>
      item.name.trim() && (item.equipped || item.properties.itemType === 'consumable' || hotlist.includes(item.name)),
  )
}

export function resolveAction(action: SheetAction, sources: ActionSource[], skills: ActionSource[]) {
  const source = sources.find((source) => source.type === action.sourceType && source.id === action.sourceId)
  const skill =
    action.sourceType === 'spell'
      ? undefined
      : action.sourceType === 'skill'
        ? source
        : skills.find((skill) => skill.id === action.linkedSkillId)
  const ranked = skill ?? source
  const rank = action.rank ?? ranked?.rank ?? ''
  const healingSource = source && isHealingSource(source) ? source : skill
  const healing = action.isHealing ?? (healingSource ? isHealingSource(healingSource) : false)
  return {
    source,
    skill,
    rank,
    name: action.name || source?.name || 'Action',
    modifier: action.modifier ?? ranked?.modifier ?? '',
    healing,
    healingFormula: healing
      ? (action.healingFormula ?? (healingSource ? actionHealingFormula(healingSource, Number(rank)) : ''))
      : '',
    healingUnit: healingSource?.healingUnit ?? 'slots',
    linkedItemId: action.linkedItemId ?? (action.sourceType === 'item' ? action.sourceId : '') ?? '',
    consumable: action.consumable ?? source?.consumable ?? false,
    effects: action.effects || source?.effects || skill?.effects || '',
    notes: action.notes || source?.notes || skill?.notes || '',
  }
}

export function actionHealingFormula(source: ActionSource, rank: number) {
  if (
    source.type === 'skill' &&
    ['firstaid', 'fielddressing'].includes(source.name.toLowerCase().replace(/[^a-z]/g, '')) &&
    isHealingSource(source)
  )
    return rank >= 15 ? '2' : '1'
  return rankHealingFormula(source, rank)
}

export function chooseActionSource(action: SheetAction, source?: ActionSource): SheetAction {
  return {
    ...action,
    sourceType: source?.type ?? '',
    sourceId: source?.id ?? '',
    name: source?.name ?? '',
    linkedSkillId: source?.type === 'skill' ? source.id : '',
    linkedItemId: source?.type === 'item' ? source.id : '',
    rank: undefined,
    modifier: undefined,
    isHealing: undefined,
    healingFormula: undefined,
    consumable: undefined,
    formula: '',
    effects: source?.effects ?? '',
    notes: source?.notes ?? '',
  }
}

export function actionCheckFormula(rank: string, modifier: string) {
  return (
    '1d20' +
    [rank, modifier]
      .map(Number)
      .filter((value) => Number.isFinite(value) && value !== 0)
      .map((value) => (value > 0 ? ` + ${value}` : ` - ${Math.abs(value)}`))
      .join('')
  )
}

export function consumeActionItem<T extends { id: string; quantity: string }>(inventory: T[], itemId: string) {
  const item = inventory.find((item) => item.id === itemId)
  if (!item || !Number.isFinite(Number(item.quantity)) || Number(item.quantity) < 1) return null
  return inventory.map((entry) =>
    entry.id === itemId ? { ...entry, quantity: String(Number(entry.quantity) - 1) } : entry,
  )
}
