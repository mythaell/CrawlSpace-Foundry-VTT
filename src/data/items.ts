import { rankCap } from '../effects/rank-cap'
import { GEAR_SLOTS } from '../config'
import { rankDie } from '../rules/core'

const f = () => foundry.data.fields
const text = (initial = '') => new (f().StringField)({ required: true, blank: true, initial })
const html = () => new (f().HTMLField)({ required: true, blank: true })
const integer = (initial = 0, options: Record<string, unknown> = {}) =>
  new (f().NumberField)({ required: true, nullable: false, integer: true, initial, ...options })
const optionalNumber = () => new (f().NumberField)({ required: false, nullable: true, integer: true, initial: null })
const stringList = () => new (f().ArrayField)(new (f().StringField)({ blank: false }))

/** Where an entry came from in CrawlSpace (game or homebrew database), for re-imports and links. */
const sourceSchema = () =>
  new (f().SchemaField)({
    database: text(),
    id: optionalNumber(),
    book: text(),
    pages: text(),
  })

const common = () => ({ description: html(), notes: text(), source: sourceSchema() })

const damageSchema = () =>
  new (f().SchemaField)({
    formula: text(),
    types: stringList(),
    armorPiercing: new (f().BooleanField)(),
    magic: new (f().BooleanField)(),
    /** Hits an area (areaDamageHalf halves it for some targets). */
    area: new (f().BooleanField)(),
  })

/** A heal: slots restored, with formulas that replace it from Rank 5, 10 and 15 (healing.ts). */
const healingSchema = () =>
  new (f().SchemaField)({
    formula: text(),
    rank5: text(),
    rank10: text(),
    rank15: text(),
  })

/** RANK and RANK_DIE filled in for one Rank; floor and stat tokens wait for the roll. */
export const withRank = (formula: string, rank: number) =>
  String(formula ?? '')
    .replace(/\bRANK_DIE\b/gi, `(${rankDie(rank)})`)
    .replace(/\bRANK\b/gi, String(rank))

/** Shared by skills and spells: ranks, rank upgrades and their damage formulas. */
const rankedSchema = () => {
  const fields = f()
  return {
    ...common(),
    stat: text('DEX'),
    rank: new fields.SchemaField({
      value: integer(0, { min: 0 }),
      override: optionalNumber(),
      modOverride: optionalNumber(),
    }),
    checkType: text('Unopposed'),
    cooldown: text(),
    marked: new fields.BooleanField(),
    isAttack: new fields.BooleanField(),
    isUnarmed: new fields.BooleanField(),
    damage: damageSchema(),
    healing: healingSchema(),
    upgrades: new fields.SchemaField({
      rank5: text(),
      rank10: text(),
      rank15: text(),
      rank5Damage: text(),
      rank10Damage: text(),
      rank15Damage: text(),
    }),
  }
}

/** Effective rank and damage at that rank; the actor's rank bonuses come from ActiveEffects. */
function prepareRanked(model: any, kind: 'skill' | 'spell') {
  const actor = model.parent?.actor
  const name = String(model.parent?.name ?? '').trim().toLowerCase()
  const bonuses = actor?.system?.bonuses
  const baseBonus = Number(bonuses?.[kind === 'skill' ? 'baseSkillRanks' : 'baseSpellRanks']?.[name]) || 0
  const bonus = Number(bonuses?.[kind === 'skill' ? 'skillRanks' : 'spellRanks']?.[name]) || 0
  model.rank.cap = rankCap(actor, model.parent?.name ?? '')
  model.rank.base = Math.floor(Math.min(model.rank.cap, model.rank.value + baseBonus))
  model.rank.total = Math.max(0, Math.floor(Math.min(model.rank.cap, model.rank.override ?? model.rank.base + bonus)))
  model.rank.mod = Math.floor(model.rank.modOverride ?? (actor?.system?.statMod?.(model.stat) ?? 0))
  const rank = model.rank.total
  const upgraded =
    rank >= 15 && model.upgrades.rank15Damage
      ? model.upgrades.rank15Damage
      : rank >= 10 && model.upgrades.rank10Damage
        ? model.upgrades.rank10Damage
        : rank >= 5 && model.upgrades.rank5Damage
          ? model.upgrades.rank5Damage
          : model.damage.formula
  model.damage.atRank = withRank(upgraded, rank)
  const heal = model.healing ?? {}
  const healing = (rank >= 15 && heal.rank15) || (rank >= 10 && heal.rank10) || (rank >= 5 && heal.rank5) || heal.formula || ''
  model.healing.atRank = withRank(String(healing).trim(), rank)
  model.checkBonus = rank + model.rank.mod
}

