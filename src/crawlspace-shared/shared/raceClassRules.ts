import { adventureEntries } from './adventureModels'

export type RaceClassKind = 'races' | 'classes'
export const buildStats = ['str', 'int', 'con', 'dex', 'cha'] as const
export const benefitTiers = [
  { value: 'free', label: 'Free (0)', cost: 0 },
  { value: 'minor', label: 'Minor (1)', cost: 1 },
  { value: 'moderate', label: 'Moderate (2)', cost: 2 },
  { value: 'major', label: 'Major (3)', cost: 3 },
  { value: 'extreme', label: 'Extreme (4)', cost: 4 },
  { value: 'epic', label: 'Epic (6)', cost: 6 },
] as const
export const detrimentTiers = benefitTiers.filter((tier) => ['minor', 'moderate', 'major'].includes(tier.value))

type BuildTemplate = { id: string; name: string; tier: string; description: string; unique?: boolean }
const template = (id: string, name: string, tier: string, description: string, unique = false): BuildTemplate => ({
  id,
  name,
  tier,
  description,
  unique,
})

/** Paraphrased benefit menu from the supplied build rules, pp. 158–162.
 * Stat, individual Skill/Spell ranks, and DR have dedicated inputs in the builder. */
export const benefitTemplates: BuildTemplate[] = [
  template('custom', 'Custom benefit', 'minor', 'Describe the benefit and agree its tier with the GM.'),
  template(
    'cosmetic',
    'Cosmetic trait',
    'free',
    'Appearance, scent, voice, or another trait with no mechanical effect.',
  ),
  template('club', 'Club membership', 'minor', 'Membership in Club Desperado or Club Vanquisher.'),
  template(
    'skillAdvancement',
    'Skill advancement bonus',
    'minor',
    '+1 on advancement checks for one Skill at the end of each floor.',
  ),
  template('skillCap', 'Skill Rank 20', 'minor', 'A specific Skill can reach Rank 20.'),
  template(
    'noncombatMod',
    'Double non-combat Stat Mod',
    'minor',
    'Add a Stat Mod twice for a specific non-combat Skill in a common situation.',
  ),
  template(
    'conditional',
    'Conditional benefit',
    'minor',
    'A benefit tied to a narrow condition, such as attacks against stone creatures.',
  ),
  template(
    'darkSight',
    'Darkness sight or natural light',
    'minor',
    'See in complete darkness or produce light naturally.',
    true,
  ),
  template(
    'environmentMana',
    'Conditional Mana recovery',
    'minor',
    'Double resting/mending Mana recovery in a specified environment.',
  ),
  template('farSight', 'Extended sight', 'minor', 'See twice the usual distance.', true),
  template(
    'crafting',
    'Tier-1 crafting table',
    'minor',
    'Receive a tier-1 table when personal space becomes available.',
  ),
  template('saferoom', 'Free saferoom', 'minor', 'A room in saferooms is free.'),
  template('commerce', 'Commerce bonus', 'minor', '+1 in one category: discounts, sale proceeds, or interest.'),
  template(
    'sessionBenefit',
    'Limited non-combat benefit',
    'minor',
    'A non-combat benefit once per session under very specific conditions.',
  ),
  template(
    'combatHealing',
    'Healing from attacks',
    'moderate',
    'Heal one Health Bar slot after damaging/killing with a specified attack; maximum five per combat.',
  ),
  template('attackMod', 'Double attack Stat Mod', 'moderate', 'Add an attack Stat Mod twice in a common circumstance.'),
  template('advanceAdvantage', 'Advancement Advantage', 'moderate', 'Advantage on advancement checks for one Skill.'),
  template(
    'groupAdvancement',
    'Group advancement bonus',
    'moderate',
    '+1 to advancement checks for a thematic Skill group at the end of each floor.',
  ),
  template(
    'changeDamage',
    'Change damage type',
    'moderate',
    'Choose a different damage type at the start of a combat for that combat.',
  ),
  template('guild', 'Guild access', 'moderate', 'Access any guild of one specified type.'),
  template(
    'mana',
    'Double Mana recovery',
    'moderate',
    'Double Mana recovery from mending and resting without environmental limits.',
    true,
  ),
  template('allClubs', 'Professional and social clubs', 'moderate', 'Membership in all professional and social clubs.'),
  template('bookClub', 'Book of the Floor Club', 'moderate', 'Membership in the Dungeon Book of the Floor Club.'),
  template('groupCap', 'Thematic group Rank 20', 'moderate', 'A thematically linked Skill group can reach Rank 20.'),
  template(
    'gold',
    'Gold from a specific attack',
    'moderate',
    'A Mob killed with the specified attack drops gold equal to the current floor.',
  ),
  template('popularity', 'Popularity opportunity', 'moderate', 'A specified action or attack can earn Popularity.'),
  template('patron', 'Patron benefit', 'moderate', 'A benefit granted by a patron.'),
  template(
    'uncommonResistance',
    'Uncommon damage resistance',
    'moderate',
    'Take half damage from a specified uncommon damage type.',
    true,
  ),
  template(
    'environmentResistance',
    'Environmental resistance',
    'moderate',
    'Resist a specified source of environmental damage.',
    true,
  ),
  template('replaceStat', 'Replace an ability Stat', 'moderate', 'Use a different Stat for a specified ability.'),
  template('extraStat', 'Additional Stat Mod', 'moderate', 'Add a second ability Stat Mod to specified Skills.'),
  template(
    'weaponTransfer',
    'Weapon Skill transfer',
    'moderate',
    'Use Skills for one weapon type with a different weapon type.',
  ),
  template(
    'healingSpell',
    'Improved healing Spells',
    'moderate',
    'Healing Spells restore one additional Health Bar to the target.',
  ),
  template('terrain', 'Terrain traversal', 'moderate', 'Traverse specified terrain without Skill Checks.'),
  template('burrow', 'Burrowing', 'moderate', 'Move by burrowing.', true),
  template('underwater', 'Underwater breathing', 'moderate', 'Breathe underwater.', true),
  template(
    'temporarySkills',
    'Temporary all-Skill bonus',
    'moderate',
    '+1 to all Skills for a duration of no more than an hour.',
  ),
  template(
    'naturalD6',
    'Natural attack (d6)',
    'moderate',
    'Rank equals floor. Deal 1d6 + chosen Stat Mod, adding a d6 at ranks 5, 10, and 15. Choose Stat and damage type.',
  ),
  template(
    'reassignStats',
    'Reassign Stat bonuses',
    'moderate',
    'Once per floor during a Long Rest, redistribute this build’s Stat bonuses.',
  ),
  template('assistance', 'Significant assistance', 'major', 'Receive substantial assistance, comparable to a Manager.'),
  template('pet', 'Pet or mount', 'major', 'Gain a friendly Pet or Mount.'),
  template(
    'petBuff',
    'Pet and mount benefit',
    'major',
    'Give all your Pets/Mounts a benefit valued at up to four points.',
  ),
  template('encounter', 'Daily encounter-changing ability', 'major', 'A powerful encounter change once per day.'),
  template(
    'dailyDefense',
    'Daily defensive ability',
    'major',
    'Once per day, prevent all damage from a single attack or a similar defense.',
  ),
  template('partyBuff', 'Daily party buff', 'major', 'Give the entire party a buff once per day.'),
  template('limitedFlight', 'Limited flight', 'major', 'Fly with defined limitations.', true),
  template(
    'noBreathing',
    'No breathing required',
    'major',
    'Survive without breathing; immune to inhaled toxins.',
    true,
  ),
  template('rage', 'Rage', 'major', 'Melee attacks gain one damage per lost Health Bar slot.'),
  template('small', 'Small size', 'major', 'Size 2 (Small) or smaller.', true),
  template('move', 'Move bonus', 'major', '+5 ft Move per purchase.'),
  template('step', 'Step bonus', 'major', '+5 Step per purchase.'),
  template('checkDie', 'Bonus check die', 'major', 'Add 1d4 to Evade or checks for a specified Stat.'),
  template(
    'naturalD8',
    'Natural attack (d8)',
    'major',
    'Rank equals floor. Deal 1d8 + chosen Stat Mod, adding a d8 at ranks 5, 10, and 15. Choose Stat and damage type.',
  ),
  template(
    'noncombatAdvantage',
    'Non-combat Skill/Spell Advantage',
    'major',
    'Advantage with one specified non-combat Skill or Spell.',
  ),
  template(
    'doubleDamage',
    'Situational damage bonus',
    'major',
    'Up to double damage for one round under specified conditions.',
  ),
  template(
    'healthStat',
    'Alternate Health Bar Stat',
    'major',
    'Use a Stat other than Constitution for Health Bar values.',
  ),
  template('climb', 'Climbing movement', 'major', 'Automatically climb most surfaces, including ceilings.', true),
  template(
    'smallGroup',
    'Bonus to 3–5 Skills',
    'extreme',
    '+1 to each Skill in a thematic group of three to five Skills.',
  ),
  template('statAdvantage', 'Stat Check Advantage', 'extreme', 'Advantage on all checks for one specified Stat.'),
  template(
    'sixSkillCap',
    'Rank 20 for up to six Skills',
    'extreme',
    'A thematic group of at most six Skills can reach Rank 20.',
  ),
  template('poisonImmunity', 'Poison immunity', 'extreme', 'Immune to Poison.', true),
  template(
    'commonResistance',
    'Common damage resistance',
    'extreme',
    'Take half damage from a specified common damage type.',
    true,
  ),
  template(
    'duration',
    'Longer low-rank Spells',
    'extreme',
    'Double the duration of Spells at Rank 5 or below that have durations.',
  ),
  template(
    'limitedNoncombat',
    'Situational non-combat Advantage',
    'extreme',
    'Advantage on all Skills in a limited non-combat situation.',
  ),
  template('arm', 'Additional functional arm', 'extreme', 'Gain a functional arm.'),
  template('doppelganger', 'Doppelgänger form', 'extreme', 'Doppelgänger shape-changing.', true),
  template(
    'largeGroup',
    'Bonus to six or more Skills',
    'epic',
    '+1 to each Skill in a thematic group of at least six Skills.',
  ),
  template('allCaps', 'All Skills Rank 20', 'epic', 'All Skills can reach Rank 20.'),
  template(
    'majorDefense',
    'Significant defense',
    'epic',
    'Immunity to a common damage type, or halve damage from the first nine attacks each day.',
    true,
  ),
  template('limbRegeneration', 'Limb regeneration', 'epic', 'Regenerate lost limbs.', true),
  template(
    'broadAdvantage',
    'Broad situational Advantage',
    'epic',
    'Advantage on all Skills in a broad set of circumstances.',
  ),
  template('poisonDisease', 'Poison and disease immunity', 'epic', 'Immune to Poison and all diseases.', true),
  template('evadeAdvantage', 'Evade Advantage', 'epic', 'Advantage on Evade Checks.', true),
  template(
    'flexibleStats',
    'Flexible Stat/Skill transformation',
    'epic',
    'A powerful ability to assume different Stat or Skill bonuses.',
  ),
  template('changeling', 'Changeling form', 'epic', 'Changeling shapeshifting.', true),
  template(
    'statSkillsAdvantage',
    'All Skills for a Stat: Advantage',
    'epic',
    'Advantage on all Skill Checks using one specified Stat.',
  ),
  template('flight', 'Unlimited flight', 'epic', 'Fly without limitations.', true),
]

