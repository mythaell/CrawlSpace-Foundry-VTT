import type { UseEffectFields } from './useEffects'
import { statDefinitions } from './inventoryItems'
import { normalizeHealing } from './healing'
import { isUnarmedSkill } from './characterSheetRules'
import { defaultUpkeep } from './upkeep'
import { normalizeTokenPrototype } from './vttTokenPrototype'
import { createEffectProperty, type ItemSpell } from './contentModels'
import type { AbilityTemplateFields as AbilityTemplateProperties } from './abilityTemplates'
import type { DebuffCounts } from './debuffs'
import type { DamageResponse } from './damageResponses'
import type { SheetAction } from './actions'
type RichTextValue = { html: string; text: string }
import type { SealedLootBox } from './sealedLootBoxes'
import type { DamageModification } from './damageModification'

export const attributes = statDefinitions

export const createAbility = () => ({
  id: crypto.randomUUID() as string,
  value: '',
  expanded: false,
  properties: {
    effects: [] as ReturnType<typeof createEffectProperty>[],
    stat: '',
    statBonus: '',
    skill: '',
    skillBonus: '',
    spell: '',
    spellBonus: '',
    drModifier: '',
    evadeModifier: '',
    moveModifier: '',
    stepModifier: '',
    healthBonuses: [
      {
        slots: [] as string[],
        value: '',
      },
    ],
    manaBonuses: [
      {
        value: '',
      },
    ],
  },
})

export const createAchievement = () => ({
  id: crypto.randomUUID(),
  name: '',
  description: '',
  reward: '',
})

export const createBuff = () => ({
  id: crypto.randomUUID(),
  name: '',
  active: false,
  stackable: false,
  stacks: 1,
  cleanupFormula: '',
  cleanupDamageTypes: [] as string[],
  description: '',
  duration: '',
  expanded: false,
  properties: {
    effects: [] as ReturnType<typeof createEffectProperty>[],
    statModifiers: [
      {
        stat: '',
        value: '',
      },
    ],
    skillModifiers: [
      {
        skill: '',
        value: '',
      },
    ],
    spellModifiers: [
      {
        spell: '',
        value: '',
      },
    ],
    drModifier: '',
    evadeModifier: '',
    moveModifier: '',
    stepModifier: '',
    healthBonus: '',
    manaBonus: '',
  },
})

export const createSkill = (name = '', unenhancedRank = '') => ({
  ...({} as { raceClassRankBonus?: number }),
  ...normalizeHealing({}),
  id: crypto.randomUUID(),
  name,
  unenhancedRank,
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
  ...({} as AbilityTemplateProperties & UseEffectFields),
  combatRelated: false,
  ...({ armorPiercing: false } as { armorPiercing?: boolean }),
  isAttackSkill: false,
  // Named skills start from the unarmed name list; blank new skills start unchecked.
  ...({ isUnarmed: isUnarmedSkill({ name }) } as { isUnarmed?: boolean }),
  isDamageEffectSkill: false,
  ...({} as {
    damageEffectAddRankToAttack?: boolean
    damageEffectAttackMode?: 'normal' | 'advantage' | 'disadvantage'
  }),
  damageEffectSkills: [] as string[],
  damageTypes: [] as string[],
  rank5DamageTypes: [] as string[],
  rank10DamageTypes: [] as string[],
  rank15DamageTypes: [] as string[],
  damageFormula: '',
  rank5DamageFormula: '',
  rank10DamageFormula: '',
  rank15DamageFormula: '',
  effects: [] as ReturnType<typeof createEffectProperty>[],
})

export const createSpell = (name = '', unenhancedRank = '') => ({
  ...({} as { raceClassRankBonus?: number }),
  ...normalizeHealing({}),
  id: String(crypto.randomUUID()),
  name,
  unenhancedRank,
  enhancedRank: '',
  stat: '',
  mod: '',
  mana: '',
  range: '',
  checkType: '',
  cooldown: '',
  notes: '',
  completed: false,
  details: '',
  rank5: '',
  rank10: '',
  rank15: '',
  damageTypes: [] as string[],
  rank5DamageTypes: [] as string[],
  rank10DamageTypes: [] as string[],
  rank15DamageTypes: [] as string[],
  damageFormula: '',
  rank5DamageFormula: '',
  rank10DamageFormula: '',
  rank15DamageFormula: '',
  ...({} as AbilityTemplateProperties & UseEffectFields),
  ...({ armorPiercing: false } as { armorPiercing?: boolean }),
  ...({} as { killingBlowStacking?: boolean; killingBlowStacks?: number }),
  ...({} as { effects?: ReturnType<typeof createEffectProperty>[] }),
  isAttackSpell: false,
  inherentCooldown: '',
  inherentCooldownUntil: '',
  inherentGrantId: '',
})

export const createAttack = () => ({
  id: crypto.randomUUID(),
  name: '',
  sourceType: '' as '' | 'skill' | 'spell' | 'weapon' | 'consumable',
  sourceId: '',
  linkedSkillId: '',
  ammunitionId: '',
  hitRank: '',
  hitMod: '',
  damageDice: '',
  damageMod: '',
  /** Dice changes on top of the formula; `damageMod` is the bonus. */
  damageModification: {} as Omit<DamageModification, 'bonus'>,
  effects: '',
  expanded: false,
})

