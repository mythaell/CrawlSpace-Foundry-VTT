import { applyDamageResponses } from './damageResponses'
import type { DamageResponse } from './damageResponses'
import { blockedDamage } from './rollDamage'
import type { DamageSummary } from './rollDamage'
import { absorbWithConditionShields, type ActiveConditionShield } from './conditionShields'

/** Shield → DR → resistance → vulnerability → immunity → whole health slots. */
export function applySlotDamage(
  incomingDamage: number,
  shields: boolean[],
  shieldValue: number,
  dr: number,
  healthValues: number[],
  options: {
    armorPiercing?: boolean
    damageTypes?: readonly string[]
    responses?: readonly DamageResponse[]
    shieldBlock?: { rank: number; strength: number }
    conditionShields?: readonly ActiveConditionShield[]
    magic?: boolean
    /** Wisp Armor: magic damage is first reduced to this spell's Rank 1 base damage. */
    magicDamageCap?: number
  } = {},
) {
  const capped =
    options.magic && options.magicDamageCap !== undefined
      ? Math.min(incomingDamage, Math.max(0, options.magicDamageCap))
      : incomingDamage
  const magicCapBlockedDamage = incomingDamage - capped
  const absorbed = absorbWithConditionShields(capped, [...(options.conditionShields ?? [])], options.magic === true)
  let damage = absorbed.damage
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
  const shieldBlockedDamage = absorbed.blocked + afterConditionShields - damage
  const beforeBlock = damage
  if (options.shieldBlock) damage = blockedDamage(damage, options.shieldBlock.rank, options.shieldBlock.strength)
  const physicalShieldBlockedDamage = beforeBlock - damage
  const beforeDr = damage
  if (!options.armorPiercing && Number.isFinite(dr)) damage = Math.max(0, damage - Math.max(0, dr))
  const drBlockedDamage = beforeDr - damage
  const afterDr = damage
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
    conditionShields: absorbed.shields,
    magicCapBlockedDamage,
    shieldBlockedDamage,
    drBlockedDamage,
    resistanceBlockedDamage: adjusted.resistanceBlocked,
    afterDr,
    damageReachingHealth,
    slotsLost,
    portions: adjusted.portions,
    ...(options.shieldBlock ? { physicalShieldBlockedDamage } : {}),
  }
}

export function damageSummary(result: ReturnType<typeof applySlotDamage>): DamageSummary {
  return {
    shieldBlocked: result.shieldBlockedDamage + (result.physicalShieldBlockedDamage ?? 0),
    resistanceBlocked: result.resistanceBlockedDamage + result.magicCapBlockedDamage,
    drBlocked: result.drBlockedDamage,
    damageTaken: result.damageReachingHealth,
  }
}

export function describeDamage(result: ReturnType<typeof applySlotDamage>, types: readonly string[] = []) {
  const label = types.length ? ` ${types.join(' / ')}` : ''
  const immune = result.portions.filter((portion) => portion.immune).map((portion) => portion.damageType)
  return `Shield blocked ${result.shieldBlockedDamage}; ${result.physicalShieldBlockedDamage !== undefined ? `Shield Block blocked ${result.physicalShieldBlockedDamage}; ` : ''}DR blocked ${result.drBlockedDamage}; ${result.damageReachingHealth}${label} damage reached health; ${result.slotsLost} health slots lost.${immune.length ? ` Immune to ${immune.join(', ')} (including damage-linked effects).` : ''}`
}

export function healedSlots(amount: number, current: number, maximum: number) {
  return Math.max(0, Math.min(maximum - current, Math.floor(amount)))
}

/** Sheets store the first shaded percentage; 110 means all ten slots are full. */
export function healthAfterSlotClick(current: number, percentage: number) {
  return percentage >= current ? percentage + 10 : percentage
}

export const evaluateHealthExpression = (value: string): number | null => {
  const expression = value.replace(/\s+/g, '')
  if (!expression || expression.length > 80) return null
  const tokens = expression.match(/\d+(?:\.\d+)?|[()+*/-]/g) ?? []
  if (tokens.join('') !== expression) return null

  let position = 0
  const peek = () => tokens[position]
  const take = () => tokens[position++]
  const parseExpression = (): number => {
    let result = parseTerm()
    while (peek() === '+' || peek() === '-') {
      const operator = take()
      const next = parseTerm()
      result = operator === '+' ? result + next : result - next
    }
    return result
  }
  const parseTerm = (): number => {
    let result = parseAtom()
    while (peek() === '*' || peek() === '/') {
      const operator = take()
      const next = parseAtom()
      if (operator === '/' && next === 0) throw new Error('Cannot divide by zero')
      result = operator === '*' ? result * next : result / next
    }
    return result
  }
  const parseAtom = (): number => {
    if (peek() === '+' || peek() === '-') {
      const sign = take()
      return (sign === '-' ? -1 : 1) * parseAtom()
    }
    if (peek() === '(') {
      take()
      const result = parseExpression()
      if (take() !== ')') throw new Error('Missing closing parenthesis')
      return result
    }
    const number = take()
    if (!number || !/^\d+(?:\.\d+)?$/.test(number)) throw new Error('Invalid expression')
    return Number(number)
  }

  try {
    const result = parseExpression()
    return position === tokens.length && Number.isFinite(result) ? result : null
  } catch {
    return null
  }
}
