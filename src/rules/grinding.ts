export type GrindingState = {
  day: number
  hoursToday: number
  productiveToday: number
  bonusToday: number
  levelHours: number
  unassignedHours: number
  skillHours: Record<string, number>
  attempted: Record<string, number>
  notes: string
}
export type GrindingAction =
  | { type: 'session'; hours: number; aid: 'none' | 'neighborhood' | 'borough' }
  | { type: 'allocate'; skillId: string; hours: number }
  | { type: 'check'; skillId: string }
  | { type: 'day' | 'level' | 'discard' }
  | { type: 'notes'; notes: string }
export function normalizeGrinding(saved?: Partial<GrindingState>): GrindingState {
  const n = (value: unknown) => (Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0)
  return {
    day: Math.max(1, n(saved?.day)),
    hoursToday: n(saved?.hoursToday),
    productiveToday: n(saved?.productiveToday),
    bonusToday: Math.min(2, n(saved?.bonusToday)),
    levelHours: n(saved?.levelHours),
    unassignedHours: n(saved?.unassignedHours),
    skillHours: Object.fromEntries(Object.entries(saved?.skillHours ?? {}).map(([id, value]) => [id, n(value)])),
    attempted: Object.fromEntries(Object.entries(saved?.attempted ?? {}).map(([id, value]) => [id, n(value)])),
    notes: typeof saved?.notes === 'string' ? saved.notes : '',
  }
}
export function creditGrindingHour(state: GrindingState, productive: boolean): GrindingState {
  return {
    ...state,
    hoursToday: state.hoursToday + 1,
    productiveToday: state.productiveToday + (productive ? 1 : 0),
    levelHours: state.levelHours + (productive ? 1 : 0),
    unassignedHours: state.unassignedHours + (productive ? 1 : 0),
  }
}
export function creditGrindingAid(state: GrindingState, aid: 'none' | 'neighborhood' | 'borough'): GrindingState {
  const bonus = state.hoursToday >= 5 ? (aid === 'borough' ? 2 : aid === 'neighborhood' ? 1 : 0) : 0
  const added = Math.max(0, bonus - state.bonusToday)
  return {
    ...state,
    bonusToday: Math.max(state.bonusToday, bonus),
    levelHours: state.levelHours + added,
    unassignedHours: state.unassignedHours + added,
  }
}
export function allocateGrindingHours(
  state: GrindingState,
  skillId: string,
  rank: number,
  hours: number,
  deferRoll = false,
) {
  if (!Number.isSafeInteger(rank) || rank < 0) throw new Error('Grinding requires a nonnegative skill rank.')
  const requiredHours = Math.max(1, rank)
  if (state.attempted[skillId] === state.day && !deferRoll)
    throw new Error('This skill already had its grinding check today. Choose another skill.')
  const progress = state.skillHours[skillId] ?? 0
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > state.unassignedHours)
    throw new Error('Assign a whole number of available hours.')
  if (progress + hours > requiredHours)
    throw new Error('Assigned and banked hours cannot exceed the skill rank (one hour at Rank 0).')
  const ready = progress + hours >= requiredHours
  return {
    state: {
      ...state,
      unassignedHours: state.unassignedHours - hours,
      skillHours: {
        ...state.skillHours,
        [skillId]: ready && !deferRoll ? progress + hours - requiredHours : progress + hours,
      },
      attempted: ready && !deferRoll ? { ...state.attempted, [skillId]: state.day } : state.attempted,
    },
    ready,
  }
}
export function nextGrindingDay(state: GrindingState): GrindingState {
  return { ...state, day: state.day + 1, hoursToday: 0, productiveToday: 0, bonusToday: 0 }
}
export function grindingSkillAllowed(skill: {
  name: string
  isAttackSkill?: boolean
  isAttackSpell?: boolean
  combatRelated?: boolean
  checkType?: string
}) {
  return Boolean(skill.name.trim())
}

type Grindable = {
  id: string
  name: string
  unenhancedRank: string
  isAttackSkill?: boolean
  isAttackSpell?: boolean
  combatRelated?: boolean
  checkType?: string
}
export function grindingEntries(skills: Grindable[] = [], spells: Grindable[] = []) {
  return [
    ...skills.map((entry) => ({ ...entry, kind: 'Skill', sourceId: entry.id })),
    ...spells.map((entry) => ({ ...entry, kind: 'Spell', sourceId: entry.id, id: `spell:${entry.id}` })),
  ]
}

/** Only the party's single lowest-level crawler rolls 1d2 levels. Tied crawlers, and a crawler
 * with no other crawler in the party to compare with, receive the ordinary one level. */
export function isUniqueLowestCrawler(level: number, otherLevels: number[]) {
  return otherLevels.length > 0 && otherLevels.every((other) => level < other)
}
