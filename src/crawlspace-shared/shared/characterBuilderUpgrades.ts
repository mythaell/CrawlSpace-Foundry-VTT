import { starterAttack, starterUtilities } from './characterBuilderMechanics'

/** Mechanical summaries checked against Skills and spells.pdf, printed pp.177–201, 204–212. */
type UpgradeFields = Record<string, unknown> & { rank10: string; rank15: string }
const effect = (id: string, type: string, value: string, requiredRank: number) => ({
  id: `builder-upgrade-${id}`,
  type,
  value,
  requiredRank: String(requiredRank),
  target: '',
  slots: [],
})
const attackBenefits = [
  ['The target gains Woozy.', 'If the target loses at least 3 HB slots, it also gains Take Down.'],
  ['Make your first attack of each combat with Advantage.', ''],
  ['', 'Push a target of your size or smaller 15 feet.'],
  [
    'May make a free extra attack with Disadvantage against another foe adjacent to both you and the original target.',
    'On an Amazing Success or better, sever an arm or similar appendage, disarming a foe wielding a two-handed weapon.',
  ],
  ['May throw this weapon with this skill up to Rank × 5 feet.', 'Attacks against a foe’s back deal double damage.'],
  ['', 'Gain +1 Evade.'],
  ['Also add one Rank damage die.', 'The target gains Blood Trail.'],
  ['The target gains Blood Trail.', 'Range becomes 100 feet.'],
  ['', 'The target gains Staggered.'],
  ['', 'Add a 5-foot Splash.'],
  ['This attack ignores DR (armor piercing).', 'Increase range by your STR score in feet.'],
  [
    'May make one additional free attack with Disadvantage.',
    'May make another additional free attack with Disadvantage.',
  ],
  ['Also add one Rank damage die.', 'Also add another Rank damage die.'],
  ['Gain +1 Rank in Zone of Control.', 'Gain another +1 Rank in Zone of Control.'],
  ['Gain +1 Evade.', 'Gain another +1 Evade.'],
  ['', 'May make an additional free attack with Disadvantage.'],
  ['', 'The target gains Sore as Shit.'],
  ['Also add one Rank damage die.', 'The target gains Woozy.'],
  ['', ''],
]
export function attackRankUpgrades(index: number): UpgradeFields {
  const base = starterAttack(index)
  const formula = String(base.damageFormula)
  const die = formula.match(/^1d\d+/)![0]
  const [extra10, extra15] = attackBenefits[index]
  const count10 = index === 15 ? 4 : index === 18 ? 2 : 3
  const count15 = count10 + 1
  const rankDice = index === 6 || index === 17 ? '+RANK_DIE' : index === 12 ? '+RANK_DIE' : ''
  const formulaAt = (count: number, rank: number) =>
    formula.replace(/^1d\d+/, `${count}${die.slice(1)}${index === 12 && rank === 15 ? '+RANK_DIE+RANK_DIE' : rankDice}`)
  const fields: UpgradeFields = {
    rank10: `Add ${die} base damage.${extra10 ? ` ${extra10}` : ''}`,
    rank15: `Add ${die} base damage.${extra15 ? ` ${extra15}` : ''}`,
    rank10DamageFormula: formulaAt(count10, 10),
    rank15DamageFormula: formulaAt(count15, 15),
  }
  const effects = [...((base.effects as Record<string, unknown>[]) ?? [])]
  if (index === 5) effects.push(effect('blade-evade-15', 'evadeModifier', '1', 15))
  if (index === 10) effects.push(effect('spear-piercing-10', 'armorPiercing', '1', 10))
  if (index === 14)
    effects.push(effect('staff-evade-10', 'evadeModifier', '1', 10), effect('staff-evade-15', 'evadeModifier', '1', 15))
  if (effects.length) fields.effects = effects
  if (index === 9)
    fields.rank15Template = { areas: [{ type: 'circle', distance: 5, width: 5, angle: 60, label: 'Splash' }] }
  return fields
}

