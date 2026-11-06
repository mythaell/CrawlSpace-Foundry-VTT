import type { AbilityTemplateFields } from './abilityTemplates'
import type { UseEffectFields } from './useEffects'
import type { DamageModification } from './damageModification'
// Shared defaults for the game and homebrew editors. Character-specific defaults stay in App.
import { normalizeHealing, type HealingFields } from './healing'
import type { ContentType } from '../api/types'
import type { ProvenancedContent } from './contentProvenance'
import type { ConditionShield } from './conditionShields'
export type EffectPropertyType =
  | 'statBonus'
  | 'baseStatBonus'
  | 'statBonusPercent'
  | 'skillRank'
  | 'spellRank'
  | 'baseSkillRank'
  | 'baseSpellRank'
  | 'rankCap'
  | 'healthBonus'
  | 'manaBonus'
  | 'drModifier'
  | 'damageResistance'
  | 'damageVulnerability'
  | 'damageImmunity'
  | 'evadeModifier'
  | 'moveModifier'
  | 'stepModifier'
  | 'extraActions'
  | 'hotlistSlots'
  | 'armorPiercing'
  | 'inherentSpell'
  | 'attackMode'
  | 'checkMode'
  | 'evadeMode'
  | 'incomingAttackMode'
  | 'damageBonus'
  | 'magicDamageCap'
  | 'statModifier'
  | 'statModifierLoss'
  | 'shield'
  | 'lightOrb'
  | 'raiseMinion'
  | 'conditionImmunity'
  | 'manaPerRound'
  | 'regenPerRound'
  | 'areaDamageHalf'

/** Keep source IDs qualified because game and homebrew IDs can overlap. */
export type ContentLink = {
  id: number
  source: string
  name: string
  content_type: ContentType
  data: Record<string, unknown>
}
export type EffectProperty = {
  statPercent?: { percent: string; target: string; fixedValue: string }
  id: string
  type: EffectPropertyType | ''
  target: string
  value: string
  slots: string[]
  requiredRank: string
  contentLink?: ContentLink
  /** Inherent Spell effects: the cooldown after each use, e.g. `3 hours`. */
  cooldown?: string
  /** Damage Modifier effects: the bonus damage's types. */
  damageTypes?: string[]
  /** Damage Modifier effects: what it adds to. `target` can narrow it to named skills or spells. */
  damageScope?: 'weapon' | 'skills' | 'spells'
  /** Damage Modifier effects: the attacks it covers ignore DR. */
  armorPiercing?: boolean
  /** On a condition: the Rank bands (1, 5, 10, 15) this effect is active at; none means all. */
  ranks?: number[]
  /** Regen effects: how often it restores, and a conditional alternate time once the Rank reaches a stat's modifier. */
  interval?: string
  alternate?: boolean
  fastInterval?: string
  fastStat?: string
  /** Shield effects: `value` is the slots and `target` the Health per slot. */
  scope?: 'all' | 'nonMagic'
  /** Light effects: `value` is the range and `target` the bright radius, in feet. */
  dimFeet?: string
  doubled?: boolean
}

export type SkillEntry = ProvenancedContent &
  HealingFields &
  UseEffectFields &
  AbilityTemplateFields & {
    name: string
    /** Optional icon image, chosen beside the Database ID. */
    icon?: string
    unenhancedRank: string
    enhancedRank: string
    stat: string
    mod: string
    checkType: string
    /** Waiting time after each use, e.g. `1 hour`; blank for none. */
    cooldown?: string
    notes: string
    completed: boolean
    details: string
    rank5: string
    rank10: string
    rank15: string
    isAttackSkill: boolean
    isUnarmed?: boolean
    isDamageEffectSkill?: boolean
    damageEffectAddRankToAttack?: boolean
    damageEffectAttackMode?: 'normal' | 'advantage' | 'disadvantage'
    damageEffectSkills?: string[]
    damageTypes: string[]
    rank5DamageTypes: string[]
    rank10DamageTypes: string[]
    rank15DamageTypes: string[]
    combatRelated?: boolean
    armorPiercing?: boolean
    /** Spells only: each killing blow adds 1 damage to this spell, up to its Rank. */
    killingBlowStacking?: boolean
    /** Spells only: this spell's own kills, kept on the sheet's row. */
    killingBlowStacks?: number
    /** Spells only: when and on which floor the latest kill happened, which ends the bonus at Rank 5 and up. */
    killingBlowAt?: number
    killingBlowGameClock?: number
    killingBlowFloor?: string
    damageFormula: string
    rank5DamageFormula: string
    rank10DamageFormula: string
    rank15DamageFormula: string
    effects: EffectProperty[]
  }

export type SpellEntry = Omit<SkillEntry, 'isAttackSkill' | 'effects'> & {
  isAttackSpell: boolean
  mana: string
  range: string
  inherentCooldown?: string
  inherentCooldownUntil?: string
  inherentGrantId?: string
  inherentItemId?: string
  /** Permanent effects unlocked by the spell's rank, like a skill's. */
  effects?: EffectProperty[]
  /** How long a cast lasts, in the buff timer format; a placed area template ends with it. */
  duration?: string
}

