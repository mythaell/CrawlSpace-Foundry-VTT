import {
  createInventoryItem,
  createEffectProperty,
  type ContentLink,
  type SpellEntry,
  type ItemSpell,
  type EffectProperty,
  type EffectPropertyType,
} from './contentModels'
import type { DatabaseContent } from '../api/types'
import { damageTypes } from './damageResponses'
import { statDefinitions, finalizeLootItem, importInventoryItem, type InventoryItem } from './inventoryItems'
import {
  categories,
  tierRules,
  objectPools,
  themes,
  uniqueResults,
  propertyLabels,
  type LootCategory,
  type LootObject,
  type LootTier,
  type LootType,
} from './lootData'
import {
  abilityWords,
  abilityCreators,
  divinePhrases,
  effectNameThemes,
  nameWordCount,
  limitLootName,
} from './lootNames'
import {
  consumableSpellKind,
  consumableSpellName,
  consumableRarity,
  spellKey,
  spellRarities,
  spellRarity,
  spellRecord,
  linkedContent,
  type SpellRarity,
} from './lootSpells'
import {
  potionKind,
  potionQuantityFormula,
  rollPotionQuantity,
  consumableFamily,
  consumableFamilyWeights,
  findDatabasePotion,
  skillPotionKind,
  type ConsumableFamily,
  type DatabasePotion,
} from './lootPotions'

export type LootContext = {
  floor: number
  stats: Record<string, number>
  skills: { name: string; passive: boolean; details?: string; contentLink?: ContentLink }[]
  spells: { name: string; details?: string; record?: SpellEntry; rarity?: SpellRarity; contentLink?: ContentLink }[]
  consumables?: (DatabaseContent & { source?: string })[]
  /** Every database item named as a potion, of any item content type, for reuse. */
  potions?: (DatabaseContent & { source?: string })[]
}
export type GearChoice = {
  category: LootCategory
  object: string
  properties: {
    roll: number
    target?: string
    value?: number
    unique?: number
    recovery?: 'Recovery' | 'Restore'
    cooldown?: string
  }[]
}
export type LootSettings = {
  tier: LootTier
  type: LootType
  mode: 'Random' | 'Choose'
  items: number
  consumables: number
  potions: number
  choices: GearChoice[]
  consumableChoices?: string[]
  potionSkills?: string[]
  /** Narrows Random generation, used by the Homebrew item generator. */
  focus?: LootFocus
}
export type LootFocus = {
  category?: LootCategory
  object?: string
  /** Replaces the category's Table 38 objects, as the item generator's own item types do. */
  objects?: LootObject[]
  consumable?: ConsumableFamily | 'scroll' | 'tome'
  /** A Spell for scrolls and tomes, or the intended Skill for an enhancement potion. */
  target?: string
}
export type LootEntry = {
  item: InventoryItem
  checked: boolean
  kind: 'item' | 'consumable' | 'potion' | 'earth' | 'database'
  index: number
  rolls: string[]
}
export function defaultGearChoice(): GearChoice {
  return {
    category: 'Mundane / Weapon',
    object: objectPools['Mundane / Weapon'][0].name,
    properties: statDefinitions.map((stat) => ({ roll: 1, target: stat.code })),
  }
}
export const d = (sides: number, rng = Math.random) => Math.min(sides, Math.floor(rng() * sides) + 1)
const pick = <T>(values: readonly T[], rng: () => number): T => values[d(values.length, rng) - 1]
/** House rule: boxes hold Gold only on Floors 2–18, and never Celestial or Earth boxes. */
export function goldAllowed(tier: LootTier, floor: number, type?: LootType) {
  return tier !== 'Celestial' && type !== 'Earth' && Number.isFinite(floor) && floor >= 2 && floor <= 18
}
export function rollLootGold(tier: LootTier, floor: number, type: LootType, rng = Math.random) {
  if (!goldAllowed(tier, floor, type)) return 0
  const rule = tierRules[tier]
  return Array.from({ length: rule.dice }, () => d(rule.sides, rng)).reduce((a, b) => a + b, 0) * rule.multiplier
}
/** Gold, Platinum, Legendary and Celestial Stat results are a percentage of the crawler's
 * unenhanced Stat, fixed on the sheet when the item is first equipped (rulebook p. 220). */
