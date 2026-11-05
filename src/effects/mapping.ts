/**
 * CrawlSpace EffectProperty → Foundry V14 ActiveEffect changes.
 *
 * Simple numeric bonuses become core `add` changes on system paths, so other modules and the core
 * effect sheet understand them. Effects aimed at a named skill, spell, health slot or roll use
 * registered `crawlspace.*` change types (see change-types.ts). The change `key` carries the target.
 *
 * Pure module: imported by the system bundle and by the Node pack builders.
 */
import { statKeyFromCode } from '../config.ts'

export type CrawlEffectProperty = {
  id?: string
  type: string
  target?: string
  value?: string
  slots?: string[]
  requiredRank?: string
  damageTypes?: string[]
  damageScope?: string
  armorPiercing?: boolean
  statPercent?: { percent: string; target: string; fixedValue?: string }
  [key: string]: unknown
}

export type ChangeData = { key: string; type: string; value: unknown; phase: 'initial' }

const change = (key: string, type: string, value: unknown): ChangeData => ({ key, type, value, phase: 'initial' })
const num = (value: unknown) => {
  const parsed = Number(String(value ?? '').trim())
  return Number.isFinite(parsed) ? parsed : null
}

/** Change types this system registers. */
export const CUSTOM_CHANGE_TYPES = {
  skillRank: 'crawlspace.skillRank',
  spellRank: 'crawlspace.spellRank',
  baseSkillRank: 'crawlspace.baseSkillRank',
  baseSpellRank: 'crawlspace.baseSpellRank',
  healthBonus: 'crawlspace.healthBonus',
  statPercent: 'crawlspace.statPercent',
  modLoss: 'crawlspace.modLoss',
  rollMode: 'crawlspace.rollMode',
  special: 'crawlspace.special',
} as const

/** Returns the changes for one effect property, or null when it carries no mechanics. */
export function effectPropertyToChanges(effect: CrawlEffectProperty): ChangeData[] | null {
  const target = String(effect.target ?? '').trim()
  const value = String(effect.value ?? '').trim()
  const stat = statKeyFromCode(target)
  const amount = num(value)
  switch (effect.type) {
    case 'statBonus':
      return stat && amount !== null ? [change(`system.attributes.${stat}.bonus`, 'add', amount)] : null
    case 'baseStatBonus':
      return stat && amount !== null ? [change(`system.attributes.${stat}.value`, 'add', amount)] : null
    case 'statBonusPercent': {
      const percentStat = statKeyFromCode(effect.statPercent?.target ?? target)
      const percent = num(effect.statPercent?.percent ?? value)
      return percentStat && percent !== null ? [change(percentStat, CUSTOM_CHANGE_TYPES.statPercent, percent)] : null
    }
    case 'statModifier':
      return stat && amount !== null ? [change(`system.attributes.${stat}.modBonus`, 'add', amount)] : null
    case 'statModifierLoss': {
      const lost = statKeyFromCode(value || target)
      return lost ? [change(lost, CUSTOM_CHANGE_TYPES.modLoss, true)] : null
    }
    case 'manaBonus':
      return amount !== null ? [change('system.mana.bonus', 'add', amount)] : null
    case 'drModifier':
      return amount !== null ? [change('system.dr.bonus', 'add', amount)] : null
    case 'evadeModifier':
      return amount !== null ? [change('system.evade.bonus', 'add', amount)] : null
    case 'moveModifier':
      return amount !== null ? [change('system.move.bonus', 'add', amount)] : null
    case 'stepModifier':
      return amount !== null ? [change('system.step.bonus', 'add', amount)] : null
    case 'extraActions':
      return amount !== null ? [change('system.actions.extra', 'add', amount)] : null
    case 'hotlistSlots':
      return amount !== null ? [change('system.hotlist.bonus', 'add', amount)] : null
    case 'damageResistance':
      return target ? [change('system.traits.resistances', 'add', target)] : null
    case 'damageVulnerability':
      return target ? [change('system.traits.vulnerabilities', 'add', target)] : null
    case 'damageImmunity':
      return target ? [change('system.traits.immunities', 'add', target)] : null
    case 'conditionImmunity':
      return target || value ? [change('system.traits.conditionImmunities', 'add', target || value)] : null
    case 'skillRank':
    case 'spellRank':
    case 'baseSkillRank':
    case 'baseSpellRank':
      return target && amount !== null
        ? [change(target, CUSTOM_CHANGE_TYPES[effect.type as 'skillRank'], amount)]
        : null
    case 'healthBonus': {
      const slots = (effect.slots ?? []).map(String).filter(Boolean)
      return amount !== null && slots.length ? [change(slots.join(','), CUSTOM_CHANGE_TYPES.healthBonus, amount)] : null
    }
    case 'attackMode':
    case 'checkMode':
    case 'evadeMode':
    case 'incomingAttackMode':
      return value ? [change(`${effect.type}:${target || 'All'}`, CUSTOM_CHANGE_TYPES.rollMode, value)] : null
    case 'armorPiercing':
    case 'damageBonus':
    case 'magicDamageCap':
    case 'areaDamageHalf':
    case 'manaPerRound':
    case 'regenPerRound':
    case 'rankCap':
    case 'inherentSpell':
    case 'shield':
    case 'lightOrb':
    case 'raiseMinion':
      // Kept as structured data for rolls, damage and Clean Up to read; the narrative parts stay GM rulings.
      return [
        change(
          effect.type,
          CUSTOM_CHANGE_TYPES.special,
          JSON.stringify({
            target,
            value,
            damageTypes: effect.damageTypes ?? [],
            damageScope: effect.damageScope ?? '',
            armorPiercing: !!effect.armorPiercing,
            ...(effect.cooldown ? { cooldown: String(effect.cooldown) } : {}),
            ...(effect.scope ? { scope: String(effect.scope) } : {}),
            ...(effect.interval ? { interval: String(effect.interval) } : {}),
            ...(effect.fastInterval ? { fastInterval: String(effect.fastInterval) } : {}),
            ...(effect.fastStat ? { fastStat: String(effect.fastStat) } : {}),
          }),
        ),
      ]
    default:
      return null
  }
}

/**
 * Group a list of effect properties into ActiveEffect data. Effects that share a required rank share one
 * ActiveEffect, so a skill's Rank 5/10/15 unlocks appear as separate, individually suppressed effects.
 */
export function effectPropertiesToActiveEffects(
  effects: CrawlEffectProperty[] | undefined,
  options: { name: string; img?: string; transfer?: boolean; disabled?: boolean } ,
) {
  const groups = new Map<string, ChangeData[]>()
  const unmapped: string[] = []
  for (const effect of effects ?? []) {
    if (!effect?.type) continue
    const changes = effectPropertyToChanges(effect)
    if (!changes) {
      unmapped.push(effect.type)
      continue
    }
    const rank = String(effect.requiredRank ?? '').trim()
    const key = rank && Number.isFinite(Number(rank)) ? rank : ''
    groups.set(key, [...(groups.get(key) ?? []), ...changes])
  }
  return {
    unmapped,
    effects: [...groups.entries()].map(([rank, changes]) => ({
      name: rank ? `${options.name} (Rank ${rank})` : options.name,
      img: options.img ?? 'icons/svg/aura.svg',
      type: 'base',
      transfer: options.transfer ?? true,
      disabled: options.disabled ?? false,
      system: { changes, requiredRank: rank ? Number(rank) : null },
    })),
  }
}