export type InventoryEntry = ProvenancedContent & {
  lootBox?: boolean
  /** Generated loot records its origin, e.g. `Tier: Silver` and `Floor: 3`. */
  tags?: string[]
  name: string
  quantity: string
  equipped: boolean
  notes: string
  expanded: boolean
  properties: HealingFields &
    UseEffectFields &
    AbilityTemplateFields & {
      /** Optional icon image, chosen beside the Database ID. */
      icon?: string
      damageFormula?: string
      damageTypes?: string[]
      itemType: 'other' | 'equipment' | 'weapon' | 'consumable' | 'tattoos'
      armorDr: string
      details: string
      effects: EffectProperty[]
      spells?: ItemSpell[]
      contentLink?: ContentLink
      statBonuses: { stat: string; value: string }[]
      skillBonuses: { skill: string; value: string }[]
      spellBonuses: { spell: string; value: string }[]
      healthBonuses: { slots: string[]; value: string }[]
      moveBonuses: { value: string }[]
      stepBonuses: { value: string }[]
      manaBonuses: { value: string }[]
      equipment: { slot: string; isShield?: boolean }
      weapon: {
        type: string
        ammunitionId?: string
        hands?: string
        twoHanded?: boolean
        /** Everything this weapon deals counts as magic damage. */
        magic?: boolean
        /** Built-in changes to every damage roll made with this weapon. */
        damageModification?: DamageModification
      }
      consumable: { type: string }
      /** Consumables only: using the item restores this much mana (points, or `50%` of max). */
      isManaRestore?: boolean
      manaRestoreAmount?: string
      tattoo: { location: string }
    }
}

export type ItemSpell = {
  id: string
  spell: SpellEntry
  contentLink?: ContentLink
  rank: string
  mana: string
  cooldown: string
  cooldownUntil?: string
  usage: 'inherent' | 'scroll' | 'tome'
}

export type BuffEntry = ProvenancedContent & {
  conditionType?: 'buff' | 'debuff'
  standardDebuff?: string
  name: string
  active: boolean
  stackable?: boolean
  stacks?: number
  /** The most stacks allowed; `RANK` is resolved when the spell is cast. */
  maxStacks?: string
  /** Temporary shield slots; the condition ends when they run out. */
  shield?: ConditionShield
  /** Durations that replace `duration` from a Rank upward. */
  rankDurations?: { '5'?: string; '10'?: string; '15'?: string }
  /** The Rank entered on the sheet for a condition added without a cast. */
  rank?: string
  /** The Rank band its effects were chosen for, once cast. */
  resolvedRank?: number
  /** Who cast the spell that made this condition, recorded on its chat card. */
  castBy?: { characterId?: number; userId?: number; name?: string; rank?: number }
  /** Second Chance: the target becomes the caster's minion while this is active. */
  raisesMinion?: boolean
  /** Torch: the chat card offers a movable light token instead of applying a condition. */
  lightOrb?: { brightFeet: number; dimFeet: number; rangeFeet: number; doubleBright?: boolean }
  cleanupFormula?: string
  cleanupDamageTypes?: string[]
  description: string
  duration: string
  expanded: boolean
  properties: {
    /** Shown around a token while the condition is active. */
    icon?: string
    effects: EffectProperty[]
    statModifiers: { stat: string; value: string }[]
    skillModifiers: { skill: string; value: string }[]
    spellModifiers: { spell: string; value: string }[]
    drModifier: string
    evadeModifier: string
    moveModifier: string
    stepModifier: string
    healthBonus: string
    manaBonus: string
  }
}

const damageResponseLabel = 'Damage Response'
const rollModeLabel = 'Advantage/Disadvantage'
const regenLabel = 'Health and Mana Regen'
/** Hidden entries are the sub-choices of a grouped option: they only display once chosen. */
export const effectPropertyTypes: {
  value: EffectPropertyType
  label: string
  hidden?: boolean
}[] = [
  { value: 'statBonus', label: 'Stat Score' },
  { value: 'statModifier', label: 'Stat Mod' },
  { value: 'statModifierLoss', label: 'Lose Stat Mod' },
  { value: 'skillRank', label: 'Skill Rank' },
  { value: 'spellRank', label: 'Spell Rank' },
  { value: 'healthBonus', label: 'Health Bonus' },
  { value: 'manaBonus', label: 'Mana Bonus' },
  { value: 'armorPiercing', label: 'Armor piercing (this attack only)', hidden: true },
  { value: 'damageResistance', label: damageResponseLabel },
  { value: 'drModifier', label: damageResponseLabel, hidden: true },
  { value: 'damageVulnerability', label: damageResponseLabel, hidden: true },
  { value: 'damageImmunity', label: damageResponseLabel, hidden: true },
  { value: 'areaDamageHalf', label: damageResponseLabel, hidden: true },
  { value: 'magicDamageCap', label: damageResponseLabel, hidden: true },
  { value: 'evadeModifier', label: 'Evade' },
  { value: 'moveModifier', label: 'Move' },
  { value: 'stepModifier', label: 'Step' },
  { value: 'hotlistSlots', label: 'Hotlist Slots' },
  { value: 'inherentSpell', label: 'Inherent Spell' },
  { value: 'attackMode', label: rollModeLabel },
  { value: 'incomingAttackMode', label: rollModeLabel, hidden: true },
  { value: 'checkMode', label: rollModeLabel, hidden: true },
  { value: 'evadeMode', label: rollModeLabel, hidden: true },
  { value: 'damageBonus', label: 'Damage Modifier' },
  { value: 'conditionImmunity', label: 'Condition immunity' },
  { value: 'regenPerRound', label: regenLabel },
  { value: 'manaPerRound', label: regenLabel, hidden: true },
  { value: 'shield', label: 'Shield' },
  { value: 'lightOrb', label: 'Light' },
  { value: 'raiseMinion', label: 'Raise as minion' },
]

