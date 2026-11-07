/**
 * Triggered rules: a rule that waits for something to happen (a roll's result, being hit, taking damage)
 * instead of always applying. Pure helpers, so tests can import them; triggers.ts does the Foundry side.
 *
 * A triggered rule is stored as one change of type `crawlspace.triggered` whose value holds the trigger, its
 * timing and the rule's own change: `{ when, timing, change: { key, type, value } }`.
 */
import type { AttackOutcome } from '../rules/core.ts'

export const TRIGGERED_TYPE = 'crawlspace.triggered'

/** Trigger ids, in the order the rules editor lists them. */
export const TRIGGERS = [
  // Your own roll (a check, or an attack against each target).
  'rollCritSuccess',
  'rollAmazing',
  'rollSuccess',
  'rollAnySuccess',
  'rollFail',
  'rollMajorFail',
  'rollCritFail',
  'rollAnyFail',
  // An attack against you.
  'targeted',
  'hitAny',
  'hit',
  'hitAmazing',
  'hitCrit',
  'missAny',
  'miss',
  'missMajor',
  'missCrit',
  // Other events.
  'damaged',
  'healed',
  'dying',
  'cleanUp',
] as const

export type TriggerEvent = (typeof TRIGGERS)[number]
export type Timing = 'before' | 'after'

/** The trigger groups, for the editor's dropdown. */
export const TRIGGER_GROUPS: { id: string; triggers: TriggerEvent[] }[] = [
  { id: 'roll', triggers: ['rollCritSuccess', 'rollAmazing', 'rollSuccess', 'rollAnySuccess', 'rollFail', 'rollMajorFail', 'rollCritFail', 'rollAnyFail'] },
  { id: 'defense', triggers: ['targeted', 'hitAny', 'hit', 'hitAmazing', 'hitCrit', 'missAny', 'miss', 'missMajor', 'missCrit'] },
  { id: 'other', triggers: ['damaged', 'healed', 'dying', 'cleanUp'] },
]

const SUCCESSES: AttackOutcome[] = ['Hit', 'Amazing hit', 'Critical hit']

const ROLL: Record<AttackOutcome, TriggerEvent> = {
  'Critical hit': 'rollCritSuccess',
  'Amazing hit': 'rollAmazing',
  Hit: 'rollSuccess',
  Miss: 'rollFail',
  'Major miss': 'rollMajorFail',
  'Crit miss': 'rollCritFail',
}

const DEFENSE: Record<AttackOutcome, TriggerEvent> = {
  'Critical hit': 'hitCrit',
  'Amazing hit': 'hitAmazing',
  Hit: 'hit',
  Miss: 'miss',
  'Major miss': 'missMajor',
  'Crit miss': 'missCrit',
}

/** The events a roll's outcome sets off for the one who rolled it. */
export function rollEvents(outcome: unknown): TriggerEvent[] {
  const event = ROLL[outcome as AttackOutcome]
  if (!event) return []
  return [event, SUCCESSES.includes(outcome as AttackOutcome) ? 'rollAnySuccess' : 'rollAnyFail']
}

/** The events an attack's outcome sets off for its target. */
export function defenseEvents(outcome: unknown): TriggerEvent[] {
  const event = DEFENSE[outcome as AttackOutcome]
  if (!event) return []
  return ['targeted', event, SUCCESSES.includes(outcome as AttackOutcome) ? 'hitAny' : 'missAny']
}

/** A damage card's tier stands for the attack result that rolled it. */
export const TIER_OUTCOME: Record<string, AttackOutcome> = { normal: 'Hit', amazing: 'Amazing hit', critical: 'Critical hit' }

/** Triggered rules an actor carries (collected by the change handler). */
export type TriggerEntry = {
  when: string
  timing: Timing
  change: { key: string; type: string; value: unknown }
  source: string
  effectId: string
  itemId: string
  itemName: string
  itemType: string
  index: number
}

/** Item types whose rolls are their own: their roll triggers only count for rolls made with them. */
const ROLLING_ITEMS = ['weapon', 'skill', 'spell', 'consumable']

/**
 * The entries that fire for these events. `afterPhase` says the event has a second moment (damage applied
 * after a hit): then "before" entries fire at the roll and "after" entries when the damage lands. Without
 * one, both fire now.
 */
export function matchTriggers(
  entries: TriggerEntry[],
  events: string[],
  context: { timing: Timing; afterPhase: boolean; sources?: string[] },
) {
  const sources = (context.sources ?? []).map((name) => String(name).trim().toLowerCase())
  return entries.filter((entry) => {
    if (!events.includes(entry.when)) return false
    if (context.afterPhase && (entry.timing || 'before') !== context.timing) return false
    // A sword's "on an Amazing Success" is about the sword's attacks, not every check its wielder makes.
    if (entry.when.startsWith('roll') && ROLLING_ITEMS.includes(entry.itemType)) return sources.includes(entry.itemName.trim().toLowerCase())
    return true
  })
}

/** Read a change as a triggered rule, or null when it always applies. */
export function unwrapTriggered(change: { type: string; value: unknown }) {
  if (change?.type !== TRIGGERED_TYPE) return null
  let data: any = {}
  try {
    data = typeof change.value === 'string' ? JSON.parse(change.value) : (change.value ?? {})
  } catch {
    data = {}
  }
  const inner = data.change && typeof data.change === 'object' ? data.change : { key: '', type: 'add', value: '' }
  return {
    when: String(data.when || 'rollAmazing'),
    timing: (data.timing === 'after' ? 'after' : 'before') as Timing,
    change: { key: String(inner.key ?? ''), type: String(inner.type ?? 'add'), value: inner.value ?? '' },
  }
}

/** Wrap a rule's change so it waits for a trigger. */
export function wrapTriggered(change: { key: string; type: string; value: unknown }, when: string, timing: Timing = 'before') {
  return {
    key: change.key,
    type: TRIGGERED_TYPE,
    value: JSON.stringify({ when, timing, change: { key: change.key, type: change.type, value: change.value } }),
    phase: 'initial',
  }
}
