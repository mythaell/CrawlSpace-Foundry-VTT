/**
 * What each race/class benefit or detriment template can link to, and what the links do.
 *
 * CrawlSpace describes most benefits in prose ("+1 to each Skill in a thematic group"). Here a benefit names its
 * skills, spells, attacks, damage types, buffs or companions as links, and the ones the rules can apply on their
 * own (rank caps, group skill bonuses, damage responses, condition immunities, advancement bonuses) go on the
 * race or class's Build effect or into the advancement check.
 */
import type { CrawlEffectProperty } from '../effects/mapping.ts'

/** A link's kind: a skill or spell item, any other item, an ActiveEffect (buff/condition), an actor, or a damage type. */
export type LinkKind = 'skill' | 'spell' | 'item' | 'effect' | 'actor' | 'damage'
export type BuildLink = { kind: LinkKind; name: string; uuid: string; ref: string }

type Mechanic =
  | 'rankCap'
  | 'allRankCaps'
  | 'skillBonus'
  | 'resistance'
  | 'immunity'
  | 'vulnerability'
  | 'advanceBonus'
  | 'advanceAdvantage'
  | 'advancePenalty'

export type LinkSpec = {
  accepts: LinkKind[]
  multiple: boolean
  mechanic?: Mechanic
  /** Links a new entry starts with. */
  preset?: BuildLink[]
}

const ALL: LinkKind[] = ['skill', 'spell', 'item', 'effect', 'actor', 'damage']
const ATTACK: LinkKind[] = ['skill', 'spell', 'item']
const one = (accepts: LinkKind[], mechanic?: Mechanic): LinkSpec => ({ accepts, multiple: false, mechanic })
const many = (accepts: LinkKind[], mechanic?: Mechanic, preset?: BuildLink[]): LinkSpec => ({ accepts, multiple: true, mechanic, preset })
const damage = (name: string): BuildLink => ({ kind: 'damage', name, uuid: '', ref: '' })

/** Benefits and detriments not listed here take no links. Entries without a template (published ones) take anything. */
const SPECS: Record<'benefits' | 'detriments', Record<string, LinkSpec>> = {
  benefits: {
    custom: many(ALL),
    skillAdvancement: one(['skill'], 'advanceBonus'),
    skillCap: one(['skill'], 'rankCap'),
    noncombatMod: one(['skill']),
    conditional: many(ALL),
    combatHealing: one(ATTACK),
    attackMod: one(ATTACK),
    advanceAdvantage: one(['skill'], 'advanceAdvantage'),
    groupAdvancement: many(['skill'], 'advanceBonus'),
    changeDamage: many([...ATTACK, 'damage']),
    gold: one(ATTACK),
    popularity: many(ATTACK),
    uncommonResistance: one(['damage'], 'resistance'),
    replaceStat: one(['skill', 'spell']),
    extraStat: many(['skill']),
    weaponTransfer: many(['skill', 'item']),
    naturalD6: one(['damage']),
    naturalD8: one(['damage']),
    pet: one(['actor']),
    petBuff: many(['effect', 'actor']),
    encounter: many(['effect', 'skill', 'spell']),
    dailyDefense: many(['effect', 'skill', 'spell']),
    partyBuff: many(['effect', 'skill', 'spell']),
    noncombatAdvantage: one(['skill', 'spell']),
    doubleDamage: many(ATTACK),
    smallGroup: many(['skill'], 'skillBonus'),
    sixSkillCap: many(['skill'], 'rankCap'),
    poisonImmunity: many(['damage', 'effect'], 'immunity', [damage('Poison')]),
    commonResistance: one(['damage'], 'resistance'),
    duration: many(['spell']),
    limitedNoncombat: many(['skill', 'spell']),
    largeGroup: many(['skill'], 'skillBonus'),
    allCaps: { accepts: [], multiple: false, mechanic: 'allRankCaps' },
    majorDefense: one(['damage'], 'immunity'),
    broadAdvantage: many(['skill', 'spell']),
    poisonDisease: many(['damage', 'effect'], 'immunity', [damage('Poison')]),
  },
  detriments: {
    custom: many(ALL),
    unfavoredSpells: many(['spell']),
    conditionalDisadvantage: many(['skill', 'spell']),
    advancePenalty: one(['skill'], 'advancePenalty'),
    uncommonVulnerability: one(['damage'], 'vulnerability'),
    halfDamage: many([...ATTACK, 'damage']),
    twoConditions: many(ALL),
    broadWeakness: many(ALL),
    floorRanks: one(['skill']),
    weaponChoice: many(['item', 'skill']),
    noWeaponMod: one(['skill']),
    spellMana: many(['spell']),
    groupDisadvantage: many(['skill', 'spell']),
    itemRestriction: many(['item', 'spell']),
    commonVulnerability: one(['damage'], 'vulnerability'),
  },
}