export const statPercentTier = (tier: LootTier) => tier !== 'Bronze' && tier !== 'Silver'
/** X Values depend on the Floor (rulebook p. 220). Every three Floors raise the lowest
 * result of a ranged X Value by one, never past the tier's maximum. */
export function floorStep(floor = 0) {
  return Math.max(0, Math.floor((Number(floor) || 0) / 3))
}
export function xValue(tier: LootTier, skill: boolean, stat: number, rng = Math.random, boss = false, floor = 0) {
  if (tier === 'Bronze') return 0
  const ranged = (min: number, max: number) =>
    boss ? max : Math.min(max, Math.max(min - 1 + d(max - min + 1, rng), min + floorStep(floor)))
  if (skill)
    return tier === 'Silver'
      ? 1
      : tier === 'Gold'
        ? ranged(1, 3)
        : tier === 'Platinum'
          ? ranged(2, 4)
          : tier === 'Legendary'
            ? 5
            : 6
  if (tier === 'Silver') return 2
  if (tier === 'Gold') return ranged(3, 5)
  // Flat bonuses are supported by the sheet; percentages are not stored as effects.
  void stat
  return tier === 'Platinum' ? 5 : tier === 'Legendary' ? 10 : 20
}
function weighted<T>(values: readonly T[], score: (value: T) => number, rng: () => number): T {
  const weights = values.map(score)
  let roll = rng() * weights.reduce((a, b) => a + b, 0)
  return values.find((_, i) => (roll -= weights[i]) < 0) ?? values[values.length - 1]
}
function themeScore(text: string, type: LootType) {
  const skillPatterns: Partial<Record<LootType, RegExp>> = {
    "Assassin's": /stealth|hide|ambush|dagger|finesse|poison|backstab/,
    Bounty: /track|hunt|perception|look for|bow/,
    "Crafter's": /craft|alchemy|metal|sapper|engineer|salvage|infusion/,
    "Mechanic's": /repair|engineer|vehicle|pilot|drive|mechanic|salvage/,
    Pet: /pet|animal|riding|taming|beast/,
    Looter: /loot|inventory|dumpster|salvage|treasure|carry|acquisition/,
    'Lucky Bastard': /luck|gambl|dice|risk|scratcher/,
    'Lucky Bitch': /luck|gambl|ai|punish|game breaker/,
    "Survivor's": /heal|first aid|endurance|dodge|defen|recover/,
    Weapon: /dagger|sword|axe|bow|pugil|combat|spear|hammer/,
    Goblin: /dynamite|explos|bomb|blast|detonat/,
    Savage: /ambush|track|hunt|attack|combat|weapon/,
  }
  return themes[type]
    .split(' ')
    .filter(Boolean)
    .some((tag) => text.toLowerCase().includes(tag)) || skillPatterns[type]?.test(text.toLowerCase())
    ? 9
    : 1
}
function chooseName(names: string[], used: Set<string>, type: LootType, rng: () => number) {
  const available = names.filter((name) => !used.has(name))
  const name = weighted(available.length ? available : names, (name) => themeScore(name, type), rng)
  used.add(name)
  return name
}
export function lootName(
  object: string,
  tier: LootTier,
  type: LootType,
  unique: number | undefined,
  rng: () => number,
  effects: EffectProperty[] = [],
  spells: ItemSpell[] = [],
) {
  if (tier === 'Bronze') return object
  const nameThemes = effectNameThemes(effects)
  const descriptions = spells
    .map((s) => `${s.spell.name} ${s.spell.details}`)
    .join(' ')
    .toLowerCase()
  if (/\b(move|step|speed|teleport|fly|jump)\b/.test(descriptions) && !nameThemes.includes('speed'))
    nameThemes.unshift('speed')
  if (/\b(heal|heals|healing|restore|recovery)\b/.test(descriptions) && !nameThemes.includes('healing'))
    nameThemes.push('healing')
  if (/\b(shield|protect|barrier|armor)\b/.test(descriptions) && !nameThemes.includes('defense'))
    nameThemes.push('defense')
  const skill = effects.find((e) => e.type === 'skillRank')?.target
  const spell = spells[0]?.spell.name
  void type
  const primary = nameThemes[0] ? pick(abilityWords[nameThemes[0]], rng).split(' ') : undefined
  const secondary = nameThemes[1] ? pick(abilityWords[nameThemes[1]], rng).split(' ') : undefined
  if (unique === 2) {
    const divine = pick(divinePhrases, rng)
    const name = `${primary ? primary[0] + ' ' : ''}${object} of ${divine}`
    return nameWordCount(name) <= 5 ? name : `${divine.split(' ')[0]} ${object} of ${primary![1]}`
  }
  if (primary && secondary) {
    const name = `${primary[0]} ${object} of ${secondary.join(' ')}`
    return nameWordCount(name) <= 5 ? name : `${primary[0]} ${object} of ${secondary[1]}`
  }
  if (primary) {
    const style = rng()
    if (style < 0.4) return `${object} of ${primary.join(' ')}`
    if (style < 0.7) return `${primary[0]} ${object} of ${primary[1]}`
    const creator = pick(abilityCreators[nameThemes[0]], rng)
    if (style >= 0.85) return `${object} of the ${primary[0]} ${creator}`
    const name = `${creator}'s ${object} of ${primary.join(' ')}`
    return nameWordCount(name) <= 5 ? name : `${creator}'s ${object} of ${primary[1]}`
  }
  if (spell || skill) {
    const target = spell ?? skill!
    const name = `${object} of ${target}`
    return nameWordCount(name) <= 5 ? name : `${object} of ${limitLootName(target, 5 - nameWordCount(object))}`
  }
  if (unique === 3) return `Sentient ${object}`
  if (unique === 4) return `${object} of Loyal Minions`
  if (unique === 5) return `${object} of Echoes`
  return `Mysterious ${object}`
}

