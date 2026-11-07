import { applyCastEffects } from '../effects/use-conditions'
import { markForAdvancement } from '../documents/item'
import { spellKillBonus } from '../effects/killing-blows'
/**
 * Crawler attacks: rows in `system.attacks`, plus automatic rows for equipped weapons, attack skills and
 * spells, and the unarmed strike. Every row resolves to the same AttackSource that rollAttack/rollDamage use.
 */
import { itemCooldown, withCooldowns } from '../effects/cooldowns'
import { penaltyModifiers, rollAttack, rollDamage, type AttackSource, type Modifier } from '../dice/rolls'
import { resolveFormulaTokens } from '../rules/core'
import { damageBonuses, piercesArmor, type DamageKind } from '../effects/specials'
import { automaticAttackItems, joinFormula, linkedDamageEffects, usableAlone } from '../rules/damage-effects'

export type AttackRow = {
  id: string
  name: string
  img?: string
  sourceId?: string
  skillId?: string
  ammunitionId?: string
  hitBonus?: number
  damage?: string
  damageBonus?: string
  damageTypes?: string[]
  armorPiercing?: boolean
  magic?: boolean
  ranged?: boolean
  area?: boolean
  notes?: string
}

export const UNARMED_ID = 'unarmed'


export type AttackDamage = {
  formula: string
  /** Added once, not doubled on a Critical Hit: Rank dice and effect damage bonuses (undoubledDamage.ts). */
  undoubled?: string
  types: string[]; armorPiercing?: boolean; magic?: boolean; area?: boolean; baseFormula?: string; kind?: DamageKind; killingBlowSpell?: string }

/**
 * Add what the actor's effects give an attack: Damage Modifier bonuses (with their damage types) and Armor
 * Piercing (conditionEffects.ts conditionDamageBonuses / passiveDamageBonuses / damageModifierPiercesArmor).
 */
export function withEffectBonuses(actor: any, damage: AttackDamage, context: { names: string[]; itemIds: string[]; weapon: boolean; kind: DamageKind; rank?: number }): AttackDamage {
  const names = [...new Set(context.names.filter(Boolean))]
  const bonuses = damage.formula ? damageBonuses(actor, names, context.weapon, context.kind, context.rank ?? 0) : []
  const spell = context.kind === 'spell' ? actor.items.get(context.itemIds[0]) : null
  const killBonus = spell ? spellKillBonus(spell, context.rank ?? 0) : 0
  return {
    ...damage,
    killingBlowSpell: spell?.system.killingBlowStacking ? spell.uuid : undefined,
    formula: joinFormula(damage.formula, killBonus ? String(killBonus) : ''),
    undoubled: joinFormula(damage.undoubled, ...bonuses.map((bonus) => bonus.formula)),
    types: [...new Set([...damage.types, ...bonuses.flatMap((bonus) => bonus.types)])],
    armorPiercing: !!damage.armorPiercing || piercesArmor(actor, context.itemIds.filter(Boolean), names, context.weapon, context.kind),
    kind: context.kind,
  }
}

/** A skill's damage at its Rank without its Rank dice (those are added once, apart). */
const skillBase = (skill: any) => {
  const damage = skill?.system?.damage
  return damage?.atRank ? damage.baseAtRank || damage.atRank : damage?.formula
}

/** A weapon's own damage is a bonus on top of its skill's damage at the current Rank. */
export function weaponDamage(weapon: any, skill: any) {
  return joinFormula(skillBase(skill), weapon?.system?.damage?.formula)
}

/** The automatic row for an item, used until the crawler edits it into a row of their own. */
export function rowForItem(item: any): AttackRow {
  return { id: `item:${item.id}`, name: item.name, img: item.img, sourceId: item.id }
}

export function unarmedRow(): AttackRow {
  return { id: UNARMED_ID, name: game.i18n.localize('CRAWLSPACE.Attack.Unarmed'), img: 'icons/skills/melee/unarmed-punch-fist.webp', damage: '1d4', damageTypes: ['Bludgeoning'] }
}

/**
 * Saved rows, then items that attack but have no row yet, then Unarmed. A weapon is listed only while equipped,
 * unbroken and linked to a skill in its details, and then stands in for that skill (automaticAttackItems).
 */
