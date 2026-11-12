import { normalizeGrinding } from '../rules/grinding.ts'
import { tokenSquares } from '../rules/token-size.ts'
/**
 * CrawlSpace database rows and character backups → Foundry document data.
 *
 * Pure (no Foundry globals) so the Node pack builders and the in-world importer share it.
 */
import { damageEffectFromText } from '../rules/damage-effects.ts'
import { effectPropertiesToActiveEffects, type CrawlEffectProperty } from '../effects/mapping.ts'
import { debuffByName } from '../rules/debuffs.ts'
import { raceClassGrant } from '../crawlspace-shared/shared/raceClassGrants.ts'
import { linkedEffects } from '../rules/build-links.ts'
import { durationSeconds, durationEvent } from '../rules/time.ts'
import { iconFor } from './icons.ts'

export type ContentRow = { id: number; content_type: string; name: string; data: Record<string, any> }
export type Converted = { documentName: 'Item' | 'Actor' | 'JournalEntry' | 'ActiveEffect' | 'RollTable'; pack: string; data: Record<string, any> }

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

/** Deterministic 16-character Foundry id, so re-imports update the same documents. */
export function stableId(seed: string) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let h1 = 0x811c9dc5
  let h2 = 0x01000193
  let out = ''
  for (let round = 0; out.length < 16; round++) {
    for (let i = 0; i < seed.length; i++) {
      h1 = Math.imul(h1 ^ seed.charCodeAt(i), 0x01000193) >>> 0
      h2 = Math.imul(h2 ^ (seed.charCodeAt(i) + round), 0x5bd1e995) >>> 0
    }
    out += alphabet[h1 % 62] + alphabet[h2 % 62] + alphabet[(h1 >>> 8) % 62] + alphabet[(h2 >>> 8) % 62]
  }
  return out.slice(0, 16)
}