export const detrimentTemplates: BuildTemplate[] = [
  template('custom', 'Custom detriment', 'minor', 'Describe the drawback and agree its tier with the GM.'),
  template('clubRestriction', 'Club restriction', 'minor', 'A specified club membership prevents choosing this Class.'),
  template('unfavoredSpells', 'Unfavored Spell cost', 'minor', 'Unfavored Spells cost one extra Mana.'),
  template(
    'conditionalDisadvantage',
    'Conditional group Disadvantage',
    'minor',
    'Disadvantage on a thematic Skill group under a defined condition.',
  ),
  template('worship', 'Required worship', 'minor', 'Must worship a deity.'),
  template('noWorship', 'Worship prohibited', 'minor', 'Cannot worship a deity.'),
  template(
    'advancePenalty',
    'Advancement penalty',
    'minor',
    '-1 on advancement checks for a granted Skill once its Rank is 5 or higher.',
  ),
  template(
    'uncommonVulnerability',
    'Uncommon damage vulnerability',
    'minor',
    'Double damage from a specified uncommon damage type.',
  ),
  template(
    'halfDamage',
    'Reduced damage output',
    'minor',
    'Halve outgoing damage from a broad attack type outside the Class’s focus.',
  ),
  template(
    'twoConditions',
    'Weakness with two conditions',
    'minor',
    'A weakness triggered by two specified conditions.',
  ),
  template(
    'delayedBonus',
    'Delayed benefit',
    'minor',
    'A bonus becomes available after Level 50 or on the sixth floor.',
  ),
  template('broadWeakness', 'Broad conditional weakness', 'moderate', 'A weakness triggered by one broad condition.'),
  template(
    'floorRanks',
    'Floor-only Skill advancement',
    'moderate',
    'A specified Skill gains Ranks only when descending to the next floor.',
  ),
  template('weaponChoice', 'Limited weapon choice', 'moderate', 'Restricted choice of weapons.'),
  template('noWeaponMod', 'No Weapon Stat Mod', 'moderate', 'A granted Weapon Skill receives no Stat Mod.'),
  template('spellMana', 'Spell category Mana cost', 'moderate', 'A provided Spell category costs three extra Mana.'),
  template(
    'groupDisadvantage',
    'Thematic group Disadvantage',
    'moderate',
    'Disadvantage on an entire thematic Skill group.',
  ),
  template(
    'itemRestriction',
    'Item or Passive Spell restriction',
    'moderate',
    'Cannot use a broad category of useful items or Passive Spells.',
  ),
  template(
    'statCap',
    'Stat capped at 10',
    'major',
    'A specified Stat cannot exceed 10, including gear and potion bonuses.',
  ),
  template(
    'commonVulnerability',
    'Common damage vulnerability',
    'major',
    'Double damage from a specified common damage type.',
  ),
]

