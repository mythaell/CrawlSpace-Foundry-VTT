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

/** An equipped equipment item marked as a shield (with DR, if it has any) that isn't broken. */
export function hasEquippedShield(actor: any) {
  return equippedShields(actor).some((item: any) => !item.system.broken)
}

export const equippedShields = (actor: any): any[] =>
  (actor?.items ?? []).filter((item: any) => item.type === 'equipment' && item.system.equipped && item.system.isShield && !(Number(item.system.armorDr) < 0))

/** A shield's DR after what it has lost. */
export const shieldRemaining = (shield: { dr: number; lost: number }) => Math.max(0, (Number(shield.dr) || 0) - (Number(shield.lost) || 0))

/** DR a Shield Block costs the shield: 1 on a Major Fail, 2 on a Critical Fail. */
export function shieldDrLoss(outcome: string | null | undefined) {
  return outcome === 'Crit miss' ? 2 : outcome === 'Major miss' ? 1 : 0
}

/**
 * Take `loss` DR off the shields in order: the first working shield first, the rest running on to the next.
 * A shield with no DR left breaks. Returns the changed shields only.
 */
export function damageShields(shields: { id: string; dr: number; lost: number; broken: boolean }[], loss: number) {
  const changes: { id: string; lost: number; broken: boolean }[] = []
  let left = Math.max(0, Math.floor(loss))
  for (const shield of shields) {
    if (!left) break
    if (shield.broken) continue
    const remaining = shieldRemaining(shield)
    const taken = Math.min(left, remaining)
    left -= taken
    const lost = (Number(shield.lost) || 0) + taken
    const broken = shieldRemaining({ dr: shield.dr, lost }) === 0
    if (taken || broken) changes.push({ id: shield.id, lost, broken })
  }
  return changes
}

const PHYSICAL_ITEMS = ['weapon', 'equipment', 'consumable', 'tattoo', 'loot']

/** The Repair skill (by name). */
export const isRepairSkill = (name: string) => normalize(String(name ?? '')) === 'repair'

/** A broken item, or a shield missing DR. */
export function needsRepair(item: any) {
  if (!PHYSICAL_ITEMS.includes(item?.type)) return false
  return !!item.system?.broken || (item.type === 'equipment' && !!item.system?.isShield && Number(item.system?.drLost) > 0)
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