export function attackRows(actor: any): AttackRow[] {
  // Rows you saved follow the same rules: no broken or unequipped weapons, and a weapon skill only through its weapon.
  const usable = (row: AttackRow) => {
    const source = row.sourceId ? actor.items.get(row.sourceId) : null
    if (!source) return true
    if (source.system?.broken) return false
    if (source.type === 'weapon') return !!source.system.equipped
    if (source.type === 'skill') return usableAlone(source)
    return true
  }
  const saved: AttackRow[] = (actor.system.attacks ?? []).filter(usable)
  const used = new Set((actor.system.attacks ?? []).map((row: AttackRow) => row.sourceId).filter(Boolean))
  const automatic = automaticAttackItems([...actor.items], (item: any) => item.weaponSkill())
    .filter((item: any) => !used.has(item.id))
    .sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0))
    .map(rowForItem)
  // Unarmed attacks use the Unarmed Combat skill (or any skill flagged unarmed) when the crawler has one.
  const unarmedSkill = [...actor.items].find((item: any) => item.type === 'skill' && (item.system.isUnarmed || /^unarmed( combat)?$/i.test(item.name)))
  const listed = new Set([...saved, ...automatic].map((row) => row.sourceId))
  const unarmed = saved.some((row) => row.id === UNARMED_ID || row.name === unarmedRow().name) || (unarmedSkill && listed.has(unarmedSkill.id))
    ? []
    : [unarmedSkill ? { ...unarmedRow(), damage: '', damageTypes: [], skillId: unarmedSkill.id } : unarmedRow()]
  return [...saved, ...automatic, ...unarmed]
}

export function findAttackRow(actor: any, id: string): AttackRow | null {
  return attackRows(actor).find((row) => row.id === id) ?? null
}

/**
 * The actor's damage effect skills that modify attacks made with `attackSkill`, as roll dialog options (off until
 * ticked).
 */
function damageEffectModifiers(actor: any, attackSkill: string): Modifier[] {
  const skills = [...actor.items]
    .filter((item: any) => item.type === 'skill' && item.system.damageEffect?.enabled)
    .map((item: any) => ({
      name: item.name,
      rank: Number(item.system.rank?.total) || 0,
      effect: item.system.damageEffect,
      damage: { base: skillBase(item) ?? '', dice: item.system.damage?.atRank ? (item.system.damage.rankDice ?? '') : '' },
    }))
  const t = (key: string, data: Record<string, unknown>) => game.i18n.format(`CRAWLSPACE.DamageEffect.${key}`, data)
  return linkedDamageEffects(skills, attackSkill).map((option) => {
    const parts = [
      ...(option.value ? [t('RankToHit', { rank: option.value })] : []),
      ...(option.rollMode ? [game.i18n.localize(`CRAWLSPACE.Roll.Mode.${option.rollMode}`)] : []),
      ...(option.damage || option.undoubled ? [t('Damage', { formula: joinFormula(option.damage, option.undoubled) })] : []),
    ]
    return { ...option, detail: parts.join(', ') }
  })
}

