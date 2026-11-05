/** Pure rules ported from CrawlSpace `src/shared`. No Foundry globals here, so tests can import it directly. */

/** abilityScores.ts: crawler/creature ability score bands. Blank or invalid values give 0. */
export function abilityScoreModifier(value: unknown): number {
  if (value === '' || value === undefined || value === null || !Number.isFinite(Number(value))) return 0
  const tier = [2, 5, 9, 19, 49, 99, 149, 199, 299].findIndex((limit) => Number(value) <= limit)
  return tier < 0 ? 10 : tier + 1
}

export type AttackOutcome = 'Crit miss' | 'Major miss' | 'Miss' | 'Hit' | 'Amazing hit' | 'Critical hit'
export const SUCCESS_OUTCOMES: AttackOutcome[] = ['Hit', 'Amazing hit', 'Critical hit']

/** combat.ts attackOutcome: natural 1/20 first, then the margin against the difficulty. */
export function attackOutcome(total: number, difficulty: number, natural?: number): AttackOutcome {
  if (natural === 1) return 'Crit miss'
  if (natural === 20) return 'Critical hit'
  const margin = total - difficulty
  return margin <= -10 ? 'Major miss' : margin < 0 ? 'Miss' : margin >= 10 ? 'Amazing hit' : 'Hit'
}

export const outcomeLabel = (outcome: AttackOutcome, check = false) =>
  check
    ? (
        {
          'Crit miss': 'Critical Fail',
          'Major miss': 'Major Fail',
          Miss: 'Fail',
          Hit: 'Success',
          'Amazing hit': 'Amazing Success',
          'Critical hit': 'Critical Success',
        } as const
      )[outcome]
    : outcome

/** Core Rulebook p.176, Table 37: the die a RANK_DIE token stands for at a Rank (healing.ts healingRankDie). */
export function rankDie(rank: number) {
  if (rank >= 20) return '2d10'
  if (rank >= 18) return '1d10+1d8'
  if (rank >= 16) return '2d8'
  if (rank >= 14) return '1d8+1d6'
  if (rank >= 12) return '1d12'
  if (rank >= 10) return '1d10'
  if (rank >= 8) return '1d8'
  if (rank >= 6) return '1d6'
  if (rank >= 4) return '1d4'
  if (rank >= 2) return '1d2'
  return rank >= 1 ? '1' : '0'
}

/** Replace F (floor), RANK and RANK_DIE tokens in published formulas such as `1d8+F` or `18+F`. */
export function resolveFormulaTokens(formula: string, values: { floor?: number; rank?: number } = {}) {
  return String(formula ?? '')
    // Stat tokens mean the stat's modifier (creatureMath.ts); Foundry fills @xMod from roll data.
    .replace(/(?<!@)\b(STR|INT|CON|DEX|CHA)(?:\s*MOD)?\b/gi, (_match, stat: string) => `@${stat.toLowerCase()}Mod`)
    .replace(/\bRANK_DIE\b/gi, `(${rankDie(values.rank ?? 0)})`)
    .replace(/\bRANK\b/gi, String(values.rank ?? 0))
    .replace(/(?<![a-z])F(?![a-z])/g, String(values.floor ?? 0))
    .replace(/\s+/g, '')
}

/** Critical hits double the dice of a damage formula, never its flat modifiers. */
export function doubleDice(formula: string) {
  return String(formula).replace(/(\d*)d(\d+)/gi, (_match, count, sides) => `${(Number(count) || 1) * 2}d${sides}`)
}

export type DamageResponse = { damageType: string; response: 'Resistance' | 'Vulnerability' | 'Immunity' }

/** damageResponses.ts: each typed share of the damage is halved, doubled or zeroed. */
export function applyDamageResponses(damage: number, types: readonly string[], responses: readonly DamageResponse[]) {
  const selected = [...new Set(types.map((type) => type.trim().toLowerCase()).filter(Boolean))]
  const portions = (selected.length ? selected : ['']).map((type) => {
    const matches = responses.filter((entry) => {
      const target = String(entry.damageType ?? '')
        .trim()
        .toLowerCase()
      return target === 'all' || (type && target === type)
    })
    const has = (kind: string) => matches.some((entry) => String(entry.response).trim().toLowerCase() === kind)
    let amount = Math.floor(damage / (selected.length || 1))
    const resistanceBlocked = has('resistance') ? amount - Math.floor(amount / 2) : 0
    if (has('resistance')) amount = Math.floor(amount / 2)
    if (has('vulnerability')) amount *= 2
    if (has('immunity')) amount = 0
    return { damageType: type || 'unspecified', damage: amount, immune: has('immunity'), resistanceBlocked }
  })
  return {
    damage: portions.reduce((total, portion) => total + portion.damage, 0),
    resistanceBlocked: portions.reduce((total, portion) => total + portion.resistanceBlocked, 0),
    portions,
  }
}

/** rollDamage.ts: a successful Physical Shield Block halves damage; Rank 15 also subtracts Strength. */
export function blockedDamage(amount: number, rank: number, strength: number) {
  return Math.max(0, Math.floor(amount / 2 - (rank >= 15 ? Math.max(0, strength) : 0)))
}

/** `nonMagic` shields let magic damage through. */
export type ConditionShield = { id: string; remaining: number; perSlot: number; nonMagic?: boolean }

