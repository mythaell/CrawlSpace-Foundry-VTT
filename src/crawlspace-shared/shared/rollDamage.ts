import { damageTypes } from './damageResponses'
import { healingRankDie, type HealingApplication } from './healing'
import { rollFormula } from '../dice/engine'

export type DamageRollTarget = {
  id: string
  name: string
  outcome?: string
  multiplier: number
  bonus: number
  critical?: boolean
  shieldBlocked?: boolean
}
export type RollDamageData = {
  types: string[]
  isArea?: boolean
  armorPiercing?: boolean
  targets?: DamageRollTarget[]
  sharedCriticalDice?: boolean
  /** The target already made a successful Shield Block, so the damage card starts with it pressed. */
  shieldBlocked?: boolean
  /** Spell cards and Magic Weapons deal magic damage. */
  magic?: boolean
  /** Thrown or fired rather than melee; Samurai Blade Clap needs Rank 5 to catch these. */
  ranged?: boolean
  /** The spell's Rank 1 base damage, rolled with the card, for Wisp Armor. */
  magicBase?: number
  magicSource?: 'skill' | 'spell'
  /** A stacking spell's damage card offers "Killing Blow?", which credits this spell. */
  killingBlowSpell?: import('./killingBlowStacks').KillingBlowSpell
}
export type DamageApplication = {
  amount: number
  types: string[]
  shieldBlock: boolean
  armorPiercing?: boolean
  magic?: boolean
  magicBase?: number
  magicSource?: 'skill' | 'spell'
}
export type DamageSummary = {
  shieldBlocked?: number
  resistanceBlocked?: number
  drBlocked?: number
  damageTaken?: number
}
export type HealthChangeUndo = () => boolean | void | Promise<boolean | void>
export type DamageResult = { message: string; undo: HealthChangeUndo; summary?: DamageSummary }
export type DamageTarget = {
  /** Cat-like Reflexes at Rank 10: Area damage is halved before anything else. */
  halvesArea?: boolean
  setHealth?: (slots: number) => void | Promise<void>
  healSlots?: (slots: number) => void | Promise<void>
  id: string
  name: string
  shieldBlock?: { rank: number; strength: number }
  /** A creature's own sheet data, which its stat-based condition shields are worked out from. */
  creatureData?: Record<string, any>
  apply: (damage: DamageApplication) => DamageResult | void | Promise<DamageResult | void>
  heal?: (healing: HealingApplication) => { message: string; undo: () => boolean | void } | void
}

export function normalizeDamageTypes(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.flatMap(normalizeDamageTypes))]
  if (typeof value !== 'string') return []
  return damageTypes.filter((type) => new RegExp(`\\b${type}\\b`, 'i').test(value))
}

/** Empty upgrade fields inherit the last unlocked damage type selection. */
export function rankDamageTypes(
  source:
    | {
        damageTypes?: unknown
        rank5DamageTypes?: unknown
        rank10DamageTypes?: unknown
        rank15DamageTypes?: unknown
      }
    | undefined,
  rank: number,
): string[] {
  if (!source) return []
  for (const tier of [15, 10, 5] as const) {
    const types = normalizeDamageTypes(source[`rank${tier}DamageTypes`])
    if (rank >= tier && types.length) return types
  }
  return normalizeDamageTypes(source.damageTypes)
}

/** Damage tiers are complete cumulative formulas; Rank dice stay tied to the actual used Rank. */
export function rankDamageFormula(
  source: {
    damageFormula?: string
    rank5DamageFormula?: string
    rank10DamageFormula?: string
    rank15DamageFormula?: string
  },
  rank: number,
): string {
  let formula = source.damageFormula?.trim() ?? ''
  for (const tier of [15, 10, 5] as const) {
    const upgraded = source[`rank${tier}DamageFormula`]?.trim()
    if (rank >= tier && upgraded) {
      formula = upgraded
      break
    }
  }
  return formula
}

/** Tier 1 is one die per dice group, whatever the attack's tier: `3d8+5` is `1d8+5`. */
export const tierOneFormula = (formula: string) =>
  formula.replace(/\d*d(\d+|%)(?:k[hl]\d*)?/gi, (_match, sides: string) => `1d${sides}`)

/** Wisp Armor needs a Rank 1 base for all magic damage. A mob has no Rank 1 entry, so its attack gives the tier 1 roll. */
export function withMagicBase(data: RollDamageData, formula: string): RollDamageData {
  if (!data.magic || data.magicBase !== undefined) return data
  try {
    return { ...data, magicBase: rollFormula(tierOneFormula(formula)).total }
  } catch {
    return data
  }
}

/** Generated Rank dice are additive bonuses, never critical-hit base damage. */
export function splitRankDamageFormula(formula: string, rank: number) {
  let count = 0
  const baseFormula = formula.replace(
    /([+-]?)\s*(?:(\d+)\s*\*\s*)?\bRANK_DIE\b/gi,
    (_match, sign: string, coefficient?: string) => {
      count += (sign === '-' ? -1 : 1) * Number(coefficient ?? 1)
      return sign ? '' : '0'
    },
  )
  return {
    baseFormula,
    bonusFormula: count
      ? `${count < 0 ? '-' : ''}${Array.from({ length: Math.abs(count) }, () => `(${healingRankDie(rank)})`).join('+')}`
      : '',
  }
}

/** Owning the Shield Block skill (any rank, including 0) with a shield equipped allows a physical block. */
export function shieldBlockAllowed(data: RollDamageData, rank: number) {
  return (
    !data.isArea && (rank >= 5 || data.types.every((type) => ['Bludgeoning', 'Piercing', 'Slashing'].includes(type)))
  )
}

/** A successful physical Shield Block; the skill check remains a separate roll. */
export function blockedDamage(amount: number, rank: number, strength: number) {
  return Math.max(0, amount / 2 - (rank >= 15 ? Math.max(0, strength) : 0))
}

/** A shield is an equipped equipment item with its Shield box checked (and DR, if it has any). */
export function isShieldItem(item: {
  properties: { itemType: string; armorDr?: string; equipment?: { isShield?: boolean } }
}) {
  return (
    item.properties.itemType === 'equipment' &&
    item.properties.equipment?.isShield === true &&
    (item.properties.armorDr === '' || item.properties.armorDr === undefined || Number(item.properties.armorDr) > 0)
  )
}

export function hasEquippedPhysicalShield(
  items: {
    name: string
    equipped: boolean
    properties: { itemType: string; armorDr?: string; equipment?: { isShield?: boolean; slot?: string } }
  }[],
) {
  return items.some((item) => item.equipped && isShieldItem(item))
}

type PiercingEffect = { type: string; requiredRank?: string; armorPiercing?: boolean }
const effectPierces = (effect: PiercingEffect) =>
  effect.type === 'armorPiercing' || (effect.type === 'damageBonus' && effect.armorPiercing === true)

/** Pass only the weapon/item and skill/spell used by this attack, never all equipped items. */
export function attackArmorPiercing(
  source: { armorPiercing?: boolean; effects?: PiercingEffect[] } | undefined,
  weapon: { effects?: PiercingEffect[] } | undefined,
  rank: number,
) {
  return (
    source?.armorPiercing === true ||
    !!source?.effects?.some((effect) => effectPierces(effect) && Number(effect.requiredRank || 0) <= rank) ||
    !!weapon?.effects?.some(effectPierces)
  )
}
