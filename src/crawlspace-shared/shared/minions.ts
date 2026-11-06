export type MinionEncounter = { health: number; shields: boolean[] }
/** A minion's own copy of its creature, made when it is raised. */
export type PartyMinion = {
  id: string
  sceneId: string
  tokenId: string
  participantId: string | null
  casterCharacterId: number
  controllerUserId: number
  name: string
  sheet: { localId: string; data: Record<string, any> }
  encounter: MinionEncounter
  notes: string
  expiresAt: number | null
  revision: number
  createdAt: number
}

/** Second Chance raises a creature at half its original Health slots. */
export const raisedHealth = (maximumSlots: number) => Math.max(1, Math.floor(maximumSlots / 2))

const raiseGraceMs = 5000
/** Why the GM's canvas should end a minion now, if it should. A just-raised minion waits for its condition's save. */
export function minionShouldEnd(minion: PartyMinion, conditionActive: boolean, now: number) {
  if (minion.encounter.health <= 0) return 'died'
  if (minion.expiresAt !== null && minion.expiresAt <= now) return 'expired'
  if (!conditionActive && now - minion.createdAt > raiseGraceMs) return 'condition-ended'
  return null
}
