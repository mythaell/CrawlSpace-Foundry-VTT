/** Starter mechanics from Character Customization, pp. 23–40. Descriptions are summaries. */
const attacks = [
  ['STR', '1d6+STR', 'Bludgeoning', 'Melee', '', ''],
  [
    'STR',
    '1d4+STR',
    'Bludgeoning',
    'Melee',
    'Use an object weighing 1 lb to your STR in pounds. AI Favor 1.',
    'May also throw it Rank × 5 feet.',
  ],
  ['STR', '1d10+STR', 'Bludgeoning', 'Melee', 'Requires two hands.', ''],
  ['STR', '1d6+STR', 'Slashing', 'Melee', '', ''],
  ['DEX', '1d4+STR', 'Piercing', 'Melee', 'AI Favor 1.', 'Gains armor piercing.'],
  ['STR', '1d8+STR', 'Slashing', 'Melee', '', ''],
  ['DEX', '1d6+STR', 'Piercing', '100 feet', 'Requires two hands and ammunition.', ''],
  ['DEX', '1d8', 'Piercing', '50 feet', 'Requires two hands and ammunition; attack once per round.', ''],
  [
    'DEX',
    '1d8',
    'Piercing',
    '150 feet',
    'Requires ammunition. After a Major Fail or worse, spend an Action reloading.',
    '',
  ],
  [
    'DEX',
    '1d10',
    'Piercing',
    '30 feet',
    'Requires two hands and ammunition. After a Major Fail or worse, spend an Action reloading.',
    '',
  ],
  ['DEX', '1d8+STR', 'Piercing', '40 feet', '', ''],
  ['DEX', '1d4+STR', 'Piercing', '30 feet', 'AI Favor 1.', 'Range increases to 40 feet.'],
  [
    'DEX',
    '1d2+STR',
    'Bludgeoning',
    '30 feet',
    'Requires two hands. AI Favor 2.',
    'Range increases by your STR score in feet.',
  ],
  ['STR', '1d8+STR', 'Piercing', '10 feet', 'Requires two hands.', ''],
  ['STR', '1d6+STR', 'Bludgeoning', '10 feet', 'Requires two hands.', ''],
  [
    'DEX',
    '1d2+STR',
    'Bludgeoning',
    'Melee',
    'May use Hammer Palm. AI Favor 2 when attacking without a damage-effect skill.',
    'Add 2d2 base damage.',
  ],
  [
    'STR',
    '1d4+STR',
    'Bludgeoning',
    'Melee',
    'May use Stomp Shock. AI Favor 1 when attacking without a damage-effect skill.',
    '',
  ],
  [
    'STR',
    '1d4+CON',
    'Bludgeoning',
    'Melee',
    'Lose 1 HB slot on a successful attack. May use Bone Rattle. AI Favor 1 without a damage-effect skill.',
    'No longer lose an HB slot on a successful attack.',
  ],
  [
    'STR',
    '1d4+STR',
    'Bludgeoning',
    'Melee',
    'Requires two hands. A hit inflicts Held. Escaping is a STR check opposed by this skill as an Interrupt. May use Ground Slam. AI Favor 1 without a damage-effect skill.',
    'Maintain Held without spending an Action, but the check has Disadvantage.',
  ],
]
export function starterAttack(index: number): Record<string, unknown> {
  const [stat, damageFormula, type, range, details, upgrade] = attacks[index]
  const die = damageFormula.match(/^1d\d+/)![0]
  return {
    stat,
    checkType: 'Attack',
    isAttackSkill: true,
    combatRelated: true,
    damageFormula,
    damageTypes: [type],
    range,
    details: `Attack against Evade. ${details}`.trim(),
    rank5DamageFormula: index === 18 ? '' : damageFormula.replace(/^1d/, index === 15 ? '3d' : '2d'),
    effects:
      index === 4
        ? [{ id: 'starter-piercing-5', type: 'armorPiercing', requiredRank: '5', value: '1', target: '', slots: [] }]
        : [],
    rank5: `${index === 18 ? '' : index === 15 ? '' : `Add ${die} base damage. `}${upgrade}`.trim(),
  }
}
export function starterSpell(index: number): Record<string, unknown> {
  const [mana, range, die, type, favor, upgrade] = [
    ['1', '100 feet', '1d2', 'Bludgeoning', '2', 'Add 2d2 base damage.'],
    ['3', 'Melee', '1d4', 'Fire', '1', 'Add 1d4 base damage.'],
    [
      '2',
      'Melee',
      '1d4',
      'Ice',
      '1',
      'Add 1d4 base damage. The target cannot heal themselves during the next combat round.',
    ],
    ['2', '30 feet', '1d2', 'Electric', '2', 'Add 1d2 base damage. May inflict Stunned instead of damage.'],
    [
      '4',
      '50 feet',
      '1d4',
      'Necrotic',
      '1',
      'Add 1d4 base damage. A killing blow against a foe of at least half your level grants +1 damage until a long rest, stacking up to your spell Rank.',
    ],
  ][index]
  return {
    stat: 'INT',
    checkType: 'Attack',
    isAttackSpell: true,
    mana,
    range,
    damageFormula: `${die}+INT`,
    damageTypes: [type],
    details: `Spell attack against Evade. AI Favor ${favor}. Must be in your hotlist to cast in combat.`,
    rank5: upgrade,
    rank5DamageFormula: `${index === 0 ? '3d2' : die.replace('1d', '2d')}+INT`,
  }
}
export function starterWeapon(index: number) {
  const ranged = index >= 6 && index <= 12
  const twoHands = [2, 6, 7, 9, 12, 13, 14].includes(index)
  return {
    quantity: '1',
    properties: {
      itemType: 'weapon',
      equipment: { slot: 'Hands' },
      details: `${ranged ? 'A practical weapon designed for ranged use.' : 'A practical weapon built for close quarters.'} ${twoHands ? 'Requires two hands.' : 'Requires one hand.'}`,
      weapon: { type: ranged ? 'ranged' : 'melee', twoHanded: twoHands },
    },
  }
}