/** Turn a row into what the dice code needs: modifiers, damage, and how to pay (mana, ammunition, uses). */
export function resolveAttack(actor: any, row: AttackRow): AttackSource & { toHit: number; img: string } {
  const items = actor.items
  const source = row.sourceId ? items.get(row.sourceId) : null
  const linkedSkill = row.skillId ? items.get(row.skillId) : null
  const skill =
    linkedSkill ??
    (['weapon', 'consumable'].includes(source?.type) ? source.weaponSkill() : source && (source.type === 'skill' || source.type === 'spell') ? source : null)
  const ranged = row.ranged || (source?.type === 'weapon' && ['ranged', 'thrown'].includes(source.system.weaponType))
  const statLabel = ranged ? 'Dexterity' : 'Strength'
  const modifiers: Modifier[] = skill
    ? skill.checkModifiers()
    : [{ label: statLabel, value: actor.system.statMod?.(ranged ? 'DEX' : 'STR') ?? 0 }, ...penaltyModifiers(actor)]
  if (row.hitBonus) modifiers.push({ label: game.i18n.localize('CRAWLSPACE.Attack.HitBonus'), value: Number(row.hitBonus) })
  modifiers.push(...damageEffectModifiers(actor, skill?.name ?? ''))

  const spell = source?.type === 'spell' ? source : skill?.type === 'spell' ? skill : null
  const weapon = !source || source.type === 'weapon'
  const kind: DamageKind = source?.type === 'spell' ? 'spell' : source?.type === 'skill' ? 'skill' : undefined
  let formula = String(row.damage ?? '').trim()
  let rankDice = ''
  if (!formula && source?.type === 'consumable') formula = source.system.damage?.formula ?? ''
  if (!formula && source?.type === 'weapon') {
    formula = weaponDamage(source, skill)
    rankDice = skill?.system?.damage?.atRank ? skill.system.damage.rankDice ?? '' : ''
  }
  if (!formula && skill) {
    formula = skillBase(skill) || ''
    rankDice = skill.system.damage?.atRank ? skill.system.damage.rankDice ?? '' : ''
  }
  if (!formula && source) formula = source.system.damage?.formula ?? ''
  formula = joinFormula(formula, row.damageBonus)
  const sourceDamage = source?.system?.damage ?? skill?.system?.damage ?? {}
  const types = row.damageTypes?.length ? row.damageTypes : sourceDamage.types?.length ? sourceDamage.types : (skill?.system?.damage?.types ?? [])

  const ammunitionName = String(source?.system?.ammunition ?? '').trim().toLowerCase()
  const ammunition = row.ammunitionId
    ? items.get(row.ammunitionId)
    : ammunitionName
      ? items.find((item: any) => item.name.toLowerCase() === ammunitionName && item.id !== source?.id)
      : null
  const pay = async () => {
    if (spell && !(await spell.payMana())) return false
    if (ammunition && !(await ammunition.spendOne())) return false
    if (source?.type === 'consumable' && !(await source.spendOne())) return false
    return true
  }
  return {
    label: row.name,
    subtitle: skill && skill.name !== row.name ? skill.name : '',
    img: row.img || source?.img || 'icons/svg/sword.svg',
    modifiers,
    toHit: modifiers.filter((modifier) => modifier.enabled !== false).reduce((total, modifier) => total + (Number(modifier.value) || 0), 0),
    sources: [...(weapon ? ['Weapon'] : []), row.name, ...(source ? [source.name] : []), ...(skill ? [skill.name] : []), ...(row.id === UNARMED_ID ? ['Unarmed'] : [])],
    ranged,
    skills: skill ? [{ name: skill.name, rank: Number(skill.system?.rank?.total) || 0 }] : [],
    damage: withEffectBonuses(
      actor,
      {
        formula,
        undoubled: rankDice,
        types: [...types],
        armorPiercing: !!(row.armorPiercing || sourceDamage.armorPiercing),
        magic: !!(row.magic || sourceDamage.magic || spell),
        area: !!(row.area || sourceDamage.area),
        // Wisp Armor caps magic damage at the spell's Rank 1 base damage.
        baseFormula: spell?.system?.damage?.formula ?? '',
      },
      {
        names: [row.name, source?.name, skill?.name, ...(row.id === UNARMED_ID ? ['Unarmed'] : [])],
        itemIds: [source?.id, skill?.id],
        weapon,
        kind,
        rank: Number(skill?.system?.rank?.total) || 0,
      },
    ),
    pay,
  }
}

/** The damage formula with the attacker's numbers filled in, for display on buttons. */
export function displayFormula(actor: any, formula: string) {
  if (!formula) return ''
  const floor = Number(actor.system.details?.floor ?? actor.system.floor) || 0
  const resolved = resolveFormulaTokens(formula, { floor })
  try {
    return Roll.replaceFormulaData(resolved, actor.getRollData(), { missing: '0' }).replace(/\+\s*-/g, '-')
  } catch {
    return resolved
  }
}

export async function attackWithRow(actor: any, row: AttackRow, options: { fast?: boolean } = {}) {
  const source = actor.items.get(row.sourceId)
  if (source?.system?.broken) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.Broken', { name: source.name }))
  const skill = actor.items.get(row.skillId) ?? (['weapon', 'consumable'].includes(source?.type) ? source.weaponSkill() : null)
  const uses = [source, skill].filter((item) => item && ['skill', 'spell'].includes(item.type)).map(itemCooldown)
  return withCooldowns(actor, uses, async () => {
    const result = await rollAttack(actor, resolveAttack(actor, row), options)
    // The skill or spell behind the attack counts as rolled, for advancement.
    if (result) await markForAdvancement([source, skill])
    if (result && source?.type === 'spell') await applyCastEffects(source)
    return result
  })
}

export async function damageWithRow(actor: any, row: AttackRow, tier: 'normal' | 'amazing' | 'critical') {
  const attack = resolveAttack(actor, row)
  if (!attack.damage.formula) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.NoDamage', { name: row.name }))
  const targets = [...game.user.targets].map((token: any) => token.actor?.uuid).filter(Boolean)
  return rollDamage(actor, attack.damage, { label: attack.label, subtitle: attack.subtitle, img: attack.img, tier, targets })
}