export function eligibleSpells(context: LootContext, tier: LootTier, usage: ItemSpell['usage'], rarity?: SpellRarity) {
  return context.spells.filter((spell) => {
    const value = spell.rarity ?? spellRarity(spell.name)
    return value && spellRarities(tier, usage).includes(value) && (!rarity || value === rarity)
  })
}
export function eligibleConsumables(context: LootContext, tier: LootTier) {
  return (context.consumables ?? []).filter((content) => {
    if (/skill.*potion|[+]\d.*potion|earth hobby/i.test(content.name)) return false
    const potion = potionKind(content)
    if (potion && !potionQuantityFormula(tier, potion)) return false
    const usage = consumableSpellKind(content)
    if (!usage) return true
    const rarity = consumableRarity(content)
    const fixed = consumableSpellName(content)
    return (
      (!rarity || spellRarities(tier, usage).includes(rarity)) &&
      eligibleSpells(context, tier, usage, rarity).some((spell) => !fixed || spellKey(spell.name) === spellKey(fixed))
    )
  })
}
export const consumableKey = (content: DatabaseContent & { source?: string }) =>
  `${content.source ?? 'game'}-${content.id}`
export const manaBonus = (tier: LootTier) =>
  ({ Bronze: 0, Silver: 2, Gold: 5, Platinum: 10, Legendary: 20, Celestial: 20 })[tier]

