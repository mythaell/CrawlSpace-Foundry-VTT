import { normalizeDamageTypes, type RollDamageData } from './rollDamage'

export type DebuffCounts = Record<string, boolean | number>
export type DebuffDefinition = {
  name: string
  effect: string
  duration: string
  durationSeconds: number | null
  stackable: boolean
  cleanupFormula?: string
  damageData?: RollDamageData
}
export type ActiveDebuff = {
  id: string
  name: string
  stacks: number
  cleanupFormula?: string
  damageData?: RollDamageData
}

const definitions = [
  {
    name: 'Blinded',
    effect: 'Roll all Skill Checks that require sight with Disadvantage.',
    duration: 'Until the end of the next round.',
  },
  {
    name: 'Blood Trail',
    effect: 'You take 1d6+F at the end of each round. Stackable.',
    duration: 'Until cured with a bandage or a First Aid Skill Check.',
  },
  {
    name: 'Burned',
    effect: 'You take 1d10+F Fire damage at the end of each round.',
    duration:
      'Until the end of combat or 5 minutes. As an Action, a victim may perform a Dex Stat Check to extinguish the flames.',
  },
  {
    name: 'Drowning',
    effect: 'You take 1d6+F damage at the end of each round.',
    duration: 'Until your head is above water.',
  },
  {
    name: 'Dying',
    effect:
      'You are at 0% HP. Your Con Mod is how many rounds you have before you die. Subtract 1 from this countdown value at the end of each round. Additionally, each time a Dying Creature would take damage from any source, they instead subtract 1 from the countdown value.',
    duration: 'Until you die or heal at least 1 HP slot.',
  },
  {
    name: 'Enraged',
    effect: 'You are in a state of extreme uncontrolled fury. You may only perform Attack and Move Actions.',
    duration: 'Until the end of 2 rounds or 20 seconds.',
  },
  {
    name: 'Fatigued',
    effect: 'You have a -1 penalty on all Checks and your Move is halved. Stackable. Until the end of a long rest.',
    duration: 'Until the end of a long rest.',
  },
  {
    name: 'Held',
    effect:
      'You are actively being held. You can’t use Move Actions or take a Step but may still twist your body to Evade. Attacks against a Held foe are made with Advantage.',
    duration:
      'Until you are released by whatever is holding you, or you escape. Make a STR-Opposed Escape Artist Skill Check. If not physically held, it is Unopposed.',
  },
  {
    name: 'Long-Term Major Injury',
    effect: 'You take a -5 penalty to all Checks.',
    duration: 'Until the end of a full day of rest.',
  },
  {
    name: 'Long-Term Minor Injury',
    effect: 'You take a -2 penalty to all Checks.',
    duration: 'Until the end of a long rest.',
  },
  {
    name: 'Major Injury',
    effect:
      'You take a -5 penalty to all Checks. Gaining a Major Injury a second time changes it to a Long-Term Major Injury.',
    duration: 'Until the end of a long rest.',
  },
  {
    name: 'Minor Injury',
    effect:
      'You take a -2 penalty to all Checks. Gaining a Minor Injury a second time changes it to a Long-Term Minor Injury.',
    duration: 'Until the end of a short rest.',
  },
  {
    name: 'Muted',
    effect: 'You can’t speak or cast Spells.',
    duration: 'Until the end of the combat or 5 minutes.',
  },
  {
    name: 'Poisoned',
    effect: 'You take 1d8+F Poison damage at the end of each round. Stackable.',
    duration: 'Until treated with an antidote.',
  },
  {
    name: 'Paralyzed',
    effect: 'You can’t take any Actions.',
    duration: 'Until the end of the next round.',
  },
  {
    name: 'Queasy',
    effect: 'If your next Action requires a roll, it’s made with Disadvantage.',
    duration: 'At the end of the next Action you take.',
  },
  {
    name: 'Sepsis',
    effect: 'You’re Staggered (see below) and take 1d10+F Poison damage at the end of each round.',
    duration: 'As Staggered, and the damage continues until you’re healed.',
  },
  {
    name: 'Shit-Faced',
    effect: 'You make all your Checks with Disadvantage.',
    duration: 'Until the end of 10 minutes.',
  },
  {
    name: 'Shocked',
    effect: 'You lose your next Action.',
    duration: 'Once you forfeit that Action.',
  },
  {
    name: 'Sore as Shit',
    effect: 'You suffer a -1 penalty to all rolls.',
    duration: 'Until the end of 1 hour.',
  },
  {
    name: 'Staggered',
    effect:
      'The next Action you take can’t be a Move, and if it is an Attack, its Check is made with Disadvantage. You can’t take a 10ft Step with your next Action.',
    duration: 'At the end of the next Action you take.',
  },
  {
    name: 'Stiff Legs',
    effect: 'You can’t take 10ft Steps.',
    duration: 'Until the end of the combat or 5 minutes.',
  },
  {
    name: 'Stunned',
    effect: 'You gain Disadvantage on your next Check.',
    duration: 'Once you make a Check.',
  },
  {
    name: 'Take Down',
    effect: 'You fall prone. While prone, all Attacks made against you are made with Advantage.',
    duration: 'Use your 10ft Step to stand.',
  },
  {
    name: 'Terrified',
    effect: 'You can’t take Move Actions or 10ft Steps. You make all Attacks with Disadvantage.',
    duration: 'Until the end of the next round, or you take at least 1 HP slot damage.',
  },
  {
    name: 'The Taint',
    effect: 'You can’t be healed.',
    duration: 'Until the end of combat or 5 minutes.',
  },
  {
    name: 'Woozy',
    effect: 'You can’t add your Dex Mod to Attack or Evade Checks.',
    duration: 'Until the end of the next round.',
  },
]

