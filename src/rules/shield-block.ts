/**
 * Shield Block (rollDamage.ts / combat.ts): a crawler with the Shield Block skill and an equipped shield can
 * block a hit. It never avoids the hit; a successful block halves the damage when it is applied (from Rank 15,
 * minus the Strength modifier too). Area damage can't be blocked, and magic needs Rank 5.
 */
const PHYSICAL = ['Bludgeoning', 'Piercing', 'Slashing']

const normalize = (name: string) => name.toLowerCase().replace(/[^a-z]/g, '')

export function shieldBlockSkill(actor: any) {
  if (actor?.type !== 'crawler') return null
  return actor.items.find((item: any) => item.type === 'skill' && normalize(item.name) === 'shieldblock') ?? null
}

/** An equipped equipment item marked as a shield (with DR, if it has any). */
export function hasEquippedShield(actor: any) {
  return !!actor?.items?.some(
    (item: any) => item.type === 'equipment' && item.system.equipped && item.system.isShield && !(Number(item.system.armorDr) < 0),
  )
}

/** What applyDamage needs for a block, or null when the actor can't Shield Block at all. */
export function shieldBlockFor(actor: any): { rank: number; strength: number } | null {
  const skill = shieldBlockSkill(actor)
  if (!skill || !hasEquippedShield(actor)) return null
  return { rank: Number(skill.system.rank?.total) || 0, strength: Number(actor.system.statMod?.('STR')) || 0 }
}

/** Whether a block can stop this damage. */
export function shieldBlockAllowed(damage: { area?: boolean; types?: string[] }, rank: number) {
  return !damage.area && (rank >= 5 || (damage.types ?? []).every((type) => PHYSICAL.includes(type)))
}