export const createInventoryItem = () => ({
  id: crypto.randomUUID(),
  name: '',
  quantity: '',
  equipped: false,
  notes: '',
  expanded: false,

  properties: {
    ...normalizeHealing({}),
    ...({} as AbilityTemplateProperties & UseEffectFields),
    damageFormula: '',
    damageTypes: [] as string[],
    itemType: 'other',
    armorDr: '',
    details: '',
    effects: [] as ReturnType<typeof createEffectProperty>[],
    spells: [] as ItemSpell[],

    statBonuses: [
      {
        stat: '',
        value: '',
      },
    ],

    skillBonuses: [
      {
        skill: '',
        value: '',
      },
    ],

    spellBonuses: [
      {
        spell: '',
        value: '',
      },
    ],

    healthBonuses: [
      {
        slots: [] as string[],
        value: '',
      },
    ],

    moveBonuses: [
      {
        value: '',
      },
    ],

    stepBonuses: [
      {
        value: '',
      },
    ],

    manaBonuses: [
      {
        value: '',
      },
    ],

    equipment: {
      slot: '',
      ...({} as { isShield?: boolean }),
    },

    weapon: {
      type: '',
      ammunitionId: '',
      ...({} as { hands?: string; twoHanded?: boolean; magic?: boolean; damageModification?: DamageModification }),
    },

    consumable: {
      type: '',
    },
    ...({} as { isManaRestore?: boolean; manaRestoreAmount?: string }),

    tattoo: {
      location: '',
    },
  },
})

export const createDefaultSheet = () => ({
  upkeep: defaultUpkeep(),
  character: {
    showPlayerName: false,
    name: '',
    gold: '0',
    race: '',
    gender: '',
    level: '',
    crawlerNumber: '',
    className: '',
    floor: '',
    evadeDex: '',
    evadeBuffs: '',
    evadeTotal: '',
    move: '',
    step: '',
    armor: '',
    drBuffs: '',
    drTotal: '',
    aiFavor: '',
    size: '',
    maxMana: '',
    currentMana: '',
    debuffs: '',
    externalBuff1: '',
    externalBuff2: '',
    externalBuff3: '',
  },
  portrait: null as string | null,
  tokenPrototype: normalizeTokenPrototype(null),
  currentHealth: 110,
  attributeValues: attributes.map(() => ({
    ...({} as { raceClassStatBonus?: number }),
    enhanced: '',
    unenhanced: '',
    mod: '',
  })),
  activeDebuffs: {} as DebuffCounts,
  customDebuffs: [] as ReturnType<typeof createBuff>[],
  shieldSlots: 0,
  shieldInput: '',
  shieldSlotStates: [] as boolean[],
  characterDamageResponses: [] as DamageResponse[],
  petDamageResponses: [] as DamageResponse[],
  mountDamageResponses: [] as DamageResponse[],
  internalBuffs: [] as ReturnType<typeof createBuff>[],
  externalBuffs: [] as ReturnType<typeof createBuff>[],
  attacks: Array.from({ length: 3 }, createAttack),
  hotlist: Array.from({ length: 10 }, () => ''),
  sideInfo: {
    popularity: '',
    pastTrauma: '',
    looseEnds: '',
    regrets: '',
    notes: '',
  },
  skills: [] as ReturnType<typeof createSkill>[],
  spells: [] as ReturnType<typeof createSpell>[],
  expandedSkills: {} as Record<string, boolean>,
  expandedSpells: {} as Record<string, boolean>,
  inventory: [] as ReturnType<typeof createInventoryItem>[],
  lootBoxes: [] as SealedLootBox[],
  cooldowns: [] as import('./cooldowns').ActiveCooldown[],
  /** Inherent Spell grant keys in the order the crawler arranged them. */
  inherentSpellOrder: [] as string[],
  petHealth: 110,
  petHealthInput: '',
  mountHealth: 110,
  mountHealthInput: '',
  petInfo: {
    strength: '',
    intelligence: '',
    constitution: '',
    dexterity: '',
    charisma: '',
    level: '',
    dr: '',
    evade: '',
    move: '',
    size: '',
  },
  petAttacks: [] as { label: string; value: string }[],
  mountInfo: {
    size: '',
    occupants: '',
    move: '',
    dr: '',
    accessories: '',
  },
  importantKills: [] as { id: string; value: string }[],
  achievements: [] as ReturnType<typeof createAchievement>[],
  personalSpace: {
    tier: '',
    size: '',
  },
  amenities: [] as { id: string; value: string }[],
  clubs: [] as { id: string; value: string }[],
  deity: '',
  sponsors: ['', '', ''],
  racialAbilities: [] as ReturnType<typeof createAbility>[],
  classAbilities: [] as ReturnType<typeof createAbility>[],
  otherAbilities: [] as ReturnType<typeof createAbility>[],
  actions: [] as SheetAction[],
  background: { childhood: '', adolescence: '', career: '', hobby: '' },
  biography: {} as Record<string, RichTextValue>,
  attributeOverrides: {} as Record<number, string>,
  attributeModOverrides: {} as Record<number, string>,
  maxManaOverride: '',
  evadeOverride: '',
  drOverride: '',
  healthOverrides: {} as Record<number, string>,
  skillEnhancedOverrides: {} as Record<string, string>,
  skillModOverrides: {} as Record<string, string>,
  spellEnhancedOverrides: {} as Record<string, string>,
  spellModOverrides: {} as Record<string, string>,
})