export class SkillData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    return rankedSchema()
  }
  prepareDerivedData() {
    prepareRanked(this, 'skill')
  }
  /** Re-run by the owning actor once its ActiveEffects (rank bonuses) have applied. */
  prepareActorData() {
    prepareRanked(this, 'skill')
  }
}

export class SpellData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...rankedSchema(),
      stat: text('INT'),
      mana: text(),
      range: text(),
      duration: text(),
      cooldownUntil: optionalNumber(),
      killingBlowStacking: new fields.BooleanField(),
      killingBlowStacks: integer(0, { min: 0 }),
      killingBlowAt: optionalNumber(),
      killingBlowGameClock: optionalNumber(),
      killingBlowFloor: text(),
      usage: new fields.StringField({ required: true, initial: 'learned', choices: ['learned', 'inherent', 'scroll', 'tome'] }),
    }
  }
  prepareActorData() {
    prepareRanked(this, 'spell')
  }
  prepareDerivedData() {
    prepareRanked(this, 'spell')
    const cost = Number(String(this.mana).replace(/[^\d.-]/g, ''))
    this.manaCost = Number.isFinite(cost) ? Math.floor(cost) : 0
  }
}

/** Fields every physical item has. */
const physical = () => {
  const fields = f()
  return {
    ...common(),
    quantity: integer(1, { min: 0 }),
    equipped: new fields.BooleanField(),
    tags: stringList(),
  }
}

export class WeaponData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...physical(),
      weaponType: new fields.StringField({ required: true, initial: 'melee', choices: ['melee', 'ranged', 'thrown', 'ammunition', 'other'] }),
      hands: text(),
      twoHanded: new fields.BooleanField(),
      /** Name of the skill used to attack with this weapon. */
      skill: text(),
      ammunition: text(),
      damage: damageSchema(),
      armorDr: integer(0),
    }
  }
}

export class EquipmentData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...physical(),
      slot: new fields.StringField({ required: true, initial: 'torso', choices: Object.keys(GEAR_SLOTS) }),
      armorDr: integer(0),
      isShield: new fields.BooleanField(),
    }
  }
}

export class ConsumableData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...physical(),
      consumableType: text('other'),
      skill: text(),
      damage: damageSchema(),
      healing: new fields.SchemaField({ formula: text(), slots: new fields.BooleanField({ initial: true }) }),
      manaRestore: text(),
    }
  }
}

export class TattooData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    return { ...physical(), equipped: new (f().BooleanField)({ initial: true }), location: text() }
  }
}

export class LootData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    return { ...physical() }
  }
}

export class LootBoxData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...common(),
      quantity: integer(1, { min: 0 }),
      tier: text('Bronze'),
      boxType: text(),
      contents: text(),
      sealed: new fields.BooleanField({ initial: true }),
    }
  }
}

/** Racial, class and other abilities. Mechanics live on the item's ActiveEffects. */
export class AbilityData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...common(),
      category: new fields.StringField({ required: true, initial: 'other', choices: ['racial', 'class', 'other'] }),
      cooldown: text(),
    }
  }
}

const benefitSchema = () =>
  new (f().SchemaField)({ name: text(), tier: text(), description: text() })

export class RaceData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...common(),
      origin: text(),
      size: text(),
      sizeName: text(),
      drBonus: integer(0),
      benefits: new fields.ArrayField(benefitSchema()),
      detriments: new fields.ArrayField(benefitSchema()),
      tags: text(),
    }
  }
}

export class ClassData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...common(),
      drBonus: integer(0),
      benefits: new fields.ArrayField(benefitSchema()),
      detriments: new fields.ArrayField(benefitSchema()),
      tags: text(),
    }
  }
}

export class BackgroundData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    const fields = f()
    return {
      ...common(),
      stage: new fields.StringField({ required: true, initial: 'childhood', choices: ['childhood', 'adolescence', 'career', 'hobby'] }),
    }
  }
}

export class AchievementData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    return { ...common(), reward: text(), contents: text() }
  }
}

export class TrapData extends foundry.abstract.TypeDataModel {
  [key: string]: any
  static defineSchema() {
    return { ...common(), trapType: text(), damage: damageSchema() }
  }
}

export const EQUIPPABLE_TYPES = new Set(['weapon', 'equipment', 'tattoo'])