export function generateLootEntry(
  settings: LootSettings,
  context: LootContext,
  kind: LootEntry['kind'],
  index: number,
  rng = Math.random,
): LootEntry {
  if (settings.type === 'Earth' && settings.tier !== 'Silver') throw new Error('Earth boxes must be Silver.')
  const item: InventoryItem = { ...createInventoryItem(), id: crypto.randomUUID(), quantity: '1' }
  const p = item.properties
  const rolls: string[] = []
  const details: string[] = []
  const effect = (type: EffectPropertyType, target: string, value: number | string, slots: string[] = []) =>
    p.effects.push({ ...createEffectProperty(), type, target, value: String(value), slots })
  const addSpell = (spell: LootContext['spells'][number], rank: number, usage: ItemSpell['usage'], cooldown = '') => {
    const record = structuredClone(spell.record ?? spellRecord(spell.name, { details: spell.details ?? '' }))
    const granted: ItemSpell = {
      id: crypto.randomUUID(),
      spell: record,
      contentLink: spell.contentLink ? structuredClone(spell.contentLink) : undefined,
      rank: String(spell.name === 'Heal' ? 1 : rank),
      mana: usage === 'tome' ? record.mana : '0',
      cooldown,
      usage,
    }
    p.spells = [...(p.spells ?? []), granted]
    return granted
  }
  const tierIndex = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legendary', 'Celestial'].indexOf(settings.tier)
  if (kind === 'earth') {
    const reused = databasePotionEntry(context, 'earthHobby', settings, index, rolls, [])
    if (reused) return reused
    item.name = 'Earth Hobby Potion'
    p.itemType = 'consumable'
    p.consumable.type = 'potion'
    details.push(
      'Silver Earth Box: one Earth Hobby Potion. GM: choose the Earth hobby and complete its Skill benefit before use. Permanent benefit; apply on consumption, not while equipped.',
    )
  } else if (kind === 'potion') {
    const rank = [1, 1, 2, 3, 5, 15][tierIndex]
    const chosenSkill = settings.mode === 'Choose' ? settings.potionSkills?.[index] : settings.focus?.target
    const reused = databasePotionEntry(
      context,
      skillPotionKind(rank)!,
      settings,
      index,
      rolls,
      chosenSkill ? [`Intended Skill: ${chosenSkill}`] : [],
    )
    if (reused) return reused
    const skill =
      chosenSkill ||
      chooseName(
        context.skills.map((s) => s.name),
        new Set(),
        settings.type,
        rng,
      )
    if (!skill) throw new Error('Choose a Skill for the enhancement potion or load the Skill database.')
    item.name = limitLootName(
      settings.tier === 'Celestial' ? `Potion of Maximum ${skill}` : `Potion of +${rank} ${skill}`,
    )
    p.itemType = 'consumable'
    p.consumable.type = 'potion'
    // Permanent consumption effects have no equipment-effect equivalent in the current sheet.
    // Keep them out of always-on effects to prevent granting them by equipping a potion.
    details.push(
      settings.tier === 'Celestial'
        ? `On consumption: permanently set ${skill} to Rank 15 (the book's maximum). GM applies this to the Skill's base Rank.`
        : `On consumption: permanently add ${rank} Ranks to ${skill}. GM applies this to the Skill's base Rank.`,
    )
  } else if (kind === 'consumable') {
    const focus = settings.focus?.consumable
    const pool = eligibleConsumables(context, settings.tier)
      .filter((content) =>
        !focus
          ? true
          : focus === 'scroll' || focus === 'tome'
            ? consumableSpellKind(content) === focus
            : !consumableSpellKind(content) && consumableFamily(content) === focus,
      )
      .filter((content) => {
        const usage = consumableSpellKind(content),
          wanted = settings.focus?.target
        if (!usage || !wanted) return true
        const fixed = consumableSpellName(content)
        return (
          (!fixed || spellKey(fixed) === spellKey(wanted)) &&
          eligibleSpells(context, settings.tier, usage, consumableRarity(content)).some(
            (spell) => spellKey(spell.name) === spellKey(wanted),
          )
        )
      })
    if (!pool.length)
      throw new Error(
        focus
          ? 'No database consumable of that kind is allowed for this tier.'
          : 'No eligible database consumables are loaded for this tier. Add consumables to the database or set Consumables to 0.',
      )
    const selected = settings.consumableChoices?.[index]
    const families = [...new Set(pool.map(consumableFamily))]
    const family = settings.mode === 'Random' ? weighted(families, (f) => consumableFamilyWeights[f], rng) : undefined
    const content =
      settings.mode === 'Choose'
        ? selected
          ? pool.find((c) => consumableKey(c) === selected || c.name === selected)
          : pool[0]
        : weighted(
            pool.filter((c) => consumableFamily(c) === family),
            (c) => themeScore(`${c.name} ${JSON.stringify(c.data)}`, settings.type),
            rng,
          )
    if (!content) throw new Error('Choose a database consumable allowed for this tier.')
    const imported = importInventoryItem(content)
    Object.assign(item, imported, { quantity: Number(imported.quantity) >= 1 ? imported.quantity : '1' })
    Object.assign(p, imported.properties)
    item.properties = p
    item.name = limitLootName(
      item.name.replace(/^(Bronze|Silver|Gold|Platinum|Legendary|Celestial)\s+(?=.*(?:potion|scroll))/i, ''),
    )
    p.contentLink = linkedContent(content)
    const potion = potionKind(content)
    const quantityFormula = potion && potionQuantityFormula(settings.tier, potion)
    if (quantityFormula) {
      item.quantity = String(rollPotionQuantity(quantityFormula, rng))
      rolls.push(`Potion quantity: ${quantityFormula} → ${item.quantity}`)
    }
    // Database names stay intact; the box tier belongs only in the award notes.
    const usage = consumableSpellKind(content)
    if (usage) {
      const fixed = consumableSpellName(content)
      const wanted = fixed ?? settings.focus?.target
      const spells = eligibleSpells(context, settings.tier, usage, consumableRarity(content)).filter(
        (s) => !wanted || spellKey(s.name) === spellKey(wanted),
      )
      if (!spells.length) throw new Error('That Spell is not allowed on this kind of consumable for this tier.')
      const spell = weighted(spells, (s) => themeScore(`${s.name} ${s.details ?? ''}`, settings.type), rng)
      const rank = Number(p.spells?.[0]?.rank) || (usage === 'tome' ? 1 : [1, 1, 2, 3, 5, 6][tierIndex])
      p.spells = []
      const grant = addSpell(spell, rank, usage)
      item.name = limitLootName(`${usage === 'tome' ? 'Tome' : 'Scroll'} of ${spell.name}`)
      p.itemType = 'consumable'
      p.consumable.type = usage === 'scroll' ? 'scroll' : 'other'
      details.push(
        usage === 'tome'
          ? `On consumption: learn ${spell.name} at Rank ${grant.rank}.`
          : `One-use ${spell.name}, fixed Rank ${grant.rank}, no Mana cost.`,
      )
      details.push(spell.details ?? grant.spell.details)
    }
    p.details = [p.details, ...details].filter(Boolean).join('\n')
    rolls.push(`Database consumable: ${content.name}`)
    item.notes = `${item.notes}\n${settings.tier} ${settings.type} Box. ${rolls.join('; ')}`.trim()
    item.tags = lootTags(settings.tier, context.floor)
    return { item: finalizeLootItem(item), checked: true, kind, index, rolls }
  } else {
    const choice = settings.mode === 'Choose' ? settings.choices[index] : undefined
    const focused = choice ? undefined : settings.focus?.category
    const categoryDie = choice || focused ? undefined : d(6, rng)
    const category = choice?.category ?? focused ?? categories[Math.floor((categoryDie! - 1) / 2)]
    rolls.push(`Item category (Table 38): ${categoryDie ?? 'chosen'} → ${category}`)
    const pool = (focused && settings.focus?.objects) || objectPools[category]
    const chosenObject = choice?.object ?? (focused ? settings.focus?.object : undefined)
    const object = chosenObject
      ? pool.find((o) => o.name === chosenObject)
      : weighted(pool, (o) => themeScore(o.tags, settings.type), rng)
    if (!object) throw new Error('Choose an object from the selected Table 38 category.')
    p.itemType = object.type
    if (object.type === 'weapon') p.weapon.type = object.slot
    else if (object.type === 'tattoos') p.tattoo.location = object.slot
    else p.equipment.slot = object.slot
    // Mundane armor can have its ordinary +1 DR without enchantment rolls.
    if (category === 'Clothing' && settings.tier === 'Bronze') p.armorDr = '1'
    const usedStats = new Set<string>(),
      usedSkills = new Set<string>(),
      usedSpells = new Set<string>(),
      usedResistances = new Set<string>(),
      usedRecovery = new Set<string>()
    const inherentNames: ItemSpell[] = []
    let unique: number | undefined
    for (let i = 0; i < tierRules[settings.tier].rolls; i++) {
      const selected = choice?.properties[i]
      if (choice && !selected) throw new Error('Choose each property result within the tier limit.')
      let roll = selected?.roll ?? d(6, rng)
      // Categories may repeat. Only reroll if every possible grant in that category
      // is already present (e.g. the sole available inherent Spell).
      // Inherent Spells always come from the database, never from Spells typed onto a sheet.
      const spellPool = eligibleSpells(context, settings.tier, 'inherent').filter((s) => s.contentLink)
      const exhausted = (result: number) =>
        (result === 5 && category !== 'Clothing' && spellPool.every((s) => usedSpells.has(s.name))) ||
        (result === 4 && category === 'Accessory' && usedRecovery.size === 2) ||
        (result === 4 &&
          category === 'Mundane / Weapon' &&
          context.skills.filter((s) => s.passive).every((s) => usedSkills.has(s.name)))
      if (!selected && exhausted(roll)) {
        for (let attempts = 0; exhausted(roll) && attempts < 30; attempts++) roll = d(6, rng)
        if (exhausted(roll)) roll = 1
      }
      if (roll < 1 || roll > 6) throw new Error('Property results must be 1–6.')
      if (choice && [1, 2, 3].includes(roll) && !selected?.target)
        throw new Error('Choose a target for each Stat, Skill or Buff result.')
      if (choice && roll === 4 && category !== 'Accessory' && !selected?.target)
        throw new Error('Choose a passive Skill or uncommon damage resistance.')
      if (choice && roll === 5 && category !== 'Clothing' && !selected?.target)
        throw new Error('Choose an inherent Spell.')
      rolls.push(
        `Table ${category === 'Clothing' ? 40 : category === 'Accessory' ? 41 : 39}: ${roll} → ${propertyLabels(category)[roll - 1]}`,
      )
      if (roll === 6) {
        unique = selected?.unique ?? (choice ? 1 : d(6, rng))
        if (unique < 1 || unique > 6) throw new Error('Unique results must be 1–6.')
        const lost = tierRules[settings.tier].rolls - i - 1
        details.push(
          `Table 42 (${unique}): ${uniqueResults[unique - 1]}. ${lost} remaining normal rolls lost; suggested Unique power ×${lost + 1}. GM: complete the mechanics${unique === 6 ? ' with player input and GM approval' : ''}.`,
        )
        rolls.push(`Table 42: ${unique}; stop, ${lost} rolls lost`)
        break
      }
      if (roll === 1) {
        const stat =
          selected?.target ||
          chooseName(
            statDefinitions.map((s) => s.code),
            usedStats,
            settings.type,
            rng,
          )
        if (!statDefinitions.some((s) => s.code === stat)) throw new Error('Choose a valid Stat.')
        const value = xValue(
          settings.tier,
          false,
          context.stats[stat] ?? 0,
          choice ? () => 0 : rng,
          settings.type === 'Boss',
          context.floor,
        )
        effect(
          statPercentTier(settings.tier) ? 'statBonusPercent' : 'statBonus',
          stat,
          settings.tier === 'Gold' && selected?.value !== undefined
            ? Math.max(3, Math.min(5, Math.floor(selected.value)))
            : value,
        )
      } else if (roll === 2 || (roll === 4 && category === 'Mundane / Weapon')) {
        const passive = roll === 4
        const names = context.skills.filter((s) => !passive || s.passive).map((s) => s.name)
        if (!names.length)
          throw new Error(
            passive
              ? 'Load passive Skills from the database before generation.'
              : 'Load or add Skills before generation.',
          )
        const skill = selected?.target || chooseName(names, usedSkills, settings.type, rng)
        if (!names.includes(skill)) throw new Error('Choose a valid Skill (a passive Skill for Table 39 result 4).')
        const max = xValue(settings.tier, true, 0, () => 0.999, true)
        const min = xValue(settings.tier, true, 0, () => 0)
        // Table 39 result 4 is a passive Skill at Rank equal to the Floor, whatever the tier.
        const value = passive
          ? Math.max(1, Math.min(15, Math.floor(context.floor) || 1))
          : selected?.value !== undefined
            ? Math.max(min, Math.min(max, Math.floor(selected.value)))
            : xValue(settings.tier, true, 0, choice ? () => 0 : rng, settings.type === 'Boss', context.floor)
        effect('skillRank', skill, value)
        const source = context.skills.find((s) => s.name === skill)
        if (source?.contentLink) p.effects[p.effects.length - 1].contentLink = structuredClone(source.contentLink)
        details.push(
          `${passive ? 'Passive Skill' : 'Skill'} ${skill}: ${passive ? `Rank ${value}` : `+${value} Rank`} while held/worn. ${source?.details ?? ''}`.trim(),
        )
      } else if (roll === 3) {
        const buffTypes = [
          'evadeModifier',
          'moveModifier',
          'stepModifier',
          'healthBonus',
          'manaBonus',
          'drModifier',
        ] as const
        const buff =
          selected?.target && buffTypes.includes(selected.target as (typeof buffTypes)[number])
            ? (selected.target as (typeof buffTypes)[number])
            : settings.type === "Survivor's"
              ? 'healthBonus'
              : pick(buffTypes, rng)
        const value =
          buff === 'moveModifier' || buff === 'stepModifier'
            ? tierIndex * 5
            : buff === 'manaBonus'
              ? manaBonus(settings.tier)
              : Math.max(1, tierIndex)
        effect(buff, '', value, buff === 'healthBonus' ? ['10'] : [])
      } else if (category === 'Clothing' && roll === 4) {
        const uncommon = damageTypes.filter((t) => !['Bludgeoning', 'Piercing', 'Slashing'].includes(t))
        const type = selected?.target || chooseName(uncommon, usedResistances, settings.type, rng)
        if (!uncommon.includes(type as (typeof uncommon)[number])) throw new Error('Choose an uncommon damage type.')
        effect('damageResistance', type, '')
      } else if (category === 'Clothing' && roll === 5) effect('drModifier', '', 1)
      else if (category === 'Accessory' && roll === 4) {
        const recovery =
          selected?.recovery ??
          (choice
            ? 'Recovery'
            : pick(
                (['Recovery', 'Restore'] as const).filter((r) => !usedRecovery.has(r)),
                rng,
              ))
        if (usedRecovery.has(recovery))
          throw new Error(
            'Recovery / Restore cannot be granted twice on one item. Choose the other Buff or another property.',
          )
        usedRecovery.add(recovery)
        details.push(
          `External Buff of ${recovery}: full ${recovery === 'Recovery' ? 'Health' : 'Mana'}, once per Floor. Activate manually; GM tracks the use.`,
        )
      } else {
        const spellName =
          selected?.target ||
          chooseName(
            spellPool.map((s) => s.name),
            usedSpells,
            settings.type,
            rng,
          )
        const spell = spellPool.find((s) => s.name === spellName)
        if (!spell) throw new Error('Choose an inherent Spell allowed by the spell-tier spreadsheet for this box.')
        if (choice && usedSpells.has(spell.name))
          throw new Error('Choose a different inherent Spell or another property.')
        usedSpells.add(spell.name)
        const rank =
          selected?.value !== undefined
            ? Math.max(
                xValue(settings.tier, true, 0, () => 0),
                Math.min(
                  xValue(settings.tier, true, 0, () => 0.999),
                  Math.floor(selected.value),
                ),
              )
            : xValue(settings.tier, true, 0, choice ? () => 0 : rng, settings.type === 'Boss', context.floor)
        // An Inherent Spell effect: fixed Rank, no Mana, cooldown about 2 hours per Rank (p. 220).
        const grantRank = String(spell.name === 'Heal' ? 1 : rank)
        const cooldown = selected?.cooldown || `${rank * 2} hours`
        effect('inherentSpell', spell.name, grantRank)
        Object.assign(p.effects[p.effects.length - 1], { cooldown, contentLink: structuredClone(spell.contentLink) })
        const record = spell.record ?? spellRecord(spell.name, { details: spell.details ?? '' })
        inherentNames.push({ id: '', spell: record, rank: grantRank, mana: '0', cooldown, usage: 'inherent' })
        details.push(
          `Inherent Spell: ${spell.name}; fixed Rank ${grantRank}; no Mana cost; cooldown ${cooldown}. ${spell.details ?? record.details}`,
        )
      }
    }
    const namingEffects = [
      ...p.effects,
      ...[...usedRecovery].map((recovery) => ({
        ...createEffectProperty(),
        type: recovery === 'Recovery' ? ('healthBonus' as const) : ('manaBonus' as const),
      })),
    ]
    item.name = lootName(object.name, settings.tier, settings.type, unique, rng, namingEffects, [
      ...(p.spells ?? []),
      ...inherentNames,
    ])
    if (settings.type === 'Boss')
      details.push(
        'Boss reward: highest value within the tier ranges; other table probabilities and property counts remain unchanged.',
      )
  }
  p.details = details.join('\n')
  item.notes = `${settings.tier} ${settings.type} Box. ${rolls.join('; ')}`
  item.tags = lootTags(settings.tier, context.floor)
  return { item: finalizeLootItem(item), checked: true, kind, index, rolls }
}
/** Every generated item records the tier and Floor it was generated for. */
export function lootTags(tier: LootTier, floor: number) {
  return [`Tier: ${tier}`, `Floor: ${Math.max(1, Math.floor(floor) || 1)}`]
}
/** A copy of the database potion, quantity 1, keeping its name and properties so it
 * stacks with copies the crawler already carries. */
