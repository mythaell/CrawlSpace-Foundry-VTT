/**
 * Special durations (effectDurations.ts specialEffectDurations): conditions that end when something happens
 * rather than (or as well as) when time runs out. Each condition's duration text is read for the events that
 * end it, so "Until the end of the next round, or you take at least 1 HP slot damage" ends on either.
 * Durations that need a judgment call (an antidote, getting your head above water) stay manual.
 */

export type EndTrigger =
  | 'healed'
  | 'damaged'
  | 'check'
  | 'action'
  | 'death'
  | 'shortRest'
  | 'longRest'
  | 'fullRest'
  | 'safeRoom'
  | 'leaveFloor'
  | 'combatEnd'

const PATTERNS: [EndTrigger, RegExp][] = [
  ['healed', /\b(?:you(?:’|')?re|you are|are|is|until)\s+healed\b|\bheal(?:ed)? (?:at least )?1 (?:hp |health )?slot/i],
  ['damaged', /\btake (?:at least )?1 (?:hp |health )?slot(?:s)? (?:of )?damage/i],
  ['check', /\bonce you make a check\b/i],
  ['action', /\b(?:end of the next action you take|once you forfeit that action)\b/i],
  ['death', /\buntil you die\b/i],
  ['shortRest', /\bend of a short rest\b/i],
  ['longRest', /\bend of a long rest\b|\bcomplete a long rest\b/i],
  ['fullRest', /\bfull day of rest\b/i],
  ['safeRoom', /\bsafe ?room\b/i],
  ['leaveFloor', /\bleave (?:this|the) floor\b|\bdescend to a new floor\b/i],
  ['combatEnd', /\bend of (?:the )?combat\b/i],
]

/**
 * The special durations offered in the duration picker (effectDurations.ts specialEffectDurations, plus one
 * for each event above). The last two stay manual.
 */
export const SPECIAL_DURATIONS = [
  'Until the end of combat',
  'Until you are healed at least 1 health slot',
  'Until you take at least 1 HP slot of damage',
  'Ends once you make a check',
  'Until the end of the next action you take',
  'Until you die',
  'Until the end of a short rest',
  'Until you complete a long rest',
  'Until you finish a full day of rest',
  'Until you enter a saferoom',
  'Until you leave this floor',
  'Until cured with a bandage',
  'While the source is active',
] as const

/** The events that end a condition with this duration text. */
export function endTriggers(text: unknown): EndTrigger[] {
  const value = String(text ?? '')
  return PATTERNS.filter(([, pattern]) => pattern.test(value)).map(([trigger]) => trigger)
}

/** A full rest also counts as a long and a short rest; a long rest as a short one. */
const INCLUDES: Partial<Record<EndTrigger, EndTrigger[]>> = {
  fullRest: ['fullRest', 'longRest', 'shortRest'],
  longRest: ['longRest', 'shortRest'],
}

/** End the actor's conditions that this event ends. Only the active GM or the actor's owner writes. */
export async function endConditionsOn(actor: any, trigger: EndTrigger) {
  if (!actor?.isOwner) return
  const events = INCLUDES[trigger] ?? [trigger]
  const ending = actor.effects.filter((effect: any) => {
    const text = effect.system?.durationText ?? ''
    return text && endTriggers(text).some((event) => events.includes(event))
  })
  if (ending.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ending.map((effect: any) => effect.id))
}
