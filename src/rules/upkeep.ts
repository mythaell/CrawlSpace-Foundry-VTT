/** Pure upkeep rules from CrawlSpace `upkeep.ts` / `abilityAdvancement.ts`. */

export type RecoveryKind = 'short' | 'long' | 'full' | 'hourly'
export type AdvancementKind = 'safeRoom' | 'session' | 'floor'

/** Health/mana restored and debuffs cleared by a rest. Health uses the 10–110 scale. */
export function recoverCrawler(kind: RecoveryKind, health: number, mana: number, maximumMana: number, hours = 1) {
  const maximum = Math.max(0, maximumMana || 0)
  const currentMana = Math.max(0, mana || 0)
  const fullRecovery = kind === 'long' || kind === 'full'
  const slots = fullRecovery ? 10 : kind === 'short' ? 5 : hours
  const restoredHealth = Math.min(110, Math.max(10, health) + slots * 10)
  const restoredMana = fullRecovery
    ? maximum
    : Math.min(maximum, currentMana + (kind === 'short' ? Math.floor(maximum / 2) : hours * 5))
  const cleared = ['Sore as Shit', 'Dying']
  if (kind !== 'hourly') cleared.push('Minor Injury')
  if (fullRecovery) cleared.push('Fatigued', 'Major Injury', 'Long-Term Minor Injury')
  if (kind === 'full') cleared.push('Long-Term Major Injury')
  return { health: restoredHealth, mana: restoredMana, cleared }
}

export const pendingStatPoints = (level: number, allocatedThroughLevel: number) =>
  Math.max(0, Math.max(1, level) - Math.max(1, allocatedThroughLevel)) * 3

export const canAssignStats = (floor: number) => floor >= 3

/** Whether a marked rank is eligible for this kind of advancement, and its cap. */
export function advancementCheck(rank: number, kind: AdvancementKind, floor: number) {
  if (!Number.isSafeInteger(rank) || rank < 0) return { eligible: false, cap: 0 }
  if (kind !== 'floor' && rank > 4) return { eligible: false, cap: 0 }
  const cap = floor < 7 ? 15 : 20
  return { eligible: rank < cap, cap }
}

/** d20 ≥ current rank advances it by one. */
export const advances = (roll: number, rank: number) => roll >= rank