export function createRaceClassData(kind: RaceClassKind): Record<string, any> {
  return {
    buildVersion: 1,
    description: '',
    tags: '',
    notes: '',
    statBonuses: Object.fromEntries(buildStats.map((stat) => [stat, '0'])),
    drBonus: '0',
    skillBonuses: [],
    spellBonuses: [],
    benefits: [],
    detriments: [],
    skillDetriments: [],
    statSkillDetriments: [],
    ...(kind === 'races'
      ? { origin: 'Earth', hobbySkill: '', popularity: '' }
      : { earthClass: false, classTypes: '', prerequisites: '' }),
  }
}

const number = (value: unknown) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const positive = (value: unknown) => Math.max(0, number(value))
const unitCost = (tier: unknown) => benefitTiers.find((item) => item.value === tier)?.cost ?? 0

/** Calculate without modifying saved data; invalid Skill penalties never award points. */
export function getRaceClassBuild(kind: RaceClassKind, data: Record<string, any>) {
  const issues: string[] = []
  const checkInteger = (value: unknown, label: string, signed = false) => {
    if (value == null || value === '') return
    if (!Number.isFinite(Number(value)) || !Number.isInteger(Number(value)) || (!signed && Number(value) < 0))
      issues.push(`${label} must be ${signed ? 'a whole number' : 'a non-negative whole number'}.`)
  }
  let spent = 0
  let statPenalties = 0
  for (const stat of buildStats) {
    const value = number(data.statBonuses?.[stat])
    checkInteger(data.statBonuses?.[stat], `${stat.toUpperCase()} adjustment`, true)
    spent += Math.max(0, value)
    if (Number.isInteger(value)) statPenalties += Math.max(0, -value)
  }
  checkInteger(data.drBonus, 'DR bonus')
  spent += positive(data.drBonus) * 2
  if (positive(data.drBonus) > 3) issues.push('The DR benefit is limited to +3.')
  let passiveRanks = 0
  for (const key of ['skillBonuses', 'spellBonuses']) {
    for (const entry of adventureEntries(data, key)) {
      const ranks = positive(entry.ranks)
      checkInteger(entry.ranks, `${entry.name || 'Skill/Spell'} bonus ranks`)
      const training = String(entry.training || 'standard')
      const allowed =
        key === 'skillBonuses' ? ['standard', 'passive', 'unusual', 'unusualPassive'] : ['standard', 'passive']
      if (!allowed.includes(training)) issues.push(`${entry.name || 'Skill/Spell'} has an unknown training category.`)
      spent += ranks * (training.startsWith('unusual') ? 4 : 2)
      if (training === 'passive' || training === 'unusualPassive') passiveRanks += ranks
      if (ranks && !String(entry.name || '').trim()) issues.push('Name each Skill/Spell that receives bonus ranks.')
    }
  }
  if (kind === 'classes' && passiveRanks > 5)
    issues.push('A Class can grant at most 5 total Passive Skill/Spell ranks.')
  let otherDetriments = 0
  for (const key of ['benefits', 'detriments']) {
    const entries = adventureEntries(data, key)
    for (const entry of entries) {
      const tiers = key === 'benefits' ? benefitTiers : detrimentTiers
      if (!tiers.some((tier) => tier.value === entry.tier))
        issues.push(`${entry.name || 'Entry'} needs a valid ${key === 'benefits' ? 'benefit' : 'detriment'} tier.`)
      checkInteger(entry.count ?? 1, `${entry.name || 'Entry'} count`)
      const count = positive(entry.count ?? 1)
      const points = unitCost(entry.tier) * count
      if (key === 'benefits') spent += points
      else if (Number.isInteger(Number(entry.count ?? 1))) otherDetriments += points
      const preset = benefitTemplates.find((item) => item.id === entry.templateId)
      if (key === 'benefits' && preset?.unique && count > 1)
        issues.push(`${entry.name}: additional copies do not increase this benefit.`)
      if (
        key === 'benefits' &&
        preset?.unique &&
        count > 0 &&
        entries.some(
          (other) =>
            other !== entry &&
            positive(other.count ?? 1) > 0 &&
            other.templateId === entry.templateId &&
            other.target === entry.target,
        )
      )
        issues.push(`${entry.name}: the same protection or ability appears more than once.`)
    }
  }
  let skillPenalties = 0
  for (const entry of adventureEntries(data, 'skillDetriments')) {
    const penalty = positive(entry.penalty)
    checkInteger(entry.penalty, `${entry.name || 'Skill'} penalty`)
    checkInteger(entry.currentRank, `${entry.name || 'Skill'} current Rank`)
    if (
      penalty &&
      (!String(entry.name || '').trim() ||
        !Number.isInteger(Number(entry.penalty)) ||
        !Number.isInteger(Number(entry.currentRank)) ||
        positive(entry.currentRank) < penalty)
    ) {
      issues.push(
        `${entry.name || 'Skill penalty'}: specify an existing Skill with a current Rank at least as high as its penalty.`,
      )
    } else skillPenalties += penalty
  }
  let groupPenalties = 0
  for (const entry of adventureEntries(data, 'statSkillDetriments')) {
    checkInteger(entry.penalty, 'All-Skills penalty')
    if (buildStats.includes(entry.stat) && Number.isInteger(Number(entry.penalty)))
      groupPenalties += positive(entry.penalty)
    else if (positive(entry.penalty)) issues.push('Choose a Stat for each all-Skills penalty.')
  }
  const earned = Math.floor(statPenalties / 2) + Math.floor(skillPenalties / 2) + groupPenalties + otherDetriments
  const extra = Math.min(5, earned)
  const base = kind === 'races' ? 25 : 30
  const remaining = base + extra - spent
  if (remaining < 0)
    issues.push(`This ${kind === 'races' ? 'Race' : 'Class'} is ${-remaining} build points over budget.`)
  return { base, earned, extra, spent, remaining, passiveRanks, issues: [...new Set(issues)] }
}

export function createBuildEntry(preset: BuildTemplate) {
  return {
    id: crypto.randomUUID(),
    templateId: preset.id,
    name: preset.name,
    tier: preset.tier,
    count: 1,
    target: '',
    description: preset.description,
  }
}