function databasePotionEntry(
  context: LootContext,
  kind: DatabasePotion,
  settings: LootSettings,
  index: number,
  rolls: string[],
  notes: string[],
): LootEntry | undefined {
  const content = findDatabasePotion(context.potions ?? [], kind)
  if (!content) return undefined
  const imported = importInventoryItem(content)
  const item: InventoryItem = { ...imported, id: crypto.randomUUID(), quantity: '1' }
  item.properties = { ...imported.properties, contentLink: linkedContent(content) }
  rolls.push(`Database potion: ${content.name}`)
  item.notes = [imported.notes, `${settings.tier} ${settings.type} Box. ${[...notes, ...rolls].join('; ')}`]
    .filter(Boolean)
    .join('\n')
  item.tags = lootTags(settings.tier, context.floor)
  return {
    item: finalizeLootItem(item),
    checked: true,
    kind: kind === 'earthHobby' ? 'earth' : 'potion',
    index,
    rolls,
  }
}

export function generateLoot(settings: LootSettings, context: LootContext, rng = Math.random) {
  if (settings.type === 'Earth') return [generateLootEntry(settings, context, 'earth', 0, rng)]
  return (['item', 'consumable', 'potion'] as const).flatMap((kind) => {
    const count = settings[kind === 'item' ? 'items' : kind === 'consumable' ? 'consumables' : 'potions']
    if (!Number.isInteger(count) || count < 0 || count > 50) throw new Error('Use whole quantities from 0 to 50.')
    return Array.from({ length: count }, (_, index) => generateLootEntry(settings, context, kind, index, rng))
  })
}

/** The X Value range a tier rolls on this Floor, for the generator summaries. */
export function xValueLabel(tier: LootTier, skill: boolean, floor: number) {
  if (tier === 'Bronze') return '—'
  const low = xValue(tier, skill, 0, () => 0, false, floor)
  const high = xValue(tier, skill, 0, () => 0.999, false, floor)
  const unit = !skill && statPercentTier(tier) ? '%' : ''
  return low === high ? `+${low}${unit}` : `+${low}–${high}${unit}`
}