const spellBenefits = [
  ['The target gains Woozy.', 'Also add one Rank damage die.'],
  [
    'The target gains Burned.',
    'Your Palm Fighter, basic unarmed and claw-slice strikes also deal one Ember Palm Rank damage die as Fire damage.',
  ],
  ['The target gains Stiff Legs.', 'The target gains The Taint.'],
  [
    'At the end of the round, deal one additional Rank damage die of Electric damage.',
    'When cast at melee range, multiply total damage by 5.',
  ],
  [
    'The accumulated killing-blow damage bonus lasts one week.',
    'The accumulated killing-blow damage bonus lasts until you leave the current floor.',
  ],
]
export function spellRankUpgrades(index: number): UpgradeFields {
  const die = index === 0 || index === 3 ? '1d2' : '1d4'
  const [extra10, extra15] = spellBenefits[index]
  return {
    rank10: `Add ${die} base damage. ${extra10}`,
    rank15: `Add ${die} base damage. ${extra15}`,
    rank10DamageFormula: `${index === 0 ? 4 : 3}${die.slice(1)}+INT`,
    rank15DamageFormula: `${index === 0 ? 5 : 4}${die.slice(1)}${index === 0 ? '+RANK_DIE' : ''}+INT`,
  }
}

export const damageEffectRankUpgrades: Record<string, UpgradeFields> = {
  'Hammer Palm': {
    rank10: 'May inflict Stunned instead of rolling damage.',
    rank15: 'Add another Rank damage die and inflict Stunned.',
  },
  'Stomp Shock': {
    rank10: 'Remove the once-per-round cooldown.',
    rank15: 'Usable at 40% HB or less; multiply total damage by 4.',
  },
  'Bone Rattle': {
    rank10: 'Against a target of your size, add one Rank damage die and inflict Stunned.',
    rank15: 'Against a target of your size, add another Rank damage die and inflict Blood Trail.',
  },
  'Ground Slam': {
    rank10: 'May affect foes up to one size larger than you.',
    rank15: 'Add 1d8 base damage; may affect foes up to two sizes larger than you.',
  },
}
const utilityBenefits: Record<string, [string, string]> = {
  Streetwise: [
    'Quickly find a hiding place chosen by the GM.',
    'Learn information that gives you bargaining power over an important local person, chosen by the GM.',
  ],
  Perception: [
    'Halve penalties caused by a brief opportunity to notice something.',
    'Halve penalties caused by distance.',
  ],
  Fabricate: [
    'May craft your specialty with a +1 bonus-level enchantment.',
    'May craft your specialty with up to a +2 bonus-level enchantment, in half the time.',
  ],
  Repair: ['Repairs take 1 hour.', 'May rebuild a destroyed item.'],
  'Escape Artist': [
    'Other party crawlers using this skill untrained no longer suffer Disadvantage.',
    'After escaping, may immediately take an Action with Advantage.',
  ],
  Endurance: [
    'Check with Advantage unless already Fatigued or in extreme conditions.',
    'May take the effects of a Standard Fail instead of a Critical Fail.',
  ],
  Jumping: ['Gain +1 Evade.', 'Horizontal leap distance becomes Rank + (STR × 2) feet.'],
  Deception: [
    'May use this skill to forge documents.',
    'On a failed check, may take one Action before opponents react.',
  ],
  Engineering: [
    'May craft your specialty with a +1 bonus-level enchantment.',
    'May craft your specialty with up to a +2 bonus-level enchantment, in half the time.',
  ],
  'Good First Impression': [
    'A Mob up to twice your level will not attack your party unless you or an ally attacks it, or your party obstructs its objective.',
    'May affect a group of the same Mob type, each up to twice your level, under the same non-aggression conditions.',
  ],
  Investigation: [
    'An investigation attempt takes 5 minutes.',
    'Check with Advantage when you know the people involved.',
  ],
  'Animal Handling': [
    'Each stage of bonding with a potential pet takes half the usual time.',
    'May have up to two pets.',
  ],
  Climbing: [
    'Check every 10 minutes; attacks while climbing no longer have Disadvantage.',
    'Check every 15 minutes; other party crawlers using this skill untrained no longer suffer Disadvantage.',
  ],
  Intimidate: ['The target also gains Woozy.', 'The target drops everything held and also gains Paralyzed.'],
  'Hide in Shadows': [
    'Other party crawlers using this skill untrained no longer suffer Disadvantage.',
    'May hide in a lightly shaded area and take a Step without revealing your position.',
  ],
  Catcher: [
    'Gain another +5 DR while intercepting the attack.',
    'Gain another +5 DR while intercepting the attack and ignore its attached Debuffs.',
  ],
  Stealth: [
    'Other party crawlers using this skill untrained no longer suffer Disadvantage.',
    'On a successful Surprise check, may also Move and Step; a Surprise attack doubles its base damage dice.',
  ],
  Survival: [
    'Other party crawlers using this skill untrained no longer suffer Disadvantage.',
    'Avoid the additional damage from a Major Fail.',
  ],
  'Chopper Pilot': [
    'Attacks while piloting no longer have Disadvantage.',
    'Your craft gains another 5 feet of Move; check with Advantage for extreme stunts.',
  ],
  Negotiation: [
    'Improve the negotiated price by another 10% in your favor (20% total).',
    'Improve the negotiated price by another 15% in your favor (35% total).',
  ],
  Persuasion: [
    'Suggestions may be followed even when dangerous.',
    'Suggestions may be followed even when against the target’s nature.',
  ],
  'Determine Value': [
    'Identify which type of loot box an item would have come from.',
    'Newly acquired inventory items display their gold value.',
  ],
  'First Aid': [
    'Spending 10 minutes also removes a Long-Term Minor Injury.',
    'Heal one additional HB slot; spending 15 minutes also removes a Major Injury.',
  ],
  'Sleight of Hand': [
    'May plant an item on a target with pockets or similar storage.',
    'May manipulate objects up to half your size, rounded down.',
  ],
  'Detect Lies': [
    'A failed check still reveals no lie, but ignore Critical Fail effects.',
    'May detect lies in text or audio without seeing the speaker.',
  ],
  Driving: [
    'Your vehicle gains +5 feet of Move; Evade attacks against it with Advantage.',
    'Your vehicle gains another +5 feet of Move; check with Advantage for extreme stunts.',
  ],
  'Dumpster Diving': [
    'Search takes 30 minutes; a Critical Hit finds an extra interesting item.',
    'Search takes 10 minutes; an Amazing Success finds an interesting item.',
  ],
  Performance: [
    'Choose another performance specialty; after at least an hour of coaching, others may use one of your specialties untrained without Disadvantage.',
    'Choose another performance specialty; may reproduce a performance after experiencing it once.',
  ],
  Aiming: ['Add another 1d4 base damage when using this skill.', 'Add another 1d4 base damage when using this skill.'],
  Running: [
    'Gain another permanent +10 feet of Move; check every 4 minutes.',
    'Gain another permanent +15 feet of Move; check every 6 minutes.',
  ],
  Tracking: [
    'Follow found tracks for 1 hour between checks and learn two details about the targets.',
    'Follow found tracks for 2 hours between checks and learn four details about the targets.',
  ],
  Ambush: [
    'Other party crawlers using this skill untrained no longer suffer Disadvantage.',
    'Gain a second surprise Action, which cannot be an attack.',
  ],
  'Light on Your Feet': [
    'May leap along a non-arcing path, including straight upward.',
    'May stay in your leap for up to Rank seconds, resembling a glide.',
  ],
  Dodge: [
    'Gain another +2 Evade; Evade spells and ranged attacks with Advantage.',
    'Gain another +2 Evade; may Evade in combat without spending an Action.',
  ],
  Taunt: ['May affect Mobs within 60 feet.', 'Make the free Evade checks against redirected attacks with Advantage.'],
}
export function utilityRankUpgrades(source: string): UpgradeFields {
  if (source === 'Back Claw')
    return {
      rank10: 'Add 1d6 base damage.',
      rank15: 'Add 1d6 base damage; the target gains Blood Trail.',
      rank10DamageFormula: '3d6+STR',
      rank15DamageFormula: '4d6+STR',
    }
  const benefits = utilityBenefits[source]
  if (!benefits) throw new Error(`Missing advanced upgrades for ${source}`)
  const fields: UpgradeFields = { rank10: benefits[0], rank15: benefits[1] }
  const effects = [...((starterUtilities[source]?.effects as Record<string, unknown>[]) ?? [])]
  if (source === 'Jumping') effects.push(effect('leap-evade-10', 'evadeModifier', '1', 10))
  if (source === 'Dodge')
    effects.push(effect('dodge-evade-10', 'evadeModifier', '2', 10), effect('dodge-evade-15', 'evadeModifier', '2', 15))
  if (source === 'Running')
    effects.push(
      effect('running-move-10', 'moveModifier', '10', 10),
      effect('running-move-15', 'moveModifier', '15', 15),
    )
  if (effects.length) fields.effects = effects
  if (source === 'First Aid') fields.rank15HealingFormula = '2'
  return fields
}