export function linkSpec(list: 'benefits' | 'detriments', templateId: string): LinkSpec | null {
  if (!templateId) return SPECS[list].custom
  return SPECS[list][templateId] ?? null
}

/** Is a link of this kind allowed on the entry? */
export const accepts = (spec: LinkSpec | null, kind: LinkKind) => !!spec?.accepts.includes(kind)

const names = (links: BuildLink[], kinds: LinkKind[]) => links.filter((link) => kinds.includes(link.kind) && link.name.trim()).map((link) => link.name.trim())

/** The effect properties a race or class's linked benefits and detriments grant (they join its Build effect). */
export function linkedEffects(system: Record<string, any>): CrawlEffectProperty[] {
  const effects: CrawlEffectProperty[] = []
  for (const list of ['benefits', 'detriments'] as const)
    for (const entry of system[list] ?? []) {
      const count = Math.floor(Number(entry.count ?? 1))
      if (!(count > 0)) continue
      const spec = linkSpec(list, entry.templateId ?? '')
      const links: BuildLink[] = entry.links ?? []
      switch (spec?.mechanic) {
        case 'rankCap': {
          const skills = names(links, ['skill', 'spell'])
          if (skills.length) effects.push({ type: 'rankCap', target: skills.join(', '), value: '20' })
          break
        }
        case 'allRankCaps':
          effects.push({ type: 'rankCap', target: '*', value: '20' })
          break
        case 'skillBonus':
          for (const name of names(links, ['skill'])) effects.push({ type: 'skillRank', target: name, value: String(count) })
          break
        case 'resistance':
        case 'immunity':
        case 'vulnerability': {
          const type = { resistance: 'damageResistance', immunity: 'damageImmunity', vulnerability: 'damageVulnerability' }[spec.mechanic]
          for (const name of names(links, ['damage'])) effects.push({ type, target: name })
          if (spec.mechanic === 'immunity') for (const name of names(links, ['effect'])) effects.push({ type: 'conditionImmunity', target: name })
          break
        }
      }
    }
  return effects
}

/**
 * Bonuses to a skill or spell's advancement check from an actor's races and classes: +1 per linked "advancement
 * bonus" at the end of a floor, Advantage from "Advancement Advantage", and −1 from "Advancement penalty" once the
 * rank is 5 or more.
 */
export function advancementModifiers(buildItems: any[], name: string, kind: string, rank: number) {
  const target = name.trim().toLowerCase()
  let bonus = 0
  let advantage = false
  const sources: string[] = []
  for (const item of buildItems)
    for (const list of ['benefits', 'detriments'] as const)
      for (const entry of item.system?.[list] ?? []) {
        const count = Math.floor(Number(entry.count ?? 1))
        if (!(count > 0)) continue
        const mechanic = linkSpec(list, entry.templateId ?? '')?.mechanic
        if (!mechanic?.startsWith('advance')) continue
        if (!names(entry.links ?? [], ['skill', 'spell']).some((linked) => linked.toLowerCase() === target)) continue
        if (mechanic === 'advanceBonus' && kind === 'floor') bonus += count
        else if (mechanic === 'advanceAdvantage') advantage = true
        else if (mechanic === 'advancePenalty' && rank >= 5) bonus -= count
        else continue
        sources.push(entry.name || item.name)
      }
  return { bonus, advantage, sources }
}
