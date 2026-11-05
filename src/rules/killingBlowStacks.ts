/** A spell's own killing-blow count, kept on that spell's sheet row so no two spells share it. */
type StackingSpell = {
  id?: string
  killingBlowStacking?: boolean
  killingBlowStacks?: number
  killingBlowAt?: number
  killingBlowGameClock?: number
  killingBlowFloor?: string
}

export type KillingBlowSpell = { characterId: number; spellId: string; name: string; rank: number }

/** When and where the latest kill happened, which is what its bonus lasts from. */
export type KillingBlowStamp = { at: number; gameClock?: number | null; floor?: unknown }

const killingBlowWeekMs = 7 * 24 * 60 * 60 * 1000

const count = (value: unknown) => Math.max(0, Math.floor(Number(value)) || 0)

/** The count never counts for more than the Rank the spell is used at. */
export const killingBlowBonus = (spell: StackingSpell | undefined, rank: number) =>
  spell?.killingBlowStacking === true ? Math.min(count(spell.killingBlowStacks), count(rank)) : 0

/** The hidden `+killingBlowStack` on the formula. It adds nothing until the spell has a kill. */
export const withKillingBlowBonus = (formula: string, spell: StackingSpell | undefined, rank: number) => {
  const bonus = killingBlowBonus(spell, rank)
  return bonus > 0 && formula.trim() ? `${formula}+${bonus}` : formula
}

export function addKillingBlowStack<T extends StackingSpell>(
  spells: T[],
  spellId: string,
  rank: number,
  stamp?: KillingBlowStamp,
): T[] {
  return spells.map((spell) =>
    spell.id === spellId && spell.killingBlowStacking === true
      ? {
          ...spell,
          killingBlowStacks: Math.min(count(spell.killingBlowStacks) + 1, count(rank)),
          ...(stamp
            ? {
                killingBlowAt: stamp.at,
                killingBlowGameClock: Number.isFinite(stamp.gameClock) ? (stamp.gameClock as number) : undefined,
                killingBlowFloor: String(stamp.floor ?? '').trim(),
              }
            : {}),
        }
      : spell,
  )
}

/** `gameClock` is the Collapse timer's remaining time, null with no timer, and undefined while it is unknown. */
function killingBlowStackExpired(
  spell: StackingSpell,
  rank: number,
  { now, gameClock, floor }: { now: number; gameClock?: number | null; floor?: unknown },
) {
  // Rank 10 and up lasts while the crawler stays on the floor of the kill. A blank Floor box is someone mid-edit.
  if (rank >= 10) {
    const current = String(floor ?? '').trim()
    return !!current && !!spell.killingBlowFloor && Number(current) !== Number(spell.killingBlowFloor)
  }
  // Rank 5 to 9 lasts a week. Below that a long rest ends it instead.
  if (rank < 5 || gameClock === undefined) return false
  const started = spell.killingBlowGameClock
  // The Collapse timer falls as the game runs. Once it has been reset to a higher value, it can no longer measure the week.
  if (gameClock !== null && started !== undefined && gameClock <= started) return started - gameClock >= killingBlowWeekMs
  return spell.killingBlowAt !== undefined && now - spell.killingBlowAt >= killingBlowWeekMs
}

/** Returns the same array when nothing has ended, so callers can skip the save. */
export function expireKillingBlowStacks<T extends StackingSpell>(
  spells: T[],
  rankOf: (spell: T) => number,
  context: { now: number; gameClock?: number | null; floor?: unknown },
): T[] {
  let changed = false
  const next = spells.map((spell) => {
    if (!count(spell.killingBlowStacks) || !killingBlowStackExpired(spell, rankOf(spell), context)) return spell
    changed = true
    return { ...spell, killingBlowStacks: 0 }
  })
  return changed ? next : spells
}

export const validKillingBlowSpell = (value: any): value is KillingBlowSpell =>
  !!value &&
  Number.isSafeInteger(value.characterId) &&
  typeof value.spellId === 'string' &&
  value.spellId.length > 0 &&
  value.spellId.length <= 100 &&
  typeof value.name === 'string' &&
  value.name.length <= 100 &&
  Number.isInteger(value.rank) &&
  value.rank >= 0 &&
  value.rank <= 100000
