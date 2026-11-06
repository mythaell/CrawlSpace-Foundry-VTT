import type { BuffEntry } from './contentModels'
import { effectNumber, type StatLookup } from './effectValues'

export type ConditionShieldScope = 'all' | 'nonMagic'
/** Written as text in the database (`CHA`, `2`), and resolved to numbers when the spell is cast. */
export type ConditionShield = {
  slots: string
  healthPerSlot: string
  scope: ConditionShieldScope
  /** Slots left on the target; absent until the condition is applied. */
  remaining?: number
}
export type ActiveConditionShield = {
  id: string
  value: number
  remaining: number
  /** The slots it started with, so used ones can still be shown and given back. */
  total: number
  scope: ConditionShieldScope
}

export const shieldSlotCount = (shield: ConditionShield, stat?: StatLookup) => {
  const slots = effectNumber(shield.slots, stat)
  return slots !== null ? Math.max(0, Math.floor(slots)) : 0
}

type ShieldHolder = Pick<Partial<BuffEntry>, 'shield' | 'name' | 'properties'> & { id?: string }
/** A cast condition carries its shield; a buff made on a sheet still has it as an effect. */
const heldShield = (buff: ShieldHolder): ConditionShield | undefined => {
  if (buff.shield) return buff.shield
  const effect = buff.properties?.effects?.find((entry) => entry.type === 'shield')
  return effect
    ? { slots: effect.value, healthPerSlot: effect.target, scope: effect.scope === 'nonMagic' ? 'nonMagic' : 'all' }
    : undefined
}
const shieldKey = (buff: ShieldHolder) => buff.id ?? (buff.name ? `name:${buff.name}` : undefined)

/** The condition holding a shield, for naming it on a sheet. */
export const conditionForShield = <T extends ShieldHolder>(buffs: readonly T[], id: string) =>
  buffs.find((buff) => shieldKey(buff) === id)

/** Shields live on their condition, so the condition timing out takes the shields with it. */
export function activeConditionShields(buffs: unknown, stat?: StatLookup): ActiveConditionShield[] {
  if (!Array.isArray(buffs)) return []
  return (buffs as (BuffEntry & { id?: string })[]).flatMap((buff) => {
    const shield = buff?.active ? heldShield(buff) : undefined
    const id = buff ? shieldKey(buff) : undefined
    if (!shield || !id) return []
    const value = effectNumber(shield.healthPerSlot, stat) ?? 0
    // A used-up shield ends its condition, so one that is active again starts full.
    const remaining = shield.remaining || shieldSlotCount(shield, stat)
    const total = Math.max(remaining, shieldSlotCount(shield, stat))
    return value > 0 && remaining > 0 ? [{ id, value, remaining, total, scope: shield.scope }] : []
  })
}

/** Whole-slot absorption, matching the health bar: damage smaller than a slot does not break it. */
export function absorbWithConditionShields(amount: number, shields: ActiveConditionShield[], magic: boolean) {
  let damage = amount
  const next = shields.map((shield) => {
    if (magic && shield.scope === 'nonMagic') return shield
    let remaining = shield.remaining
    while (remaining > 0 && damage >= shield.value) {
      damage -= shield.value
      remaining--
    }
    return { ...shield, remaining }
  })
  return { damage, blocked: amount - damage, shields: next }
}

/** Save the slots that are left, and end any condition whose shield was used up. */
export function withConditionShields<T extends ShieldHolder & { active?: boolean }>(
  buffs: T[],
  shields: Pick<ActiveConditionShield, 'id' | 'remaining'>[],
): T[] {
  const byId = new Map(shields.map((shield) => [shield.id, shield.remaining]))
  return buffs.map((buff) => {
    const key = shieldKey(buff)
    const remaining = key === undefined ? undefined : byId.get(key)
    const shield = heldShield(buff)
    if (remaining === undefined || !shield) return buff
    return { ...buff, active: remaining > 0, shield: { ...shield, remaining } }
  })
}
