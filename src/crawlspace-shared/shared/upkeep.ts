import { normalizeGrinding, type GrindingState } from './grinding'
import type { DebuffCounts } from './debuffs'

export type RecoveryKind = 'short' | 'long' | 'full' | 'hourly'
export type AdvancementKind = 'safe-room' | 'session' | 'floor'
export type UpkeepReport = { title: string; details: string[] }
export type UpkeepEvent = {
  id: string
  report: UpkeepReport
  before: Record<string, unknown>
  after: Record<string, unknown>
}
export type UpkeepState = {
  history?: UpkeepEvent[]
  grinding?: GrindingState
  allocatedThroughLevel: number
  lastSafeRoomLevel: number | null
  lastReport: UpkeepReport | null
}

export const defaultUpkeep = (): UpkeepState => ({
  allocatedThroughLevel: 1,
  lastSafeRoomLevel: null,
  lastReport: null,
})

export function crawlerLevel(value: string | number) {
  const level = Number(value)
  return Number.isSafeInteger(level) && level >= 1 ? level : 1
}

export function normalizeUpkeep(saved?: Partial<UpkeepState> | null): UpkeepState {
  return {
    allocatedThroughLevel: crawlerLevel(saved?.allocatedThroughLevel ?? 1),
    lastSafeRoomLevel: saved?.lastSafeRoomLevel == null ? null : crawlerLevel(saved.lastSafeRoomLevel),
    lastReport: saved?.lastReport ?? null,
    grinding: normalizeGrinding(saved?.grinding),
    history: Array.isArray(saved?.history) ? saved.history.slice(0, 3) : [],
  }
}

export function pendingStatPoints(level: string | number, state: UpkeepState) {
  return Math.max(0, crawlerLevel(level) - state.allocatedThroughLevel) * 3
}

export function canAssignStats(floor: string | number) {
  return Number.isSafeInteger(Number(floor)) && Number(floor) >= 3
}

/** Health is the first shaded percentage: 10 is empty and 110 is full. */
export function recoverCrawler(
  kind: RecoveryKind,
  health: number,
  mana: number,
  maximumMana: number,
  debuffs: DebuffCounts,
  hours = 1,
) {
  if (kind === 'hourly' && (!Number.isSafeInteger(hours) || hours < 1))
    throw new Error('Enter a positive whole number of completed hours.')
  const maximum = Number.isFinite(maximumMana) ? Math.max(0, maximumMana) : 0
  const currentMana = Number.isFinite(mana) ? Math.max(0, mana) : 0
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
  const removed = cleared.filter((name) => Boolean(debuffs[name]))
  const activeDebuffs = { ...debuffs }
  for (const name of removed) activeDebuffs[name] = 0
  return {
    currentHealth: restoredHealth,
    currentMana: String(restoredMana),
    activeDebuffs,
    removed,
    slotsRestored: Math.max(0, (restoredHealth - health) / 10),
    manaRestored: Math.max(0, restoredMana - currentMana),
  }
}

type MarkedRank = { id: string; name: string; unenhancedRank: string; completed: boolean }
export type AdvancementResult = {
  id: string
  name: string
  rank: number
  nextRank: number
  roll: number | null
  status: 'advanced' | 'failed' | 'capped' | 'unavailable'
}

/** Use permanent ranks; enhanced ranks and ordinary Skill Check modifiers do not apply. */
export async function advanceMarkedRanks<T extends MarkedRank>(
  entries: T[],
  kind: AdvancementKind,
  floor: string | number,
  rollD20: (entry: T, rank: number) => Promise<number | null>,
  capForEntry?: (entry: T) => number,
  skipUntrained = false,
) {
  const results: AdvancementResult[] = []
  const updated: T[] = []
  for (const entry of entries) {
    const rank = Number(entry.unenhancedRank)
    if (
      !entry.completed ||
      !entry.name.trim() ||
      !Number.isSafeInteger(rank) ||
      rank < 0 ||
      (skipUntrained && rank === 0) ||
      (kind !== 'floor' && rank > 4)
    ) {
      updated.push(entry)
      continue
    }
    const cap = Math.min(Number(floor) < 7 ? 15 : 20, capForEntry?.(entry) ?? 15)
    const capped = rank >= cap
    const roll = capped ? null : await rollD20(entry, rank)
    const available = roll !== null && Number.isInteger(roll) && roll >= 1 && roll <= 20
    const advanced = available && roll >= rank
    const status = capped ? 'capped' : !available ? 'unavailable' : advanced ? 'advanced' : 'failed'
    const nextRank = rank + (advanced ? 1 : 0)
    results.push({ id: entry.id, name: entry.name, rank, nextRank, roll, status })
    updated.push(status === 'unavailable' ? entry : { ...entry, unenhancedRank: String(nextRank), completed: false })
  }
  return { entries: updated, results }
}

export function describeAdvancement(result: AdvancementResult) {
  if (result.status === 'capped')
    return `${result.name}: rank ${result.rank} has reached its advancement cap; mark cleared.`
  if (result.status === 'unavailable') return `${result.name}: roll unavailable; rank and mark retained.`
  return `${result.name}: d20 = ${result.roll} vs rank ${result.rank} — ${result.status === 'advanced' ? `advanced to ${result.nextRank}` : 'no advancement'}.`
}

export function allocateStatPoints<T extends { unenhanced: string }>(
  values: T[],
  additions: number[],
  level: string | number,
  floor: string | number,
  state: UpkeepState,
) {
  if (!canAssignStats(floor)) throw new Error('Stat points can be assigned from floor 3 onward.')
  const available = pendingStatPoints(level, state)
  if (
    !available ||
    additions.length !== values.length ||
    additions.some((value) => !Number.isSafeInteger(value) || value < 0) ||
    additions.reduce((sum, value) => sum + value, 0) !== available
  ) {
    throw new Error(`Assign all ${available} available points using whole numbers.`)
  }
  const attributes = values.map((attribute, index) => {
    const base = Number(attribute.unenhanced)
    if (!Number.isSafeInteger(base) || base < 0 || !Number.isSafeInteger(base + additions[index]))
      throw new Error('Each base stat must be a valid whole number before assigning points.')
    return { ...attribute, unenhanced: String(base + additions[index]) }
  })
  return { attributeValues: attributes, upkeep: { ...state, allocatedThroughLevel: crawlerLevel(level) } }
}

/** Only changed upkeep fields are restored, leaving unrelated sheet edits intact. */
export function recordUpkeepEvent(
  state: UpkeepState,
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  newId: () => string = () => crypto.randomUUID(),
): UpkeepState {
  const changed = Object.keys(after).filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
  if (!state.lastReport) return state
  const event: UpkeepEvent = { id: newId(), report: state.lastReport, before: {}, after: {} }
  for (const key of changed) {
    event.before[key] = before[key]
    event.after[key] = after[key]
  }
  return { ...state, history: [event, ...(state.history ?? [])].slice(0, 3) }
}
export function undoUpkeepEvent(state: UpkeepState, current: Record<string, unknown>, id: string) {
  const event = state.history?.find((entry) => entry.id === id)
  if (!event) throw new Error('This upkeep event is no longer available.')
  for (const key of Object.keys(event.after)) {
    if (JSON.stringify(current[key]) !== JSON.stringify(event.after[key]))
      throw new Error('These values changed after this event. Undo the newer upkeep events first.')
  }
  const history = state.history!.filter((entry) => entry.id !== id)
  return {
    values: { ...current, ...event.before },
    upkeep: { ...state, history, lastReport: history[0]?.report ?? null },
  }
}