const recurring: Record<string, { formula: string; types: string[] }> = {
  'Blood Trail': { formula: '1d6+F', types: [] },
  Burned: { formula: '1d10+F', types: ['Fire'] },
  Drowning: { formula: '1d6+F', types: [] },
  Poisoned: { formula: '1d8+F', types: ['Poison'] },
  Sepsis: { formula: '1d10+F', types: ['Poison'] },
}
// Conditional cures, actions, injuries and rests have no invented fixed timeout.
const timedDurations: Record<string, number> = {
  Blinded: 10,
  Burned: 300,
  Enraged: 20,
  Muted: 300,
  Paralyzed: 10,
  'Shit-Faced': 600,
  'Sore as Shit': 3600,
  'Stiff Legs': 300,
  Terrified: 10,
  'The Taint': 300,
  Woozy: 10,
}
export const debuffs: DebuffDefinition[] = definitions.map((definition) => ({
  ...definition,
  durationSeconds: timedDurations[definition.name] ?? null,
  stackable: /Stackable\./i.test(definition.effect),
  ...(recurring[definition.name]
    ? {
        cleanupFormula: recurring[definition.name].formula,
        damageData: { types: normalizeDamageTypes(recurring[definition.name].types) },
      }
    : {}),
}))

/** Older sheets store true/false; true remains one active stack. */
export function debuffStacks(value: unknown, stackable = true): number {
  const count =
    value === true
      ? 1
      : typeof value === 'number' && Number.isFinite(value)
        ? Math.max(0, Math.min(100, Math.floor(value)))
        : 0
  return stackable ? count : count > 0 ? 1 : 0
}

/** Merge changes made on another screen without discarding an unsaved local edit. */
export function mergeSavedDebuffCounts(local: DebuffCounts, previous: DebuffCounts, saved: DebuffCounts): DebuffCounts {
  let next = local
  for (const name of new Set([...Object.keys(previous), ...Object.keys(saved)])) {
    const before = debuffStacks(previous[name])
    const after = debuffStacks(saved[name])
    if (before !== after && debuffStacks(local[name]) === before) next = { ...next, [name]: after }
  }
  return next
}

/** Only dice counts scale: additive modifiers, including Floor, are added once. */
export function scaleDamageDice(formula: string, multiplier: number): string {
  return formula.replace(
    /(\d*)d(\d+|%)/gi,
    (_match, count: string, sides: string) => `${(Number(count) || 1) * multiplier}d${sides}`,
  )
}

export function cleanupDamageFormula(effect: ActiveDebuff, floor: number): string {
  return scaleDamageDice(effect.cleanupFormula || '', effect.stacks)
    .replace(/\bF\b/gi, String(Math.max(0, Number(floor) || 0)))
    .replace(/\s+/g, '')
}

export function sheetDebuffs(data: Record<string, any> = {}): ActiveDebuff[] {
  const standard = debuffs.flatMap((definition) => {
    const stacks = debuffStacks(data.activeDebuffs?.[definition.name], definition.stackable)
    return stacks
      ? [
          {
            id: definition.name,
            name: definition.name,
            stacks,
            cleanupFormula: definition.cleanupFormula,
            damageData: definition.damageData,
          },
        ]
      : []
  })
  const custom: ActiveDebuff[] = (Array.isArray(data.customDebuffs) ? data.customDebuffs : []).flatMap(
    (entry: any, index: number) => {
      const stacks = entry.active ? debuffStacks(entry.stacks ?? 1, entry.stackable === true) : 0
      if (!stacks) return []
      return [
        {
          id: `custom-${entry.id ?? index}`,
          name: String(entry.name || 'Custom debuff'),
          stacks,
          cleanupFormula: String(entry.cleanupFormula || '').trim() || undefined,
          damageData: { types: normalizeDamageTypes(entry.cleanupDamageTypes) },
        },
      ]
    },
  )
  return [...standard, ...custom]
}

export function sheetFloor(data: Record<string, any> = {}): number {
  return Math.max(0, Math.floor(Number(data.character?.floor ?? data.currentFloor ?? data.floor) || 0))
}

export function sanitizeDebuffs(input: unknown): ActiveDebuff[] {
  if (input === undefined) return []
  if (!Array.isArray(input) || input.length > 100) throw new Error('Invalid creature debuffs.')
  return input.map((effect) => {
    if (
      !effect ||
      typeof effect.id !== 'string' ||
      effect.id.length > 160 ||
      typeof effect.name !== 'string' ||
      effect.name.length > 120 ||
      !Number.isInteger(effect.stacks) ||
      effect.stacks < 1 ||
      effect.stacks > 100
    )
      throw new Error('Invalid creature debuff.')
    const definition = debuffs.find((d) => d.name === effect.id)
    if (definition)
      return {
        id: definition.name,
        name: definition.name,
        stacks: debuffStacks(effect.stacks, definition.stackable),
        cleanupFormula: definition.cleanupFormula,
        damageData: definition.damageData,
      }
    if (
      !effect.id.startsWith('custom-') ||
      (effect.cleanupFormula !== undefined &&
        (typeof effect.cleanupFormula !== 'string' ||
          effect.cleanupFormula.length > 160 ||
          !/^[\s\ddF%khl()+*/-]+$/i.test(effect.cleanupFormula)))
    )
      throw new Error('Invalid custom creature debuff.')
    return {
      id: effect.id,
      name: effect.name,
      stacks: effect.stacks,
      cleanupFormula: effect.cleanupFormula,
      damageData: { types: normalizeDamageTypes(effect.damageData?.types) },
    }
  })
}