export const itemEffectPropertyTypes = [
  effectPropertyTypes[0],
  { value: 'statBonusPercent', label: 'Stat Score (%)' },
  { value: 'rankCap', label: 'Rank Cap (Race/Class)' },
  ...effectPropertyTypes.slice(1),
  { value: 'extraActions', label: 'Extra Actions' },
]

export const raceClassEffectPropertyTypes = effectPropertyTypes.map((property) =>
  property.value === 'statBonus'
    ? { value: 'baseStatBonus' as const, label: 'Stat Score (Unenhanced)' }
    : property.value === 'skillRank'
      ? { value: 'baseSkillRank' as const, label: 'Skill Rank (Unenhanced)' }
      : property.value === 'spellRank'
        ? { value: 'baseSpellRank' as const, label: 'Spell Rank (Unenhanced)' }
        : property,
)

export const createEffectProperty = (): EffectProperty => ({
  id: crypto.randomUUID(),
  type: '',
  target: '',
  value: '',
  slots: [],
  requiredRank: '',
})

export const createSkill = (): SkillEntry => ({
  ...normalizeHealing({}),
  name: '',
  unenhancedRank: '',
  enhancedRank: '',
  stat: '',
  mod: '',
  checkType: '',
  cooldown: '',
  notes: '',
  completed: false,
  details: '',
  rank5: '',
  rank10: '',
  rank15: '',
  isAttackSkill: false,
  isUnarmed: false,
  isDamageEffectSkill: false,
  damageEffectSkills: [] as string[],
  damageTypes: [],
  rank5DamageTypes: [],
  rank10DamageTypes: [],
  rank15DamageTypes: [],
  damageFormula: '',
  rank5DamageFormula: '',
  rank10DamageFormula: '',
  rank15DamageFormula: '',
  effects: [],
})

export const createSpell = (): SpellEntry => {
  const skill = createSkill()
  const spell = Object.fromEntries(
    Object.entries(skill).filter(([key]) => key !== 'effects' && key !== 'isAttackSkill'),
  ) as Omit<SkillEntry, 'isAttackSkill' | 'effects'>

  return { ...spell, isAttackSpell: false, mana: '', range: '' }
}

export const createInventoryItem = (): InventoryEntry => ({
  name: '',
  quantity: '',
  equipped: false,
  notes: '',
  expanded: false,
  properties: {
    ...normalizeHealing({}),
    itemType: 'other',
    armorDr: '',
    details: '',
    effects: [],
    statBonuses: [{ stat: '', value: '' }],
    skillBonuses: [{ skill: '', value: '' }],
    spellBonuses: [{ spell: '', value: '' }],
    healthBonuses: [{ slots: [], value: '' }],
    moveBonuses: [{ value: '' }],
    stepBonuses: [{ value: '' }],
    manaBonuses: [{ value: '' }],
    equipment: { slot: '' },
    weapon: { type: '', ammunitionId: '' },
    consumable: { type: '' },
    tattoo: { location: '' },
  },
})

export const createBuff = (): BuffEntry => ({
  conditionType: 'buff',
  name: '',
  active: false,
  stackable: false,
  stacks: 1,
  cleanupFormula: '',
  cleanupDamageTypes: [],
  description: '',
  duration: '',
  expanded: false,
  properties: {
    effects: [],
    statModifiers: [{ stat: '', value: '' }],
    skillModifiers: [{ skill: '', value: '' }],
    spellModifiers: [{ spell: '', value: '' }],
    drModifier: '',
    evadeModifier: '',
    moveModifier: '',
    stepModifier: '',
    healthBonus: '',
    manaBonus: '',
  },
})

/** A new target or type drops the effect's database link, unless the same update sets a new one
 * (choosing a database entry sets its name and link together). */
export const updateEffectProperty = (effects: EffectProperty[], id: string, updates: Partial<EffectProperty>) =>
  effects.map((effect) =>
    effect.id === id
      ? {
          ...effect,
          ...updates,
          ...(!('contentLink' in updates) &&
          ((updates.target !== undefined && updates.target !== effect.target) ||
            (updates.type !== undefined && updates.type !== effect.type))
            ? { contentLink: undefined }
            : {}),
        }
      : effect,
  )
