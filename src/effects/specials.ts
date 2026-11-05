/**
 * Readers for the `crawlspace.special` effects an actor carries (conditionEffects.ts). The change handler
 * collects them into `actor.system.specials`; rolls, damage and the round tick read them here.
 */
import { resolveFormulaTokens } from '../rules/core'
import { durationSeconds } from '../rules/time'
export { durationSeconds } from '../rules/time'

export type Special = {
  type: string
  source: string
  target?: string
  value?: string
  damageTypes?: string[]
  damageScope?: string
  armorPiercing?: boolean
  interval?: string
  fastInterval?: string
  fastStat?: string
  /** The item whose effect this is (a skill's rank-gated bonus scales with that skill's Rank). */
  itemId?: string
  effectId?: string
  stacks?: number
}

export type DamageKind = 'skill' | 'spell' | undefined
export type DamageBonus = { label: string; formula: string; types: string[] }

const names = (target: unknown) =>
  String(target ?? '')
    .split(/[,;\n]/)
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)

export const specialsOf = (actor: any, type: string): Special[] =>
  (actor?.system?.specials ?? []).filter((special: Special) => special.type === type)

/** `Weapon` matches any weapon attack, and other targets match the skill or spell the attack uses. */
function damageModifierApplies(special: Special, sources: string[], weapon: boolean, kind: DamageKind) {
  const list = names(special.target)
  const lowered = sources.map((source) => source.toLowerCase())
  if (special.damageScope === 'weapon') return weapon
  if (special.damageScope) {
    const named = lowered.some((source) => list.includes(source))
    return list.length ? named : kind === (special.damageScope === 'skills' ? 'skill' : 'spell')
  }
  return (weapon && list.includes('weapon')) || lowered.some((source) => list.includes(source))
}

/**
 * Rank for RANK and RANK_DIE in a special's formula: the skill or spell that owns it, else the Rank of the
 * skill or spell making the attack (a condition or gear bonus aimed at that skill).
 */
const ownerRank = (actor: any, special: Special, attackRank: number) => {
  const item = special.itemId ? actor.items.get(special.itemId) : null
  return item?.system?.rank ? Number(item.system.rank.total) || 0 : attackRank
}

/** Damage Modifier bonuses that cover an attack. Stacks multiply a condition's bonus. */
export function damageBonuses(actor: any, sources: string[], weapon: boolean, kind: DamageKind, attackRank = 0): DamageBonus[] {
  return specialsOf(actor, 'damageBonus')
    .filter((special) => String(special.value ?? '').trim() && damageModifierApplies(special, sources, weapon, kind))
    .map((special) => {
      const formula = resolveFormulaTokens(String(special.value), { rank: ownerRank(actor, special, attackRank) }).replace(/^\+/, '')
      const stacks = Math.max(1, Number(special.stacks) || 1)
      return { label: special.source, formula: stacks > 1 ? `${stacks}*(${formula})` : formula, types: special.damageTypes ?? [] }
    })
}

/**
 * An attack ignores DR when an Armor Piercing effect sits on the weapon, skill or spell it uses, or when a
 * Damage Modifier that covers it is marked Armor Piercing (rollDamage.ts attackArmorPiercing).
 */
export function piercesArmor(actor: any, itemIds: string[], sources: string[], weapon: boolean, kind: DamageKind) {
  return (actor?.system?.specials ?? []).some(
    (special: Special) =>
      (special.type === 'armorPiercing' && !!special.itemId && itemIds.includes(special.itemId)) ||
      (special.type === 'damageBonus' && special.armorPiercing === true && damageModifierApplies(special, sources, weapon, kind)),
  )
}

/** Wisp Armor: incoming magic damage from this kind of source is capped. */
export const capsMagicDamage = (actor: any, kind: DamageKind = 'spell') =>
  specialsOf(actor, 'magicDamageCap').some(
    (special) => !special.target || special.target === (kind === 'skill' ? 'Skills' : 'Spells'),
  )

export const halvesAreaDamage = (actor: any) => specialsOf(actor, 'areaDamageHalf').length > 0

/** conditionEffects.ts regenAmount: a number, a stat code (its modifier), or a percentage of the maximum. */
export function regenAmount(value: unknown, maximum: number, statMod: (code: string) => number) {
  const text = String(value ?? '').trim()
  const percent = /^(\d+(?:\.\d+)?)\s*%$/.exec(text)
  if (percent) return Math.floor((maximum * Number(percent[1])) / 100)
  if (/^(STR|INT|CON|DEX|CHA)$/i.test(text)) return Math.max(0, Math.floor(statMod(text.toUpperCase())))
  return Math.max(0, Math.floor(Number(text) || 0))
}

/** Whether an actor has anything for regenAdvance to do. */
export const hasRegen = (actor: any) =>
  (actor?.system?.specials ?? []).some((special: Special) => special.type === 'manaPerRound' || special.type === 'regenPerRound')

/**
 * Regen effects count in-game seconds (a round is 10). Given the seconds already counted per effect and the
 * seconds that just passed, returns the mana and health slots restored and the seconds to keep per effect.
 */
export function regenAdvance(actor: any, elapsed: Record<string, number>, seconds: number, worldTime?: number) {
  const statMod = (code: string) => Number(actor.system.statMod?.(code)) || 0
  let mana = 0
  let slots = 0
  const next: Record<string, number> = {}
  for (const special of actor.system.specials ?? []) {
    if (special.type !== 'manaPerRound' && special.type !== 'regenPerRound') continue
    const key = `${special.effectId || special.source}-${special.type}`
    const item = special.itemId ? actor.items.get(special.itemId) : null
    const fast = !!special.fastInterval && !!special.fastStat && !!item && (Number(item.system?.rank?.total) || 0) >= statMod(special.fastStat)
    const interval = Math.max(1, durationSeconds(fast ? special.fastInterval : special.interval) ?? 10)
    const effect = item?.effects?.get(special.effectId) ?? actor.effects?.get(special.effectId)
    const start = effect?.start?.time
    const duration = effect?.duration?.seconds
    // A two-minute regeneration effect cannot restore eight hours of resources during a long rest.
    const activeSeconds = worldTime != null && Number.isFinite(start) && Number.isFinite(duration)
      ? Math.max(0, Math.min(worldTime, start + duration) - Math.max(worldTime - seconds, start))
      : seconds
    const total = (elapsed[key] ?? 0) + activeSeconds
    const ticks = Math.floor(total / interval)
    next[key] = total - ticks * interval
    if (!ticks) continue
    if (special.type === 'manaPerRound') mana += ticks * regenAmount(special.value, Number(actor.system.mana?.max) || 0, statMod)
    else slots += ticks * regenAmount(special.value, 10, () => 0)
  }
  return { mana, slots, elapsed: next }
}