export const starterEffects: Record<string, Record<string, unknown>> = {
  'Hammer Palm': {
    details: 'Passive damage effect for Palm Fighter: add 1d2 to base damage.',
    rank5: 'Also add one Rank damage die.',
  },
  'Stomp Shock': {
    details:
      'Passive damage effect for Heel Striker. Once per round against a target with 20% or less HB remaining, double total damage.',
    rank5: 'Usable against targets at 30% HB or less; triple total damage instead.',
  },
  'Bone Rattle': {
    details: 'Passive damage effect for Shoulder Charger: against a creature of your size, add 1d4 base damage.',
    rank5: 'Add another 1d4 against creatures of your size.',
  },
  'Ground Slam': {
    details:
      'Passive damage effect for Grapple Artist: against a smaller Held creature, add 1d8 base damage plus STR Bludgeoning, end Held and throw it 5 feet per 5 Ranks (minimum 5 feet).',
    rank5: 'May affect creatures of your size or smaller.',
  },
}
const utilityRows = [
  [
    'Aiming',
    '',
    'Passive',
    'When making a ranged attack with Disadvantage, add this skill Rank to the check and +1d4 damage on a hit.',
    'Add another 1d4 damage.',
  ],
  [
    'Ambush',
    'INT',
    'Opposed',
    'Approach a mob unseen to gain an action before surprise; attack with Advantage.',
    'Add one Rank damage die.',
  ],
  [
    'Animal Handling',
    'CHA',
    'Opposed',
    'Opposed by INT. Handle animals and discourage friendly animals from attacking.',
    'Choose an animal type; gain Advantage handling it.',
  ],
  [
    'Catcher',
    '',
    'Passive',
    'Interrupt: take a direct, non-area attack aimed at an adjacent ally. May Step up to 10 feet to reach them; do not make your own Evade check.',
    'Gain 5 DR against the intercepted attack.',
  ],
  [
    'Chopper Pilot',
    'DEX',
    'Unopposed',
    'Pilot rotorcraft. Attacks while piloting have Disadvantage; cannot use two-handed weapons.',
    'The vehicle gains 5 feet of Move.',
  ],
  [
    'Climbing',
    'STR',
    'Unopposed',
    'Check once per minute of climbing. Attacks while climbing have Disadvantage.',
    'Check once per five minutes.',
  ],
  [
    'Deception',
    'CHA',
    'Opposed',
    'Lie or misdirect, opposed by INT. Disadvantage against Detect Lies.',
    'Can apply this skill to gambling.',
  ],
  [
    'Detect Lies',
    'INT',
    'Opposed',
    'Detect deception, opposed by CHA. Disadvantage against Deception.',
    'Ignore the additional effects of a Major Fail.',
  ],
  [
    'Determine Value',
    '',
    'Passive',
    'Sort inventory by value without revealing exact prices. Ranks advance by magical means.',
    'Also use value tabs and history.',
  ],
  [
    'Dodge',
    '',
    'Passive',
    'Gain +1 Evade. Advance by magical means, or training after Rank 5.',
    'Gain another +1 Evade and 5 feet of Step when Evading.',
  ],
  [
    'Driving',
    'DEX',
    'Unopposed',
    'Drive a vehicle. Attacks while driving have Disadvantage.',
    'Remove the attack Disadvantage from driving.',
  ],
  [
    'Dumpster Diving',
    'INT',
    'Unopposed',
    'Search for an hour, once per 50-foot square, for a useful item chosen by the GM.',
    'Add one Rank die of Miscellaneous Junk.',
  ],
  [
    'Endurance',
    'CON',
    'Unopposed',
    'Avoid Fatigued during prolonged physical activity.',
    'Ignore the additional effects of a Major Fail.',
  ],
  [
    'Engineering',
    'INT',
    'Unopposed',
    'Build mundane devices with moving parts, fluids or chemicals from junk; excludes vehicles.',
    'Specialize in one mundane item type; gain Advantage crafting it.',
  ],
  [
    'Escape Artist',
    'DEX',
    'Unopposed',
    'Escape bonds. Escaping Held instead uses STR opposed by the holding skill.',
    'Escape unnoticed; may Step after escaping Held.',
  ],
  [
    'Fabricate',
    'INT',
    'Unopposed',
    'Craft mundane objects from junk, without moving parts, fluids or chemicals.',
    'Specialize in one item type; gain Advantage crafting it.',
  ],
  [
    'First Aid',
    'INT',
    'Unopposed',
    'Restore 1 HB slot plus one per higher success tier. Once per rest per patient.',
    'Spend five minutes to remove a Minor Injury.',
  ],
  [
    'Good First Impression',
    'CHA',
    'Opposed',
    'Opposed by INT; affects one non-hostile NPC or Mob, excluding crawlers, bosses and elites.',
    'Lower-level Mobs will not attack your party unless provoked.',
  ],
  [
    'Hide in Shadows',
    'DEX',
    'Opposed',
    'Opposed by INT. Remain stationary out of sight, with Advantage behind larger cover. Hidden until leaving cover or affecting another creature; area attacks can still hit.',
    'May hide in dim light without cover.',
  ],
  [
    'Intimidate',
    'STR',
    'Opposed',
    'Opposed by CHA; Disadvantage after hostilities begin. Success inflicts Staggered.',
    'Target spends remaining Actions retreating until the end of the next round.',
  ],
  [
    'Investigation',
    'INT',
    'Unopposed',
    'Search ten minutes, or use a Look for Clues Action, to discover a clue.',
    'Gain Advantage in familiar areas.',
  ],
  [
    'Jumping',
    'STR',
    'Unopposed',
    'With a 10-foot running start, jump Rank + STR modifier feet horizontally or 1 foot vertically.',
    'Add DEX modifier to vertical height.',
  ],
  [
    'Light on Your Feet',
    'DEX',
    'Unopposed',
    'Animal only. With a 10-foot running start, jump Rank × 2 feet horizontally or DEX modifier × 2 vertically.',
    'Use × 3 for both distances.',
  ],
  [
    'Negotiation',
    'CHA',
    'Opposed',
    'Opposed by INT. Negotiate five minutes for a 10% price change; Disadvantage with non-merchants. Cannot bypass minimum prices or bargain with your own party.',
    'The party also receives the negotiated price.',
  ],
  ['Perception', 'INT', 'Unopposed', 'Notice details and use Look for Clues.', 'Halve penalties from clutter.'],
  [
    'Performance',
    'CHA',
    'Unopposed',
    'Choose a performance specialty. A rival performance adds their CHA to the difficulty.',
    'Choose an additional performance specialty.',
  ],
  [
    'Persuasion',
    'CHA',
    'Opposed',
    'Opposed by INT. Requires ten minutes in safety; Disadvantage for risky, inconvenient or improper requests. The suggestion cannot be too costly, too dangerous or against the target’s nature.',
    'Suggestions need only avoid being too costly.',
  ],
  [
    'Repair',
    'INT',
    'Unopposed',
    'Spend two hours repairing a simple broken or damaged item (including magical items), excluding destroyed items and moving parts.',
    'May repair items with moving parts.',
  ],
  [
    'Running',
    'DEX',
    'Unopposed',
    'Check every minute; add +1 per 10 feet of Move. For short bursts rather than prolonged Endurance.',
    'Check every two minutes; gain 5 feet of Move.',
  ],
  [
    'Salvage',
    'INT',
    'Unopposed',
    'Spend an hour recovering half the raw materials from a non-explosive item.',
    'Takes thirty minutes.',
  ],
  [
    'Sleight of Hand',
    'DEX',
    'Opposed',
    'Opposed by INT. Conceal or manipulate hand-sized objects, excluding other inventories or hotlists. Disadvantage against an observer with a higher Perception Rank.',
    'May pick NPC and Mob pockets.',
  ],
  [
    'Stealth',
    'DEX',
    'Opposed',
    'Opposed by INT. Start out of sight. Success grants a non-attack Action before surprise; outside combat, may Move and Step.',
    'May make a surprise attack with Advantage.',
  ],
  [
    'Streetwise',
    'CHA',
    'Unopposed',
    'Find rumors and criminal contacts in a populated settlement.',
    'Learn an additional rumor.',
  ],
  [
    'Survival',
    'CON',
    'Unopposed',
    'Endure remote hostile conditions; failure risks hunger and thirst.',
    'Avoid extra damage from a Critical Fail.',
  ],
  [
    'Swimming',
    'STR',
    'Unopposed',
    'Check every thirty seconds. Become Fatigued after one minute or a Major Fail.',
    'Become Fatigued after two minutes.',
  ],
  [
    'Tactics',
    'INT',
    'Unopposed',
    'Once per combat, choose Attack, Damage or Evade. Party gains +1 to the selected checks, plus one per higher success tier.',
    'Observe for five minutes to gain Advantage.',
  ],
  [
    'Taunt',
    'CHA',
    'Opposed',
    'Interrupt within 30 feet, opposed by INT, to redirect an attack to yourself; higher success tiers redirect more attacks.',
    'Gain a free Evade against each redirected attack.',
  ],
  [
    'Throwing',
    'STR',
    'Unopposed',
    'Throw at an area, or attack a foe against Evade. Normal weight limit is STR modifier lb, range STR modifier × 10 feet; heavier objects impose Disadvantage. A miss scatters 1d8 direction by the failure margin in feet.',
    'Gain Advantage throwing to a willing catcher.',
  ],
  [
    'Tracking',
    'INT',
    'Unopposed',
    'Find and follow tracks, checking every fifteen minutes.',
    'Check every thirty minutes.',
  ],
]
export const starterUtilities: Record<string, Record<string, unknown>> = Object.fromEntries(
  utilityRows.map(([name, stat, checkType, details, rank5]) => [name, { stat, checkType, details, rank5 }]),
)
for (const [name, die, type] of [
  ['Back Claw', '1d6', 'Slashing'],
  ['Bite', '1d8', 'Piercing'],
]) {
  starterUtilities[name] = {
    stat: 'STR',
    checkType: 'Attack',
    isAttackSkill: true,
    combatRelated: true,
    damageFormula: `${die}+STR`,
    damageTypes: [type],
    rank5DamageFormula: die,
    details:
      name === 'Bite'
        ? 'Melee attack against Evade; requires a suitable appendage. Biting can risk blood poisoning.'
        : 'Melee attack against Evade.',
    rank5: `Add ${die} base damage.`,
  }
}

const permanentEffect = (id: string, type: string, value: string, requiredRank: string) => ({
  id,
  type,
  value,
  requiredRank,
  target: '',
  slots: [],
})
starterUtilities.Dodge.effects = [
  permanentEffect('starter-dodge-1', 'evadeModifier', '1', '1'),
  permanentEffect('starter-dodge-5', 'evadeModifier', '1', '5'),
]
starterUtilities.Running.effects = [permanentEffect('starter-running-5', 'moveModifier', '5', '5')]
starterUtilities['First Aid'].isHealing = true
starterUtilities['First Aid'].healingFormula = '1'