const escapeHtml = (text: string) =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** Plain text → paragraphs. Text that already looks like HTML is kept. */
export function toHtml(text: unknown): string {
  if (text === null || text === undefined) return ''
  if (typeof text === 'object') return toHtml((text as any).html ?? (text as any).text ?? '')
  const value = String(text).trim()
  if (!value) return ''
  if (/^<\w+[\s>]/.test(value)) return value
  return value
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${escapeHtml(paragraph).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

const str = (value: unknown) => (value === null || value === undefined ? '' : String(value))
const int = (value: unknown, fallback = 0) => {
  const parsed = Number.parseFloat(String(value ?? '').replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? Math.floor(parsed) : fallback
}
const nullableInt = (value: unknown) => {
  const text = str(value).trim()
  if (!text) return null
  const parsed = Number.parseFloat(text.replace(/[^\d.-]/g, ''))
  return Number.isFinite(parsed) ? Math.floor(parsed) : null
}
const list = (value: unknown): any[] => (Array.isArray(value) ? value : [])
const types = (value: unknown) => list(value).map(String).filter(Boolean)

function sourceOf(row: ContentRow, database: string) {
  const source = row.data?.source ?? {}
  const pages = list(source.printedPages).join(', ')
  return { database, id: row.id, book: str(source.book), pages }
}

/** Old bonus arrays on buffs/items (statBonuses, skillModifiers…) → EffectProperty records. */
export function legacyBonusEffects(properties: Record<string, any> = {}): CrawlEffectProperty[] {
  const out: CrawlEffectProperty[] = []
  const push = (type: string, target: string, value: unknown, slots: string[] = []) => {
    if (str(value).trim() && (target || !['statBonus', 'skillRank', 'spellRank'].includes(type)))
      out.push({ type, target, value: str(value), slots })
  }
  for (const entry of list(properties.statBonuses)) push('statBonus', str(entry.stat), entry.value)
  for (const entry of list(properties.statModifiers)) push('statBonus', str(entry.stat), entry.value)
  for (const entry of list(properties.skillBonuses)) push('skillRank', str(entry.skill), entry.value)
  for (const entry of list(properties.skillModifiers)) push('skillRank', str(entry.skill), entry.value)
  for (const entry of list(properties.spellBonuses)) push('spellRank', str(entry.spell), entry.value)
  for (const entry of list(properties.spellModifiers)) push('spellRank', str(entry.spell), entry.value)
  for (const entry of list(properties.healthBonuses)) push('healthBonus', '', entry.value, list(entry.slots).map(String))
  for (const entry of list(properties.moveBonuses)) push('moveModifier', '', entry.value)
  for (const entry of list(properties.stepBonuses)) push('stepModifier', '', entry.value)
  for (const entry of list(properties.manaBonuses)) push('manaBonus', '', entry.value)
  push('manaBonus', '', properties.manaBonus)
  push('drModifier', '', properties.drModifier)
  push('moveModifier', '', properties.moveModifier)
  push('stepModifier', '', properties.stepModifier)
  push('evadeModifier', '', properties.evadeModifier)
  if (str(properties.healthBonus).trim()) push('healthBonus', '', properties.healthBonus, ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])
  return out
}

function effectsFor(name: string, img: string, effects: CrawlEffectProperty[], options: { transfer?: boolean; disabled?: boolean } = {}) {
  const { effects: converted } = effectPropertiesToActiveEffects(effects, { name, img, ...options })
  return converted.map((effect, index) => ({ _id: stableId(`${name}-effect-${index}-${effect.name}`), ...effect }))
}

const ICONS: Record<string, string> = {
  skill: 'icons/svg/book.svg',
  spell: 'icons/svg/lightning.svg',
  weapon: 'icons/svg/sword.svg',
  equipment: 'icons/svg/shield.svg',
  consumable: 'icons/svg/pill.svg',
  tattoo: 'icons/svg/eye.svg',
  loot: 'icons/svg/item-bag.svg',
  lootBox: 'icons/svg/chest.svg',
  ability: 'icons/svg/upgrade.svg',
  race: 'icons/svg/mystery-man.svg',
  class: 'icons/svg/combat.svg',
  background: 'icons/svg/house.svg',
  achievement: 'icons/svg/coins.svg',
  trap: 'icons/svg/trap.svg',
  mob: 'icons/svg/skull.svg',
  npc: 'icons/svg/cowled.svg',
  journal: 'icons/svg/book.svg',
  buff: 'icons/svg/aura.svg',
}

/* ------------------------------------------------------------------ */
/*  Skills and spells                                                  */
/* ------------------------------------------------------------------ */

const HEALING_KEYS = ['healingFormula', 'rank5HealingFormula', 'rank10HealingFormula', 'rank15HealingFormula'] as const

/** healing.ts isHealingSource: an explicit isHealing wins; older records heal when they have a formula. */
export function isHealingSource(data: Record<string, any>) {
  return typeof data.isHealing === 'boolean' ? data.isHealing : HEALING_KEYS.some((key) => str(data[key]).trim())
}

export function healingFields(data: Record<string, any>) {
  const heals = isHealingSource(data)
  const value = (key: (typeof HEALING_KEYS)[number]) => (heals ? str(data[key]) : '')
  return { formula: value('healingFormula'), rank5: value('rank5HealingFormula'), rank10: value('rank10HealingFormula'), rank15: value('rank15HealingFormula') }
}

/** manaRestore.ts normalizeManaRestore: the checkbox and amount, or the older `manaRestore: 'full' | '<points>'`. */
function manaRestoreAmount(properties: Record<string, any>) {
  const legacy = str(properties.manaRestore).trim()
  const legacyAmount = legacy.toLowerCase() === 'full' ? '100%' : legacy
  const restores = typeof properties.isManaRestore === 'boolean' ? properties.isManaRestore : !!legacyAmount
  if (!restores) return ''
  return str(properties.manaRestoreAmount).trim() || legacyAmount
}

/** An area template at any Rank (abilityTemplates.ts), or an explosive. */
const hasArea = (data: Record<string, any>) =>
  ['template', 'rank5Template', 'rank10Template', 'rank15Template'].some((key) => Array.isArray(data[key]?.areas) && data[key].areas.length > 0)

export function rankedSystem(data: Record<string, any>, kind: 'skill' | 'spell'): Record<string, any> {
  const textEffect = kind === 'skill' && !data.isDamageEffectSkill ? damageEffectFromText(data.details) : null
  return {
    description: toHtml(data.details),
    notes: str(data.notes),
    stat: str(data.stat) || (kind === 'spell' ? 'INT' : 'DEX'),
    rank: { value: int(data.unenhancedRank), override: null, modOverride: null },
    checkType: str(data.checkType) || 'Unopposed',
    cooldown: str(data.cooldown),
    marked: !!data.completed,
    ...(kind === 'spell' ? { killingBlowStacking: !!data.killingBlowStacking, killingBlowStacks: int(data.killingBlowStacks), killingBlowAt: data.killingBlowAt ?? null, killingBlowGameClock: data.killingBlowGameClock ?? null, killingBlowFloor: str(data.killingBlowFloor) } : {}),
    isAttack: !!(kind === 'skill' ? data.isAttackSkill : data.isAttackSpell),
    isUnarmed: !!data.isUnarmed,
    ...(kind === 'skill'
      ? {
          damageEffect: {
            // Saved settings win; published skills name what they modify in their text.
            enabled: !!data.isDamageEffectSkill || !!textEffect,
            skills: Array.isArray(data.damageEffectSkills) && data.damageEffectSkills.length ? data.damageEffectSkills.map(str).filter(Boolean) : (textEffect?.skills ?? []),
            addRank: typeof data.damageEffectAddRankToAttack === 'boolean' ? data.damageEffectAddRankToAttack : null,
            mode: ['normal', 'advantage', 'disadvantage'].includes(data.damageEffectAttackMode) ? data.damageEffectAttackMode : '',
          },
        }
      : {}),
    damage: {
      formula: str(data.damageFormula) || textEffect?.damage || '',
      types: types(data.damageTypes),
      armorPiercing: !!data.armorPiercing,
      magic: kind === 'spell',
      area: hasArea(data),
    },
    healing: healingFields(data),
    upgrades: {
      rank5: str(data.rank5),
      rank10: str(data.rank10),
      rank15: str(data.rank15),
      rank5Damage: str(data.rank5DamageFormula),
      rank10Damage: str(data.rank10DamageFormula),
      rank15Damage: str(data.rank15DamageFormula),
    },
  }
}

/** A spell's cast-time conditions (useEffects) become non-transferring effects to drag onto targets. */
function useEffectConditions(data: Record<string, any>, img: string) {
  return list(data.useEffects)
    .filter((use) => use?.buff)
    .map((use, index) => {
      const buff = use.buff
      const effect = buffToEffect(buff, img)
      return {
        _id: stableId(`${buff.name}-use-${index}`),
        ...effect,
        transfer: false,
        disabled: false,
        description: `${effect.description}${use.minRank ? `<p><em>Ranks ${use.minRank}–${use.maxRank ?? ''}</em></p>` : ''}`,
      }
    })
}

/* ------------------------------------------------------------------ */
/*  Buffs / debuffs                                                    */
/* ------------------------------------------------------------------ */

/** Native durations count game seconds in and out of combat; conditional events use core expiry. */
export function effectDuration(text: unknown): { value: number | null; units: string; expiry?: string } | null {
  const seconds = durationSeconds(text)
  if (seconds !== null && seconds > 0) return { value: seconds, units: 'seconds' }
  const expiry = durationEvent(text)
  return expiry ? { value: null, units: 'seconds', expiry } : null
}

export function buffToEffect(data: Record<string, any>, img = ICONS.buff) {
  const properties = data.properties ?? {}
  const standard = debuffByName(data.standardDebuff ?? data.name)
  const effects = [...list(properties.effects), ...legacyBonusEffects(properties)]
  const { effects: converted } = effectPropertiesToActiveEffects(effects, { name: data.name })
  const changes = converted.flatMap((effect) => effect.system.changes)
  // A condition already resolved at a Rank carries its light and raising at the buff level (conditionAtRank).
  const special = (key: string, value: Record<string, unknown>) =>
    changes.some((change: any) => change.type === 'crawlspace.special' && change.key === key) ? null : { key, type: 'crawlspace.special', value: JSON.stringify(value), phase: 'initial' }
  if (data.lightOrb) {
    const orb = data.lightOrb
    const light = special('lightOrb', { target: String(orb.brightFeet ?? ''), value: String(orb.rangeFeet ?? ''), dimFeet: String(orb.dimFeet ?? ''), ...(orb.doubleBright ? { doubled: true } : {}) })
    if (light) changes.push(light as any)
  }
  if (data.raisesMinion) {
    const raise = special('raiseMinion', { target: '', value: '' })
    if (raise) changes.push(raise as any)
  }
  // Clean Up damage and shield slots are rules (Clean Up Damage, Condition Shield).
  if (str(data.cleanupFormula)) {
    const cleanup = special('cleanup', { value: str(data.cleanupFormula), damageTypes: types(data.cleanupDamageTypes) } as any)
    if (cleanup) changes.push(cleanup as any)
  }
  if (data.shield && str(data.shield.healthPerSlot) && str(data.shield.slots)) {
    const shield = special('shield', { target: str(data.shield.healthPerSlot), value: str(data.shield.slots), scope: data.shield.scope === 'nonMagic' ? 'nonMagic' : 'all' } as any)
    if (shield) changes.push(shield as any)
  }
  return {
    name: str(data.name) || 'Condition',
    img: standard ? `systems/crawlspace/assets/debuffs/${standard.id}.png` : str(properties.icon) || img,
    type: 'base',
    description: toHtml(data.description),
    disabled: false,
    transfer: true,
    statuses: standard ? [standard.id] : [],
    system: {
      changes,
      conditionType: data.conditionType === 'debuff' || standard ? 'debuff' : 'buff',
      stacks: Math.max(1, int(data.stacks, 1)),
      maxStacks: nullableInt(data.maxStacks),
      durationText: str(data.duration),
    },
    ...(effectDuration(data.duration) ? { duration: effectDuration(data.duration) } : {}),
  }
}

/* ------------------------------------------------------------------ */
/*  Inventory                                                          */
/* ------------------------------------------------------------------ */

const SLOT_FROM_TYPE: Record<string, string> = {
  equipment_head: 'head',
  equipment_torso: 'torso',
  equipment_arms: 'arms',
  equipment_hands: 'hands',
  equipment_legs: 'legs',
  equipment_feet: 'feet',
  equipment_accessory: 'accessory',
}

/** CrawlSpace InventoryEntry → Item data (no _id). */
export function inventoryToItem(entry: Record<string, any>, contentType = '') {
  const properties = entry.properties ?? {}
  const itemType = str(properties.itemType)
  const type =
    contentType === 'weapon' || itemType === 'weapon'
      ? 'weapon'
      : SLOT_FROM_TYPE[contentType] || itemType === 'equipment'
        ? 'equipment'
        : contentType === 'consumable' || itemType === 'consumable'
          ? 'consumable'
          : contentType === 'tattoo' || itemType === 'tattoos'
            ? 'tattoo'
            : entry.lootBox
              ? 'lootBox'
              : 'loot'
  const name = str(entry.name) || 'Item'
  const base = {
    description: toHtml([properties.details, entry.notes].filter(Boolean).join('\n\n')),
    notes: '',
    quantity: Math.max(0, int(entry.quantity, 1)),
    equipped: !!entry.equipped,
    tags: types(entry.tags),
  }
  const damage = { formula: str(properties.damageFormula), types: types(properties.damageTypes), armorPiercing: !!properties.weapon?.damageModification?.armorPiercing, magic: !!properties.weapon?.magic, area: hasArea(properties) }
  let system: Record<string, any>
  switch (type) {
    case 'weapon':
      system = {
        ...base,
        weaponType: ['melee', 'ranged', 'thrown', 'ammunition'].includes(str(properties.weapon?.type)) ? properties.weapon.type : 'other',
        hands: str(properties.weapon?.hands),
        twoHanded: !!properties.weapon?.twoHanded,
        // Weapon damage lives on its skill: builder weapons name it, book weapons say "See the X Skill."
        skill: str(entry.builderCombat?.skill) || (str(properties.details).match(/See the (.+?) Skill/i)?.[1] ?? ''),
        ammunition: '',
        damage,
        armorDr: int(properties.armorDr),
      }
      break
    case 'equipment':
      system = {
        ...base,
        slot: SLOT_FROM_TYPE[contentType] || str(properties.equipment?.slot).toLowerCase() || 'torso',
        armorDr: int(properties.armorDr),
        isShield: !!properties.equipment?.isShield,
      }
      if (!['head', 'torso', 'arms', 'hands', 'legs', 'feet', 'accessory'].includes(system.slot))
        system.slot = /accessor/i.test(system.slot) ? 'accessory' : 'torso'
      break
    case 'consumable':
      system = {
        ...base,
        consumableType: str(properties.consumable?.type) || 'other',
        damage,
        healing: { formula: isHealingSource(properties) ? str(properties.healingFormula) : '', slots: true },
        manaRestore: manaRestoreAmount(properties),
      }
      break
    case 'tattoo':
      system = { ...base, equipped: true, location: str(properties.tattoo?.location) }
      break
    default:
      system = base
  }
  const img = str(properties.icon) || iconFor(type, name, system) || ICONS[type]
  // A consumable's cast-time conditions (Good Mana Refill) are applied to the user when it is used.
  const effects = [
    ...effectsFor(name, img, [...list(properties.effects), ...legacyBonusEffects(properties)]),
    ...(type === 'consumable' ? useEffectConditions(properties, img) : []),
  ]
  return { name, type, img, system, effects }
}

/* ------------------------------------------------------------------ */
/*  Races and classes                                                  */
/* ------------------------------------------------------------------ */

/** Stat, skill, spell and DR bonuses of a race or class build, as effect properties. Takes CrawlSpace data or a build item's system. */
export function raceClassEffects(data: Record<string, any>): CrawlEffectProperty[] {
  const effects: CrawlEffectProperty[] = []
  for (const [stat, value] of Object.entries(data.statBonuses ?? {}))
    if (int(value)) effects.push({ type: 'baseStatBonus', target: stat.toUpperCase(), value: String(int(value)) })
  for (const skill of list(data.skillBonuses))
    if (skill?.name && int(skill.ranks)) effects.push({ type: 'baseSkillRank', target: skill.name, value: String(int(skill.ranks)) })
  for (const spell of list(data.spellBonuses))
    if (spell?.name && int(spell.ranks)) effects.push({ type: 'baseSpellRank', target: spell.name, value: String(int(spell.ranks)) })
  if (int(data.drBonus)) effects.push({ type: 'drModifier', value: String(int(data.drBonus)) })
  return effects
}

/** A race or class's "Build" effect: the one the build tab keeps in step with its bonuses. */
export function buildEffect(name: string, img: string, data: Record<string, any>) {
  const effect = effectPropertiesToActiveEffects([...raceClassEffects(data), ...linkedEffects(data)], { name, img }).effects[0]
  return effect ? { ...effect, flags: { crawlspace: { build: true } } } : null
}

const benefitList = (value: unknown) =>
  list(value).map((entry) => ({
    templateId: str(entry.templateId),
    name: str(entry.name),
    tier: str(entry.tier),
    count: Math.max(0, int(entry.count, 1)),
    target: str(entry.target),
    description: str(entry.description),
    links: list(entry.links).filter((link) => link?.name),
  }))

const TRAINING = ['standard', 'passive', 'unusual', 'unusualPassive']
const STAT_KEYS_LOWER = ['str', 'int', 'con', 'dex', 'cha']

/** CrawlSpace's race/class build record → the build fields on a race or class item. */
export function raceClassBuild(data: Record<string, any>) {
  // Older records name grants like "Shield Crash Skill (4 Points)" or "DR Buff (6 Points)", and some put them in
  // benefits; CrawlSpace reads them through raceClassGrant (raceClassImport.ts raceClassAbilities), and so do we.
  const grants: Record<'skillBonuses' | 'spellBonuses', any[]> = { skillBonuses: [], spellBonuses: [] }
  let drBonus = int(data.drBonus)
  const addGrant = (row: any, fallback?: 'skill' | 'spell') => {
    const entry = typeof row === 'string' ? {} : (row ?? {})
    const rawName = typeof row === 'string' ? row : str(entry.name ?? entry.skill ?? entry.spell ?? entry.text)
    const parsed = raceClassGrant(rawName, entry.ranks ?? entry.rank ?? entry.value ?? entry.bonus, entry.points, fallback, String(entry.training).startsWith('unusual'))
    if (!parsed) return
    if (parsed.kind === 'dr') {
      if (!drBonus) drBonus = parsed.amount
      return
    }
    const target = parsed.kind === 'skill' ? 'skillBonuses' : 'spellBonuses'
    const allowed = target === 'skillBonuses' ? TRAINING : ['standard', 'passive']
    for (const name of parsed.names)
      if (!grants[target].some((existing) => existing.name.toLowerCase() === name.toLowerCase()))
        grants[target].push({
          name,
          ref: parsed.names.length === 1 ? str(entry.ref) : '',
          uuid: '',
          ranks: Math.max(0, Math.floor(parsed.amount)),
          training: allowed.includes(entry.training) ? entry.training : 'standard',
          notes: str(entry.notes),
        })
  }
  for (const key of ['skillBonuses', 'spellBonuses'] as const) for (const row of list(data[key])) addGrant(row, key === 'skillBonuses' ? 'skill' : 'spell')
  for (const row of list(data.benefits)) if (!(row?.properties?.effects?.length || row?.effects?.length)) addGrant(row)
  return {
    statBonuses: Object.fromEntries(STAT_KEYS_LOWER.map((stat) => [stat, int(data.statBonuses?.[stat])])),
    drBonus,
    skillBonuses: grants.skillBonuses,
    spellBonuses: grants.spellBonuses,
    benefits: benefitList(data.benefits),
    detriments: benefitList(data.detriments),
    skillDetriments: list(data.skillDetriments).map((entry) => ({
      name: str(entry.name),
      ref: str(entry.ref),
      uuid: '',
      currentRank: nullableInt(entry.currentRank),
      penalty: Math.max(0, int(entry.penalty)),
      notes: str(entry.notes),
    })),
    statSkillDetriments: list(data.statSkillDetriments)
      .filter((entry) => STAT_KEYS_LOWER.includes(entry?.stat))
      .map((entry) => ({ stat: entry.stat, penalty: Math.max(0, int(entry.penalty, 1)), notes: str(entry.notes) })),
    tags: str(data.tags),
  }
}

/* ------------------------------------------------------------------ */
/*  Mobs and NPCs                                                      */
/* ------------------------------------------------------------------ */

export function mobToActor(name: string, data: Record<string, any>, idSeed: string) {
  const stats = data.stats ?? {}
  const published = data.publishedStats ?? {}
  const modOverrides = data.publishedStatModifiers ?? {}
  const attributes = Object.fromEntries(
    ['str', 'int', 'con', 'dex', 'cha'].map((key) => {
      const value = nullableInt(stats[key])
      return [key, { value, override: null, modOverride: value === null ? nullableInt(modOverrides[key]) : null }]
    }),
  )
  const traits = {
    resistances: list(data.damageResponses).filter((r) => r.response === 'Resistance').map((r) => str(r.damageType)),
    vulnerabilities: list(data.damageResponses).filter((r) => r.response === 'Vulnerability').map((r) => str(r.damageType)),
    immunities: list(data.damageResponses).filter((r) => r.response === 'Immunity').map((r) => str(r.damageType)),
    conditionImmunities: [],
  }
  const attacks = list(data.attacks).map((attack, index) => ({
    id: stableId(`${idSeed}-attack-${index}-${attack.name}`),
    name: str(attack.name) || 'Attack',
    stat: str(attack.stat) || 'STR',
    damage: str(attack.damage),
    damageTypes: str(attack.damageType)
      .split(/[,/]| and /)
      .map((type) => type.trim())
      .filter(Boolean),
    range: str(attack.range),
    publishedToHit: str(attack.publishedToHit),
    aoeType: str(attack.aoeType),
    areaFeet: str(attack.areaFeet),
    armorPiercing: /armor-?\s?piercing/i.test(`${attack.notes} ${attack.sourceAttack}`),
    magic: !!attack.magic,
    ranged: !!str(attack.range) && Number(int(attack.range)) > 10,
    failedDebuff: attack.failedDebuff === 'Custom' ? str(attack.customDebuff) : str(attack.failedDebuff),
    notes: str(attack.notes),
  }))
  const kind = data.kind === 'boss' ? 'boss' : 'mob'
  const bossTier = ['Neighborhood', 'Borough', 'City', 'Province', 'Country', 'Floor'].includes(data.bossTier) ? data.bossTier : 'Neighborhood'
  return {
    name,
    type: 'mob',
    img: ICONS.mob,
    system: {
      kind,
      bossTier,
      level: int(stats.level ?? published.level, 1),
      floor: int(data.currentFloor ?? data.homeFloor, 1),
      size: str(data.size),
      type: str(data.creatureType === 'Custom' ? data.customType : data.creatureType),
      tags: str(data.tags),
      attributes,
      dr: { armor: int(stats.dr ?? published.dr) },
      evade: { published: str(published.evade) || (stats.evade !== undefined && stats.evade !== '' ? str(stats.evade) : '') },
      move: { value: int(stats.move ?? published.move, 20) },
      surprise: str(published.surprise) || (stats.surprise !== undefined && stats.surprise !== '' ? str(stats.surprise) : ''),
      healthSlotsOverride: data.publishedHealth?.slotCount ? int(data.publishedHealth.slotCount) : nullableInt(data.healthSlots),
      healthPerSlotOverride: data.publishedHealth?.slotValues?.length ? int(data.publishedHealth.slotValues[0]) : null,
      abilities: list(data.abilities).map((ability) => ({ name: str(ability.name), description: str(ability.description) })),
      slotsLost: 0,
      attacks,
      traits,
      description: toHtml(data.flavor),
      notes: toHtml(data.notes),
    },
    prototypeToken: {
      actorLink: false,
      disposition: -1,
      bar1: { attribute: 'healthBar' },
      width: tokenSquares(data.size) ?? 1,
      height: tokenSquares(data.size) ?? 1,
    },
  }
}

/* ------------------------------------------------------------------ */
/*  Journals                                                           */
/* ------------------------------------------------------------------ */

function entryList(label: string, entries: unknown) {
  const rows = list(entries)
    .map((entry) => (typeof entry === 'string' ? entry : [entry?.name, entry?.title, entry?.description ?? entry?.text ?? entry?.notes].filter(Boolean).join(' — ')))
    .filter(Boolean)
  return rows.length ? `<h3>${escapeHtml(label)}</h3><ul>${rows.map((row) => `<li>${escapeHtml(row)}</li>`).join('')}</ul>` : ''
}

export function journalFrom(name: string, contentType: string, data: Record<string, any>) {
  const parts = [
    data.summary ? `<h2>Summary</h2>${toHtml(data.summary)}` : '',
    data.overview ? `<h2>Overview</h2>${toHtml(data.overview)}` : '',
    data.description ? toHtml(data.description) : '',
    data.floor ? `<p><strong>Floor:</strong> ${escapeHtml(str(data.floor))}</p>` : '',
    data.environment ? `<h3>Environment</h3>${toHtml(data.environment)}` : '',
    entryList('Quest Stages', data.questStages),
    entryList('Quarters', data.quarters),
    entryList('Strong Starts', data.strongStartEntries ?? data.strongStarts),
    entryList('Story Arcs', data.storyArcEntries ?? data.storyArcs),
    entryList('Mobs', data.mobs),
    entryList('Bosses', data.bosses),
    entryList('NPCs', data.npcEntries),
    entryList('Traps', data.trapEntries),
    entryList('Items', data.itemEntries),
    entryList('Quest Items', data.questItemEntries),
    entryList('Rewards', data.rewardEntries),
    entryList('Achievements', data.achievementEntries),
    entryList('Grinding Events', data.grindingEvents),
    entryList('Grinding Complications', data.grindingComplications),
    data.bossBattle ? `<h3>Boss Battle</h3>${toHtml(data.bossBattle)}` : '',
    data.grindingNotes ? `<h3>Grinding Notes</h3>${toHtml(data.grindingNotes)}` : '',
    data.notes ? `<h3>Notes</h3>${toHtml(data.notes)}` : '',
  ].filter(Boolean)
  return {
    name,
    pages: [
      {
        _id: stableId(`${contentType}-${name}-page`),
        name,
        type: 'text',
        text: { content: parts.join('') || '<p></p>', format: 1 },
      },
    ],
  }
}


/** A pet, mount or vehicle record (CompanionFields.tsx) → companion Actor data. Free-text attacks become abilities. */
export function companionToActor(name: string, data: Record<string, any>, kind: 'pet' | 'mount' | 'vehicle') {
  const base = mobToActor(name, data, `${kind}-${name}`)
  const stats = data.stats ?? {}
  const abilities = [
    ...['attack1', 'attack2'].filter((key) => str(data[key]).trim()).map((key) => ({ name: 'Attack', description: str(data[key]) })),
    ...(str(data.special).trim() ? [{ name: 'Special', description: str(data.special) }] : []),
  ]
  return {
    ...base,
    type: 'companion',
    img: str(data.portrait) || ICONS.mob,
    system: {
      ...base.system,
      kind,
      size: str(data.size) || '4',
      evade: { published: str(stats.evade) },
      healthSlotsOverride: null,
      healthPerSlotOverride: null,
      abilities: [...base.system.abilities, ...abilities],
      description: toHtml(data.description ?? data.flavor),
      master: '',
      companion: { occupants: str(data.occupants), accessories: toHtml(data.accessories) },
    },
    prototypeToken: { ...base.prototypeToken, actorLink: true, disposition: 1 },
  }
}

/* ------------------------------------------------------------------ */
/*  Reference tables                                                   */
/* ------------------------------------------------------------------ */

/** A reference table's columns, rows and notes as HTML (ReferenceTableCard.tsx). */
export function referenceTableHtml(data: Record<string, any>) {
  const columns = list(data.columns).map(str)
  const rows = list(data.rows).map((row) => list(row).map(str))
  const head = columns.length ? `<thead><tr>${columns.map((column) => `<th>${escapeHtml(column)}</th>`).join('')}</tr></thead>` : ''
  const body = `<tbody>${rows.map((row) => `<tr>${row.map((cell) => `<td>${escapeHtml(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`
  const notes = list(data.notes).map(str).filter(Boolean)
  return [
    data.description ? `<p>${escapeHtml(str(data.description))}</p>` : '',
    rows.length ? `<table class="crawl-reference-table">${head}${body}</table>` : '',
    notes.length ? `<ul>${notes.map((note) => `<li>${escapeHtml(note)}</li>`).join('')}</ul>` : '',
    data.source ? `<p><em>${escapeHtml(str(data.source))}</em></p>` : '',
  ].join('')
}

/** "3", "4-6", "19+": the die range a row covers (gmEncounter.ts tableRowMatches), or null. */
export function rowRange(cell: unknown, top: number): [number, number] | null {
  const match = str(cell).trim().match(/^(\d+)(?:\s*[-–—‑]\s*(\d+)|(\+))?$/)
  if (!match) return null
  const low = Number(match[1])
  return [low, match[3] ? Math.max(low, top) : Number(match[2] ?? match[1])]
}

/** A rollable reference table → RollTable data: the first column is the die range, the rest the result text. */
export function referenceRollTable(name: string, data: Record<string, any>, seed: string) {
  const formula = str(data.rollFormula)
  // The highest total, so an open "19+" row ends there.
  const dice = formula.match(/^\s*(\d*)d(\d+)/i)
  const top = dice ? (Number(dice[1]) || 1) * Number(dice[2]) : 0
  const columns = list(data.columns).map(str)
  const results = list(data.rows)
    .map((row, index) => {
      const range = rowRange(list(row)[0], top)
      if (!range) return null
      const cells = list(row).slice(1).map(str)
      const description = cells.length > 1 ? cells.map((cell, column) => `<strong>${escapeHtml(columns[column + 1] ?? '')}</strong> ${escapeHtml(cell)}`).join('<br>') : escapeHtml(cells[0] ?? '')
      return { _id: stableId(`${seed}-result-${index}`), type: 'text', name: cells[0] ?? '', description, range, weight: range[1] - range[0] + 1, drawn: false, img: 'icons/svg/d20-black.svg' }
    })
    .filter(Boolean)
  return {
    name,
    img: 'icons/svg/d20-grey.svg',
    description: referenceTableHtml({ description: data.description, notes: data.notes, source: data.source }),
    formula,
    replacement: true,
    displayRoll: true,
    results,
  }
}
/* ------------------------------------------------------------------ */
/*  Database row dispatcher                                            */
/* ------------------------------------------------------------------ */

/** Pack each content type lands in. */
export const PACK_FOR_TYPE: Record<string, string> = {
  skill: 'skills',
  spell: 'spells',
  weapon: 'items',
  consumable: 'items',
  tattoo: 'items',
  other: 'items',
  equipment_head: 'items',
  equipment_torso: 'items',
  equipment_arms: 'items',
  equipment_hands: 'items',
  equipment_legs: 'items',
  equipment_feet: 'items',
  equipment_accessory: 'items',
  buff: 'conditions',
  race: 'races-classes',
  class: 'races-classes',
  background_childhood: 'backgrounds',
  background_adolescence: 'backgrounds',
  background_career: 'backgrounds',
  background_hobby: 'backgrounds',
  achievement: 'achievements',
  loot_box: 'loot-boxes',
  trap: 'traps',
  mob: 'mobs',
  npc: 'npcs',
  quest: 'adventures',
  neighborhood: 'adventures',
  deity: 'lore',
  sponsor: 'lore',
  tunnel_show: 'lore',
  location: 'lore',
  pet: 'companions',
  mount: 'companions',
  vehicle: 'companions',
  reference_table: 'reference',
  content_pack: 'lore',
}

/** A GM's prepared database box (preparedLootBoxes.ts PreparedLoot), kept as it is for awarding. */
function preparedLoot(value: any) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.items)) return null
  return { tier: str(value.tier) || 'Bronze', type: str(value.type) || 'Custom', floor: int(value.floor, 1), gold: Math.max(0, int(value.gold)), items: value.items }
}

/** Content the loot generator and character builder read as CrawlSpace records (lootContext.ts, characterBuilder.ts). */
const SOURCE_DATA_TYPES = new Set([
  'background_childhood',
  'background_adolescence',
  'background_career',
  'background_hobby',
  'skill',
  'spell',
  'achievement',
  'loot_box',
  'weapon',
  'consumable',
  'tattoo',
  'other',
  'equipment_head',
  'equipment_torso',
  'equipment_arms',
  'equipment_hands',
  'equipment_legs',
  'equipment_feet',
  'equipment_accessory',
])

export function convertRow(row: ContentRow, database: 'game' | 'homebrew'): Converted | null {
  const data = row.data ?? {}
  const name = str(row.name || data.name).trim() || 'Unnamed'
  const seed = `${database}-${row.id}`
  const _id = stableId(seed)
  const pack = PACK_FOR_TYPE[row.content_type]
  if (!pack) return null
  const source = sourceOf(row, database)
  const flags: Record<string, any> = { crawlspace: { sourceId: `${database}-${row.id}`, contentType: row.content_type } }
  // The loot generator, awards and character builder read the original CrawlSpace record, as the app reads its database.
  if (SOURCE_DATA_TYPES.has(row.content_type)) flags.crawlspace.data = data

  switch (row.content_type) {
    case 'skill':
    case 'spell': {
      const kind = row.content_type
      const img = str(data.icon) || iconFor(kind, name) || ICONS[kind]
      const system: Record<string, any> = { ...rankedSystem(data, kind), source }
      if (kind === 'spell') Object.assign(system, { mana: str(data.mana), range: str(data.range), duration: str(data.duration), usage: 'learned' })
      const effects = [...effectsFor(name, img, list(data.effects)), ...(kind === 'spell' ? useEffectConditions(data, img) : [])]
      return { documentName: 'Item', pack, data: { _id, name, type: kind, img, system, effects, flags } }
    }
    case 'buff': {
      const effect = buffToEffect({ ...data, name })
      return { documentName: 'ActiveEffect', pack, data: { _id, ...effect, flags } }
    }
    case 'race':
    case 'class': {
      const img = ICONS[row.content_type]
      const system: Record<string, any> = { description: toHtml(data.description), notes: str(data.notes), source, ...raceClassBuild(data) }
      if (row.content_type === 'race')
        Object.assign(system, { origin: str(data.origin), size: str(data.size), sizeName: str(data.sizeName), hobbySkill: str(data.hobbySkill), popularity: str(data.popularity) })
      else Object.assign(system, { earthClass: !!data.earthClass, classTypes: str(data.classTypes), prerequisites: str(data.prerequisites) })
      const effect = buildEffect(name, img, system)
      const effects = effect ? [{ _id: stableId(`${name}-effect-0-${effect.name}`), ...effect }] : []
      return { documentName: 'Item', pack, data: { _id, name, type: row.content_type, img, system, effects, flags } }
    }
    case 'background_childhood':
    case 'background_adolescence':
    case 'background_career':
    case 'background_hobby': {
      const stage = row.content_type.replace('background_', '')
      return {
        documentName: 'Item',
        pack,
        data: { _id, name, type: 'background', img: ICONS.background, system: { description: toHtml(data.description ?? data.details ?? data.notes), notes: '', source, stage, species: data.species === 'animal' ? 'animal' : 'human', skills: list(data.skills).map(str).slice(0, 3) }, flags },
      }
    }
    case 'achievement':
      return {
        documentName: 'Item',
        pack,
        data: { _id, name, type: 'achievement', img: ICONS.achievement, system: { description: toHtml(data.description), notes: '', source, reward: str(data.reward), contents: str(data.contents) }, flags },
      }
    case 'loot_box':
      return {
        documentName: 'Item',
        pack,
        data: {
          _id,
          name,
          type: 'lootBox',
          img: ICONS.lootBox,
          system: { description: toHtml(data.description), notes: '', source, quantity: 1, tier: str(data.prepared?.tier ?? data.tier) || 'Bronze', boxType: str(data.prepared?.type), contents: str(data.loot ?? data.contents), sealed: true, loot: preparedLoot(data.prepared) },
          flags,
        },
      }
    case 'trap':
      return {
        documentName: 'Item',
        pack,
        data: {
          _id,
          name,
          type: 'trap',
          img: ICONS.trap,
          system: { description: toHtml(data.notes), notes: '', source, trapType: str(data.type), damage: { formula: str(data.damage), types: [], armorPiercing: false, magic: false } },
          flags,
        },
      }
    case 'mob':
      return { documentName: 'Actor', pack, data: { _id, ...mobToActor(name, data, seed), flags } }
    case 'pet':
    case 'mount':
    case 'vehicle':
      return { documentName: 'Actor', pack, data: { _id, ...companionToActor(name, data, row.content_type), flags } }
    case 'reference_table':
      // A table with dice rolls in Foundry's RollTable; the rest read as a journal page.
      if (str(data.rollFormula).trim()) return { documentName: 'RollTable', pack: 'reference-tables', data: { _id, ...referenceRollTable(name, data, seed), flags } }
      return {
        documentName: 'JournalEntry',
        pack,
        data: { _id, name, pages: [{ _id: stableId(`${seed}-page`), name, type: 'text', text: { content: referenceTableHtml(data) || '<p></p>', format: 1 } }], flags },
      }
    case 'npc':
      return {
        documentName: 'Actor',
        pack,
        data: {
          _id,
          name,
          type: 'npc',
          img: ICONS.npc,
          system: {
            job: str(data.job),
            race: '',
            floor: 1,
            description: toHtml(data.notes),
            notes: data.relation ? `<p><strong>Relation:</strong> ${escapeHtml(str(data.relation))}</p>` : '',
            // Resolved to a compendium UUID by the pack builder once both packs exist.
            statBlock: data.mobRef ? `@mobRef:${data.mobRef}` : '',
          },
          prototypeToken: { actorLink: false, disposition: 0 },
          flags,
        },
      }
    case 'weapon':
    case 'consumable':
    case 'tattoo':
    case 'other':
    case 'equipment_head':
    case 'equipment_torso':
    case 'equipment_arms':
    case 'equipment_hands':
    case 'equipment_legs':
    case 'equipment_feet':
    case 'equipment_accessory': {
      const item = inventoryToItem({ ...data, name }, row.content_type)
      return { documentName: 'Item', pack, data: { _id, ...item, system: { ...item.system, source }, flags } }
    }
    default:
      return { documentName: 'JournalEntry', pack, data: { _id, ...journalFrom(name, row.content_type, data), flags } }
  }
}

/* ------------------------------------------------------------------ */
/*  Character backups                                                  */
/* ------------------------------------------------------------------ */

/** A portrait Foundry can show: a web or data URL, or a path in Foundry's data (an imported image). App-only links and unresolved export references can't. */
export function portraitPath(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'icons/svg/mystery-man.svg'
  if (/^https?:|^data:image\//.test(value)) return value
  if (/^(crawlspace-image:|\/api\/|\/)/.test(value) || /\s/.test(value)) return 'icons/svg/mystery-man.svg'
  return value
}

/** A CrawlSpace character JSON export → crawler Actor data with embedded items and effects. */
export function characterToActor(input: Record<string, any>) {
  const data = input.data ?? input
  const character = data.character ?? {}
  const name = str(character.name || input.name) || 'Crawler'
  const attributes = Object.fromEntries(
    ['str', 'int', 'con', 'dex', 'cha'].map((key, index) => {
      const saved = list(data.attributeValues)[index] ?? {}
      return [
        key,
        {
          value: nullableInt(saved.unenhanced),
          override: nullableInt(data.attributeOverrides?.[index]),
          modOverride: nullableInt(data.attributeModOverrides?.[index]),
        },
      ]
    }),
  )
  const items: any[] = []
  // CrawlSpace row id → Foundry item id, so attacks and actions keep pointing at the right item.
  const idMap = new Map<string, string>()
  const add = (item: any, appId?: unknown) => {
    const _id = stableId(`${name}-${items.length}-${item.name}`)
    if (appId !== undefined && appId !== null && appId !== '') idMap.set(String(appId), _id)
    items.push({ _id, ...item })
  }
  const mapped = (appId: unknown) => (appId ? (idMap.get(String(appId)) ?? '') : '')

  for (const skill of list(data.skills)) {
    const system = rankedSystem(skill, 'skill')
    const override = data.skillEnhancedOverrides?.[skill.id]
    if (str(override)) system.rank.override = nullableInt(override)
    const img = str(skill.icon) || iconFor('skill', str(skill.name)) || ICONS.skill
    add({ name: str(skill.name) || 'Skill', type: 'skill', img, system, effects: effectsFor(skill.name, img, list(skill.effects)) }, skill.id)
  }
  for (const spell of list(data.spells)) {
    const system: Record<string, any> = { ...rankedSystem(spell, 'spell'), mana: str(spell.mana), range: str(spell.range), duration: str(spell.duration), usage: spell.inherentGrantId ? 'inherent' : 'learned' }
    const override = data.spellEnhancedOverrides?.[spell.id]
    if (str(override)) system.rank.override = nullableInt(override)
    const img = str(spell.icon) || iconFor('spell', str(spell.name)) || ICONS.spell
    add({ name: str(spell.name) || 'Spell', type: 'spell', img, system, effects: [...effectsFor(spell.name, img, list(spell.effects)), ...useEffectConditions(spell, img)] }, spell.id)
  }
  for (const entry of list(data.inventory)) add(inventoryToItem(entry), entry.id)
  for (const box of list(data.lootBoxes))
    add({ name: str(box.name) || 'Loot Box', type: 'lootBox', img: ICONS.lootBox, system: { description: toHtml(box.description), tier: str(box.tier) || 'Bronze', quantity: 1, sealed: true, contents: '' } })
  const abilityGroups: [string, string][] = [
    ['racialAbilities', 'racial'],
    ['classAbilities', 'class'],
    ['otherAbilities', 'other'],
  ]
  for (const [key, category] of abilityGroups)
    for (const ability of list(data[key])) {
      const abilityName = str(ability.value || ability.name) || 'Ability'
      const properties = ability.properties ?? {}
      add({
        name: abilityName,
        type: 'ability',
        img: ICONS.ability,
        system: { description: toHtml(properties.description ?? properties.details ?? ''), notes: '', category },
        effects: effectsFor(abilityName, ICONS.ability, [...list(properties.effects), ...legacyBonusEffects(properties)]),
      })
    }
  for (const achievement of list(data.achievements))
    add({ name: str(achievement.name || achievement.value) || 'Achievement', type: 'achievement', img: ICONS.achievement, system: { description: toHtml(achievement.description ?? achievement.details ?? ''), reward: str(achievement.reward) } })
  // Backgrounds by stage (characterBuilder.ts writes `background.childhood` etc. as names).
  for (const stage of ['childhood', 'adolescence', 'career', 'hobby'])
    if (str(data.background?.[stage]).trim())
      add({ name: str(data.background[stage]).trim(), type: 'background', img: ICONS.background, system: { description: '', notes: '', stage } })

  // Conditions: internal/external buffs and custom debuffs keep their active state; standard debuffs become statuses.
  const effects: any[] = []
  for (const buff of [...list(data.internalBuffs), ...list(data.externalBuffs), ...list(data.customDebuffs)]) {
    const effect = buffToEffect(buff)
    effects.push({ _id: stableId(`${name}-buff-${effects.length}-${effect.name}`), ...effect, disabled: !buff.active })
  }
  for (const [debuffName, value] of Object.entries(data.activeDebuffs ?? {})) {
    const stacks = typeof value === 'number' ? value : value ? 1 : 0
    const definition = debuffByName(debuffName)
    if (!stacks || !definition) continue
    effects.push({
      _id: stableId(`${name}-debuff-${definition.id}`),
      name: definition.name,
      img: `systems/crawlspace/assets/debuffs/${definition.id}.png`,
      type: 'base',
      statuses: [definition.id],
      description: `<p>${escapeHtml(definition.effect)}</p>`,
      system: { changes: [], conditionType: 'debuff', stacks, cleanup: definition.cleanup ?? { formula: '', types: [] }, durationText: definition.duration },
    })
  }

  // Attacks table rows and Actions (CrawlSpace has no interrupt actions; they import as actions).
  const attacks = list(data.attacks)
    .filter((attack) => str(attack.name) || attack.sourceId)
    .map((attack, index) => ({
      id: stableId(`${name}-attack-${index}-${attack.id}`),
      name: str(attack.name) || 'Attack',
      sourceId: mapped(attack.sourceId),
      skillId: mapped(attack.linkedSkillId),
      ammunitionId: mapped(attack.ammunitionId),
      hitBonus: int(attack.hitMod),
      damage: str(attack.damageDice),
      damageBonus: str(attack.damageMod),
      notes: toHtml(attack.effects),
    }))
  const sheetActions = list(data.actions)
    .filter((action) => str(action.name))
    .map((action, index) => ({
      id: stableId(`${name}-action-${index}-${action.id}`),
      kind: 'action',
      name: str(action.name),
      sourceId: mapped(action.linkedItemId || action.sourceId),
      skillId: mapped(action.linkedSkillId),
      formula: str(action.formula),
      notes: toHtml([action.notes, action.effects].map(str).filter(Boolean).join('\n\n')),
    }))

  const health = Number(data.currentHealth)
  return {
    name,
    type: 'crawler',
    img: portraitPath(data.portrait),
    system: {
      attributes,
      health: { value: Number.isFinite(health) ? Math.max(0, Math.min(110, Math.floor(health / 10) * 10)) : 110, overrides: {} },
      shield: { slots: list(data.shieldSlotStates).map(Boolean) },
      mana: { value: int(character.currentMana), override: nullableInt(data.maxManaOverride) },
      dr: { armor: int(character.armor), buff: int(character.drBuffs), override: nullableInt(data.drOverride) },
      evade: { buff: int(character.evadeBuffs), override: nullableInt(data.evadeOverride) },
      details: {
        level: int(character.level, 1),
        floor: int(character.floor, 1),
        crawlerNumber: str(character.crawlerNumber),
        gender: str(character.gender),
        size: str(character.size),
        race: str(character.race),
        className: str(character.className),
        deity: str(data.deity),
        sponsors: list(data.sponsors).map(str),
        aiFavor: int(character.aiFavor),
        popularity: int(data.sideInfo?.popularity),
        gold: int(character.gold),
      },
      journal: {
        pastTrauma: toHtml(data.sideInfo?.pastTrauma),
        looseEnds: toHtml(data.sideInfo?.looseEnds),
        regrets: toHtml(data.sideInfo?.regrets),
      },
      notes: toHtml(data.sideInfo?.notes),
      importantKills: list(data.importantKills).map((kill) => str(kill.value)).filter(Boolean),
      amenities: list(data.amenities).map((entry) => str(entry.value)).filter(Boolean),
      clubs: list(data.clubs).map((entry) => str(entry.value)).filter(Boolean),
      attacks,
      sheetActions,
      personalSpace: { tier: str(data.personalSpace?.tier), size: str(data.personalSpace?.size) },
      upkeep: { allocatedThroughLevel: int(data.upkeep?.allocatedThroughLevel, 1), lastSafeRoomLevel: int(data.upkeep?.lastSafeRoomLevel, 0), pendingStatPoints: 0 },
      // CrawlSpace pins by name; Foundry by item id.
      hotlist: { items: [...new Set(list(data.hotlist).map((pinned) => items.find((item) => item.name === str(pinned))?._id).filter(Boolean))] },
    },
    flags: { crawlspace: { grinding: normalizeGrinding({
      ...data.upkeep?.grinding,
      skillHours: Object.fromEntries(Object.entries(data.upkeep?.grinding?.skillHours ?? {}).flatMap(([id, value]) => mapped(id.replace(/^spell:/, '')) ? [[mapped(id.replace(/^spell:/, '')), Number(value)]] : [])),
      attempted: Object.fromEntries(Object.entries(data.upkeep?.grinding?.attempted ?? {}).flatMap(([id, value]) => mapped(id.replace(/^spell:/, '')) ? [[mapped(id.replace(/^spell:/, '')), Number(value)]] : [])),
    }) } },
    prototypeToken: { actorLink: true, disposition: 1, bar1: { attribute: 'healthBar' }, bar2: { attribute: 'mana' } },
    items,
    effects,
  }
}