export type SlotDamageOptions = {
  armorPiercing?: boolean
  damageTypes?: readonly string[]
  responses?: readonly DamageResponse[]
  shieldBlock?: { rank: number; strength: number }
  conditionShields?: readonly ConditionShield[]
  magic?: boolean
  /** Wisp Armor: magic damage is first reduced to the spell's Rank 1 base damage. */
  magicDamageCap?: number
}

/**
 * health.ts applySlotDamage. Order: condition shields → magical shield slots → Shield Block → DR →
 * resistance/vulnerability/immunity → whole health slots. A slot is only lost when the remaining damage
 * reaches that slot's value.
 */
export function applySlotDamage(
  incomingDamage: number,
  shields: boolean[],
  shieldValue: number,
  dr: number,
  healthValues: number[],
  options: SlotDamageOptions = {},
) {
  let damage =
    options.magic && options.magicDamageCap !== undefined
      ? Math.min(incomingDamage, Math.max(0, options.magicDamageCap))
      : incomingDamage
  const magicCapBlockedDamage = incomingDamage - damage
  const conditionShields = (options.conditionShields ?? []).map((shield) => ({ ...shield }))
  let conditionBlocked = 0
  for (const shield of conditionShields) {
    if (shield.nonMagic && options.magic) continue
    while (shield.remaining > 0 && damage > 0 && shield.perSlot > 0 && damage >= shield.perSlot) {
      damage -= shield.perSlot
      conditionBlocked += shield.perSlot
      shield.remaining--
    }
  }
  const afterConditionShields = damage
  const shieldStates = [...shields]
  if (Number.isFinite(shieldValue) && shieldValue > 0) {
    for (let index = 0; index < shieldStates.length && damage > 0; index++) {
      if (!shieldStates[index]) continue
      if (damage < shieldValue) break
      damage -= shieldValue
      shieldStates[index] = false
    }
  }
  const shieldBlockedDamage = conditionBlocked + afterConditionShields - damage
  const beforeBlock = damage
  if (options.shieldBlock) damage = blockedDamage(damage, options.shieldBlock.rank, options.shieldBlock.strength)
  const physicalShieldBlockedDamage = beforeBlock - damage
  const beforeDr = damage
  if (!options.armorPiercing && Number.isFinite(dr)) damage = Math.max(0, damage - Math.max(0, dr))
  const drBlockedDamage = beforeDr - damage
  const adjusted = applyDamageResponses(damage, options.damageTypes ?? [], options.responses ?? [])
  damage = adjusted.damage
  const damageReachingHealth = damage
  let slotsLost = 0
  for (const slotValue of healthValues) {
    if (damage <= 0 || !Number.isFinite(slotValue) || slotValue <= 0 || damage < slotValue) break
    damage -= slotValue
    slotsLost++
  }
  return {
    shieldStates,
    conditionShields,
    magicCapBlockedDamage,
    shieldBlockedDamage,
    physicalShieldBlockedDamage,
    drBlockedDamage,
    resistanceBlockedDamage: adjusted.resistanceBlocked,
    damageReachingHealth,
    slotsLost,
    portions: adjusted.portions,
  }
}

/** crawlerHealth.ts: entering the 10 (0% HP) state from above makes a crawler Dying; ≤0 is dead. */
export function crawlerIsCorpse(health: number, dying: boolean) {
  return health <= 0 || (health <= 10 && !dying)
}

/** Ensure the Dying debuff follows the health value the way CrawlSpace's crawlerHealthConditions does. */
export function dyingAfterHealthChange(previous: number, next: number, currentlyDying: boolean) {
  if (next > 10 || next <= 0) return false
  if (next === 10 && previous > 10) return true
  return currentlyDying
}

/** Mob/boss derived values (mobRules.ts getMobDerived). */
export function mobDerived(input: {
  kind: string
  level: number
  floor: number
  bossTier: { healthSlots: number; statsPerLevel: number }
  conMod: number
  dexMod: number
  intMod: number
  publishedEvade?: number | null
  publishedSurprise?: number | null
  publishedHealthSlots?: number | null
}) {
  const isBoss = input.kind === 'boss'
  return {
    healthSlots:
      input.publishedHealthSlots ?? (isBoss ? input.bossTier.healthSlots + input.floor : Math.min(input.level, 10)),
    healthPerSlot: input.conMod,
    evade: input.publishedEvade ?? 10 + input.dexMod + input.floor,
    surprise: input.publishedSurprise ?? 10 + input.intMod + input.floor,
    statPoints: input.level * (isBoss ? input.bossTier.statsPerLevel : 3),
  }
}

/** mobRules.ts mobAttackModifier: a published "to hit" (e.g. `18+F`) or 10 + stat mod + floor. Null = auto-hit. */
export function mobToHit(publishedToHit: string, statMod: number, floor: number): number | null {
  const published = String(publishedToHit ?? '').trim()
  if (/^(none|auto-hit)$/i.test(published)) return null
  if (published) {
    const resolved = resolveFormulaTokens(published, { floor })
    const value = safeArithmetic(resolved)
    if (value !== null) return value
  }
  return 10 + statMod + floor
}

/** Evaluate `+ - * /` integer arithmetic without dice; null when the text is anything else. */
export function safeArithmetic(text: string): number | null {
  const expression = String(text).replace(/\s+/g, '')
  if (!expression || !/^[\d+\-*/().]+$/.test(expression)) return null
  try {
    const value = Function(`"use strict"; return (${expression})`)()
    return Number.isFinite(value) ? Math.floor(value) : null
  } catch {
    return null
  }
}

/** upkeep.ts: three stat points per level. */
export const STAT_POINTS_PER_LEVEL = 3
