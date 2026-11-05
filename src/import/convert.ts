/**
 * CrawlSpace database rows and character backups → Foundry document data.
 *
 * Pure (no Foundry globals) so the Node pack builders and the in-world importer share it.
 */
import { effectPropertiesToActiveEffects, type CrawlEffectProperty } from '../effects/mapping.ts'
import { debuffByName } from '../rules/debuffs.ts'

export type ContentRow = { id: number; content_type: string; name: string; data: Record<string, any> }
export type Converted = { documentName: 'Item' | 'Actor' | 'JournalEntry' | 'ActiveEffect'; pack: string; data: Record<string, any> }

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
  const parsed = Number.parseInt(String(value ?? '').replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : fallback
}
const nullableInt = (value: unknown) => {
  const text = str(value).trim()
  if (!text) return null
  const parsed = Number.parseInt(text.replace(/[^\d-]/g, ''), 10)
  return Number.isFinite(parsed) ? parsed : null
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

export function rankedSystem(data: Record<string, any>, kind: 'skill' | 'spell'): Record<string, any> {
  const healing = data.isHealing && str(data.healingFormula)
  return {
    description: toHtml(data.details),
    notes: str(data.notes),
    stat: str(data.stat) || (kind === 'spell' ? 'INT' : 'DEX'),
    rank: { value: int(data.unenhancedRank), override: null, modOverride: null },
    checkType: str(data.checkType) || 'Unopposed',
    cooldown: str(data.cooldown),
    marked: !!data.completed,
    isAttack: !!(kind === 'skill' ? data.isAttackSkill : data.isAttackSpell),
    isUnarmed: !!data.isUnarmed,
    damage: {
      formula: str(data.damageFormula) || (healing ? '' : ''),
      types: types(data.damageTypes),
      armorPiercing: !!data.armorPiercing,
      magic: kind === 'spell',
    },
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

export function buffToEffect(data: Record<string, any>, img = ICONS.buff) {
  const properties = data.properties ?? {}
  const standard = debuffByName(data.standardDebuff ?? data.name)
  const effects = [...list(properties.effects), ...legacyBonusEffects(properties)]
  const { effects: converted } = effectPropertiesToActiveEffects(effects, { name: data.name })
  const changes = converted.flatMap((effect) => effect.system.changes)
  const shieldSlots = int(data.shield?.slots, 0)
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
      cleanup: { formula: str(data.cleanupFormula), types: types(data.cleanupDamageTypes) },
      shield: { remaining: shieldSlots, perSlot: int(data.shield?.healthPerSlot, 0), magicOnly: data.shield?.scope === 'nonMagic' ? false : false },
      durationText: str(data.duration),
    },
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
  const img = str(properties.icon) || ICONS[type]
  const base = {
    description: toHtml([properties.details, entry.notes].filter(Boolean).join('\n\n')),
    notes: '',
    quantity: Math.max(0, int(entry.quantity, 1)),
    equipped: !!entry.equipped,
    tags: types(entry.tags),
  }
  const damage = { formula: str(properties.damageFormula), types: types(properties.damageTypes), armorPiercing: !!properties.weapon?.damageModification?.armorPiercing, magic: !!properties.weapon?.magic }
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
        healing: { formula: str(properties.healingFormula), slots: true },
        manaRestore: properties.isManaRestore ? str(properties.manaRestoreAmount) : '',
      }
      break
    case 'tattoo':
      system = { ...base, equipped: true, location: str(properties.tattoo?.location) }
      break
    default:
      system = base
  }
  const effects = effectsFor(name, img, [...list(properties.effects), ...legacyBonusEffects(properties)])
  return { name, type, img, system, effects }
}

/* ------------------------------------------------------------------ */
/*  Races and classes                                                  */
/* ------------------------------------------------------------------ */

function raceClassEffects(name: string, img: string, data: Record<string, any>): CrawlEffectProperty[] {
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

const benefitList = (value: unknown) =>
  list(value).map((entry) => ({ name: str(entry.name), tier: str(entry.tier), description: str(entry.description) }))

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
      width: Math.max(1, Math.round(int(data.size, 1) / 4)) || 1,
      height: Math.max(1, Math.round(int(data.size, 1) / 4)) || 1,
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
  pet: 'lore',
  mount: 'lore',
  vehicle: 'lore',
  reference_table: 'lore',
  content_pack: 'lore',
}

export function convertRow(row: ContentRow, database: 'game' | 'homebrew'): Converted | null {
  const data = row.data ?? {}
  const name = str(row.name || data.name).trim() || 'Unnamed'
  const seed = `${database}-${row.id}`
  const _id = stableId(seed)
  const pack = PACK_FOR_TYPE[row.content_type]
  if (!pack) return null
  const source = sourceOf(row, database)
  const flags = { crawlspace: { sourceId: `${database}-${row.id}`, contentType: row.content_type } }

  switch (row.content_type) {
    case 'skill':
    case 'spell': {
      const kind = row.content_type
      const img = str(data.icon) || ICONS[kind]
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
      const extra = [data.prerequisites ? `<p><strong>Prerequisites:</strong> ${escapeHtml(str(data.prerequisites))}</p>` : '', data.classTypes ? `<p><strong>Class type:</strong> ${escapeHtml(str(data.classTypes))}</p>` : '']
      const system: Record<string, any> = {
        description: toHtml(data.description) + extra.join(''),
        notes: str(data.notes),
        source,
        drBonus: int(data.drBonus),
        benefits: benefitList(data.benefits),
        detriments: benefitList(data.detriments),
        tags: str(data.tags),
      }
      if (row.content_type === 'race') Object.assign(system, { origin: str(data.origin), size: str(data.size), sizeName: str(data.sizeName) })
      const effects = effectsFor(name, img, raceClassEffects(name, img, data))
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
        data: { _id, name, type: 'background', img: ICONS.background, system: { description: toHtml(data.description ?? data.details ?? data.notes), notes: '', source, stage }, flags },
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
          system: { description: toHtml(data.description), notes: '', source, quantity: 1, tier: str(data.tier) || 'Bronze', boxType: '', contents: str(data.loot ?? data.contents), sealed: true },
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
    add({ name: str(skill.name) || 'Skill', type: 'skill', img: ICONS.skill, system, effects: effectsFor(skill.name, ICONS.skill, list(skill.effects)) }, skill.id)
  }
  for (const spell of list(data.spells)) {
    const system: Record<string, any> = { ...rankedSystem(spell, 'spell'), mana: str(spell.mana), range: str(spell.range), duration: str(spell.duration), usage: spell.inherentGrantId ? 'inherent' : 'learned' }
    const override = data.spellEnhancedOverrides?.[spell.id]
    if (str(override)) system.rank.override = nullableInt(override)
    add({ name: str(spell.name) || 'Spell', type: 'spell', img: ICONS.spell, system, effects: [...effectsFor(spell.name, ICONS.spell, list(spell.effects)), ...useEffectConditions(spell, ICONS.spell)] }, spell.id)
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
    img: typeof data.portrait === 'string' && /^https?:|^data:/.test(data.portrait) ? data.portrait : 'icons/svg/mystery-man.svg',
    system: {
      attributes,
      health: { value: Number.isFinite(health) ? Math.max(0, Math.min(110, Math.round(health / 10) * 10)) : 110, overrides: {} },
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
    },
    prototypeToken: { actorLink: true, disposition: 1, bar1: { attribute: 'healthBar' }, bar2: { attribute: 'mana' } },
    items,
    effects,
  }
}
