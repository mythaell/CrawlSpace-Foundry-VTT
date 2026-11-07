/**
 * Handlers for the `crawlspace.*` ActiveEffect change types. Core calls a registered handler instead of its
 * own field logic; each one writes into the derived buckets that `prepareBaseData` reset.
 */
import { statKeyFromCode } from '../config'
import { CUSTOM_CHANGE_TYPES } from './mapping'
import { unwrapTriggered } from './trigger-events'

type Handler = (target: any, change: any, options: { replacementData?: Record<string, unknown> }) => void

const amount = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const nameKey = (value: unknown) =>
  String(value ?? '')
    .trim()
    .toLowerCase()

const addRank =
  (bucket: 'skillRanks' | 'spellRanks' | 'baseSkillRanks' | 'baseSpellRanks'): Handler =>
  (actor, change) => {
    const ranks = actor.system?.bonuses?.[bucket]
    if (!ranks) return
    for (const name of String(change.key).split(',').map(nameKey).filter(Boolean))
      ranks[name] = (ranks[name] ?? 0) + amount(change.value)
  }

export const CHANGE_TYPE_HANDLERS: Record<string, { label: string; defaultPriority: number; handler: Handler }> = {
  [CUSTOM_CHANGE_TYPES.skillRank]: { label: 'Skill Rank (key: skill name)', defaultPriority: 20, handler: addRank('skillRanks') },
  [CUSTOM_CHANGE_TYPES.spellRank]: { label: 'Spell Rank (key: spell name)', defaultPriority: 20, handler: addRank('spellRanks') },
  [CUSTOM_CHANGE_TYPES.baseSkillRank]: { label: 'Base Skill Rank (key: skill name)', defaultPriority: 15, handler: addRank('baseSkillRanks') },
  [CUSTOM_CHANGE_TYPES.baseSpellRank]: { label: 'Base Spell Rank (key: spell name)', defaultPriority: 15, handler: addRank('baseSpellRanks') },
  [CUSTOM_CHANGE_TYPES.healthBonus]: {
    label: 'Health Slot Bonus (key: slots, e.g. 1,2,3)',
    defaultPriority: 20,
    handler: (actor, change) => {
      const slots = actor.system?.bonuses?.healthSlots
      if (!slots) return
      for (const slot of String(change.key).split(',').map((s) => s.trim()).filter(Boolean))
        slots[slot] = (slots[slot] ?? 0) + amount(change.value)
    },
  },
  [CUSTOM_CHANGE_TYPES.statPercent]: {
    label: 'Stat Bonus % of Base (key: STR/INT/CON/DEX/CHA)',
    defaultPriority: 25,
    handler: (actor, change) => {
      const stat = statKeyFromCode(change.key)
      const attribute = stat ? actor.system?.attributes?.[stat] : null
      if (!attribute) return
      attribute.percentBonus += Math.floor(((Number(attribute.value) || 0) * amount(change.value)) / 100)
    },
  },
  [CUSTOM_CHANGE_TYPES.modLoss]: {
    label: 'Lose Stat Modifier (key: stat)',
    defaultPriority: 90,
    handler: (actor, change) => {
      const stat = statKeyFromCode(change.key)
      if (stat && actor.system?.attributes?.[stat]) actor.system.attributes[stat].modLost = true
    },
  },
  [CUSTOM_CHANGE_TYPES.rollMode]: {
    label: 'Roll Mode (key: attackMode|checkMode|evadeMode|incomingAttackMode:Target)',
    defaultPriority: 20,
    handler: (actor, change) => {
      const [kind, target = 'All'] = String(change.key).split(':')
      actor.system?.rollModes?.push({ kind, target, value: String(change.value), source: change.effect?.name ?? '' })
    },
  },
  [CUSTOM_CHANGE_TYPES.triggered]: {
    label: 'CrawlSpace Triggered Rule (value: trigger and rule)',
    defaultPriority: 20,
    // Doesn't apply now: listed for triggers.ts to carry out when its trigger happens.
    handler: (actor, change) => {
      const triggered = unwrapTriggered(change)
      const effect = change.effect
      if (!triggered || !actor.system?.triggers) return
      const item = effect?.parent?.documentName === 'Item' ? effect.parent : null
      const index = (effect?.system?.changes ?? []).findIndex((entry: any) => entry.type === change.type && entry.value === change.value)
      actor.system.triggers.push({
        ...triggered,
        source: effect?.name ?? item?.name ?? '',
        effectId: effect?.id ?? '',
        itemId: item?.id ?? '',
        itemName: item?.name ?? '',
        itemType: item?.type ?? '',
        index: Math.max(0, index),
      })
    },
  },
  [CUSTOM_CHANGE_TYPES.special]: {
    label: 'CrawlSpace Special (key: effect type)',
    defaultPriority: 20,
    handler: (actor, change) => {
      let data: Record<string, unknown> = {}
      try {
        data = typeof change.value === 'string' ? JSON.parse(change.value) : (change.value ?? {})
      } catch {
        data = { value: change.value }
      }
      const effect = change.effect
      const item = effect?.parent?.documentName === 'Item' ? effect.parent : null
      actor.system?.specials?.push({
        type: String(change.key),
        source: item?.name ?? effect?.name ?? '',
        ...data,
        itemId: item?.id ?? '',
        effectId: effect?.id ?? '',
        stacks: Number(effect?.system?.stacks) || 1,
      })
    },
  },
}
