/** Original identities for background skills. Source names are migration keys only. */
export const homebrewSkillIdentities: Record<string, { name: string; description: string }> = Object.fromEntries(
  [
    ['Streetwise', 'Backstreet Sense', 'You know which doors open for a quiet favor and which alleys end in trouble.'],
    ['Perception', 'Sharp Senses', 'A shifted shadow or an unfamiliar sound rarely escapes your attention.'],
    ['Fabricate', 'Scrapcraft', 'Discarded odds and ends become something useful in your hands.'],
    ['Repair', 'Patchwork Fix', 'You coax battered equipment back into service with patience and a few spare parts.'],
    ['Escape Artist', 'Slip the Knot', 'A little slack and a well-timed twist can turn captivity into opportunity.'],
    ['Endurance', 'Lasting Grit', 'You keep going when comfort and common sense suggest stopping.'],
    ['Jumping', 'Gap Leaper', 'You size up a gap, plant your feet, and commit to the landing.'],
    ['Deception', 'Silver Bluff', 'A convincing delivery can make a flimsy story sound perfectly ordinary.'],
    ['Engineering', 'Junkyard Design', 'You see workable mechanisms hiding inside piles of mismatched parts.'],
    [
      'Good First Impression',
      'Winning Introduction',
      'You find the friendly opening before a stranger finds a reason to distrust you.',
    ],
    ['Investigation', 'Clue Chaser', 'You connect the overlooked details until an explanation begins to take shape.'],
    ['Animal Handling', 'Creature Rapport', 'You read an animal’s signals and answer with a calm, steady presence.'],
    ['Climbing', 'Sure Grip', 'Each handhold is another small promise that you will reach the top.'],
    ['Intimidate', 'Hard Stare', 'You can make your intentions clear without raising your voice.'],
    ['Hide in Shadows', 'Shadow Nest', 'You settle into a quiet pocket of cover and let searching eyes slide past.'],
    ['Catcher', 'Take the Hit', 'When danger reaches for a companion, you put yourself in its way.'],
    ['Stealth', 'Quiet Passage', 'You move through a watched space without becoming its most interesting feature.'],
    [
      'Survival',
      'Wilderness Grit',
      'Bad weather and empty supplies become problems to solve rather than reasons to quit.',
    ],
    ['Chopper Pilot', 'Rotor Wrangler', 'You keep a temperamental rotorcraft level when the sky refuses to cooperate.'],
    ['Negotiation', 'Price Haggler', 'You know when to press a deal and when to let a merchant do the talking.'],
    ['Persuasion', 'Gentle Nudge', 'You frame an idea so another person can see themselves choosing it.'],
    [
      'Determine Value',
      'Treasure Appraisal',
      'A glance through your belongings tells you which pieces deserve extra care.',
    ],
    ['First Aid', 'Field Dressing', 'You steady a wounded companion and make the most of a brief chance to help.'],
    ['Dagger', 'Close Blade', 'You keep a short blade moving through the smallest opening in a defense.'],
    ['Sleight of Hand', 'Light Fingers', 'Your hands finish their work while attention is still somewhere else.'],
    ['Detect Lies', 'Read the Tell', 'You listen for the awkward pause that a polished story cannot quite conceal.'],
    ['Handgun', 'Sidearm Drill', 'You bring a compact firearm onto target with practiced, economical movement.'],
    ['Driving', 'Road Wrangler', 'You feel a vehicle’s limits through the wheel and keep it moving inside them.'],
    ['Dumpster Diving', 'Discard Delver', 'Other people throw away possibilities; you take the time to find them.'],
    ['Performance', 'Crowd Charmer', 'You turn a practiced routine into a moment an audience wants to remember.'],
    ['Aiming', 'Patient Sight', 'You wait for the smallest opening and make a difficult shot count.'],
    ['Running', 'Burst Runner', 'You find another burst of speed just when the distance matters most.'],
    ['Tracking', 'Trail Reader', 'Bent grass and scuffed dust tell you where another traveler went.'],
    [
      'Shotgun',
      'Scattergun Drill',
      'You handle a close-range firearm with a firm stance and deliberate follow-through.',
    ],
    ['Back Claw', 'Raking Talons', 'You twist into a sharp raking strike with the claws your body provides.'],
    ['Ambush', 'Waiting Pounce', 'You choose the right approach and the right moment to become a threat.'],
    ['Light on Your Feet', 'Springstep', 'Your animal body turns a running start into a startling leap.'],
    ['Dodge', 'Sidestep Instinct', 'You shift out of danger before thought can slow the movement.'],
    ['Taunt', 'Needling Remark', 'One perfectly irritating remark can make an enemy forget its original target.'],
  ].map(([source, name, description]) => [source, { name, description }]),
)

/** Replace references to source skills in generated descriptions and skill snapshots. */
export function homebrewSkillText(text: string): string {
  const names = Object.keys(homebrewSkillIdentities).sort((a, b) => b.length - a.length)
  const pattern = new RegExp(
    `\\b(?:${names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})\\b`,
    'g',
  )
  return text.replace(pattern, (name) => homebrewSkillIdentities[name].name)
}
