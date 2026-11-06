import {
  attackRankUpgrades,
  spellRankUpgrades,
  utilityRankUpgrades,
  damageEffectRankUpgrades,
} from './characterBuilderUpgrades'
import { homebrewSkillIdentities, homebrewSkillText } from './characterBuilderHomebrew'
import type { ContentType } from '../api/types'
import {
  starterAttack,
  starterSpell,
  starterWeapon,
  starterEffects,
  starterUtilities,
} from './characterBuilderMechanics'

export const builderStages = ['childhood', 'adolescence', 'career', 'hobby'] as const
export type BuilderStage = (typeof builderStages)[number]
export type BuilderSpecies = 'human' | 'animal'
export type BuilderBackground = {
  name: string
  species: BuilderSpecies
  stage: BuilderStage
  skills: string[]
  rank: number
  homebrew?: boolean
}
const stageRanks = [1, 1, 3, 2]
const humanRows = [
  [
    'Latchkey Kid|Streetwise|Perception|Stealth',
    'Crafty Kid|Fabricate|Repair|Salvage',
    'Excitable Kid|Escape Artist|Endurance|Running',
    'Gymnast|Endurance|Jumping|Performance',
    'Military Brat|Deception|Streetwise|Tactics',
    'MMO Kid|Fabricate|Engineering|Tactics',
    'Only Child|Good First Impression|Investigation|Negotiation',
    'Outdoor Kid|Animal Handling|Climbing|Swimming',
    'Problem Child|Intimidate|Deception|Pugilism',
    'Scamp|Hide in Shadows|Jumping|Throwing',
    'Teacher’s Pet|Catcher|Perception|Good First Impression',
    'Wild Child|Stealth|Survival|Running',
  ],
  [
    'Family Farm|Animal Handling|Fabricate|Tracking',
    'Drama Nerd|Fabricate|Deception|Performance',
    'Drop-Out|Chopper Pilot|Streetwise|Survival',
    'Greek Life|Negotiation|Intimidate|Taunt',
    'Influencer|Negotiation|Persuasion|Performance',
    'Jock|Endurance|Jumping|Throwing',
    'McJob|Determine Value|Negotiation|Repair',
    'Popular|Good First Impression|Perception|Persuasion',
    'Religious|Catcher|First Aid|Persuasion',
    'Student Government|Deception|Persuasion|Investigation',
    'Nerd|Investigation|Repair|Fabricate',
    'Weirdo|Streetwise|Intimidate|Fabricate',
  ],
  [
    'Criminal|Deception|Stealth|Streetwise',
    'Service Industry|Dagger|Endurance|Sleight of Hand',
    'Small Business Owner|Determine Value|Negotiation|Perception',
    'Medical|Sleight of Hand|Detect Lies|First Aid',
    'Law Enforcement|Detect Lies|Handgun|Investigation',
    'Gig Worker|Driving|Escape Artist|Negotiation',
    'Teacher|Detect Lies|Perception|Performance',
    'Office Drone|Dumpster Diving|Endurance|Investigation',
    'Entertainer|Deception|Good First Impression|Performance',
    'Unhoused|Dumpster Diving|Streetwise|Survival',
    'Middle Manager|Deception|Intimidate|Negotiation',
    'Military|Handgun|Survival|Tactics',
  ],
  [
    'Collector|Fabricate|Determine Value|Investigation',
    'Cosplay|Fabricate|Performance|Salvage',
    'Drinker|Deception|Intimidate|Streetwise',
    'Gamer|Aiming|Perception|Tactics',
    'Gym Rat|Running|Endurance|Swimming',
    'Hunting|Tracking|Shotgun|Stealth',
    'Music|Perception|Performance|Sleight of Hand',
    'Motorsports|Driving|Repair|Salvage',
    'Climber|Climbing|Jumping|Endurance',
    'Pop Culture|Determine Value|Investigation|Perception',
    'Tinkering|Engineering|Repair|Salvage',
    'Travel|Endurance|Negotiation|Streetwise',
  ],
]
const animalRows = [
  [
    'Abandoned|Hide in Shadows|Endurance|Survival',
    'Farmed|Escape Artist|Climbing|Light on Your Feet',
    'Litter-Raised|Animal Handling|Detect Lies|Back Claw',
    'Pampered|Negotiation|Good First Impression|Persuasion',
    'Runt|Hide in Shadows|Escape Artist|Stealth',
    'Stray|Back Claw|Streetwise|Survival',
  ],
  [
    'Clever|Investigation|Detect Lies|Dodge',
    'Free Range|Escape Artist|Survival|Tracking',
    'Pack Mentality|Animal Handling|Persuasion|Tactics',
    'Mischievous|Deception|Persuasion|Sleight of Hand',
    'Watcher|Ambush|Investigation|Perception',
    'Well-Trained|Light on Your Feet|Catcher|Performance',
  ],
  [
    'Guard|Catcher|Perception|Taunt',
    'Pile of Floof|Escape Artist|Deception|Persuasion',
    'Scrapper|Light on Your Feet|Streetwise|Survival',
    'Show Animal|Good First Impression|Light on Your Feet|Performance',
    'Support Animal|Determine Value|First Aid|Perception',
    'Working|Animal Handling|Endurance|Perception',
  ],
  [
    'Chow Hound|Dumpster Diving|Investigation|Intimidate',
    'Cuddly|Good First Impression|Persuasion|Negotiation',
    'Curious|Climbing|Perception|Swimming',
    'Hunter|Hide in Shadows|Stealth|Tracking',
    'Playful|Persuasion|Dodge|Intimidate',
    'Social|Animal Handling|Taunt|Perception',
  ],
]
export const bookBackgrounds: BuilderBackground[] = (
  [
    ['human', humanRows],
    ['animal', animalRows],
  ] as const
).flatMap(([species, stages]) =>
  stages.flatMap((rows, stage) =>
    rows.map((row) => {
      const [name, ...skills] = row.split('|')
      return { name, species, stage: builderStages[stage], skills, rank: stageRanks[stage] }
    }),
  ),
)
const homebrewNames = [
  [
    'Apartment Explorer',
    'Workshop Helper',
    'Restless Scout',
    'Circus Summer',
    'Base-Hopping Kid',
    'Strategy Club Kid',
    'Grown-Up Table Kid',
    'Creekside Kid',
    'Hallway Menace',
    'Rooftop Kid',
    'Library Regular',
    'Woods Wanderer',
  ],
  [
    'Market-Garden Teen',
    'Backstage Crew',
    'Roadside Rebel',
    'Campus Organizer',
    'Stream Host',
    'Weekend Athlete',
    'Night-Shift Teen',
    'Social Connector',
    'Community Volunteer',
    'Debate Captain',
    'Robotics Student',
    'Alternative Scene Kid',
  ],
  [
    'Backroom Fixer',
    'Banquet Worker',
    'Market Trader',
    'Clinic Assistant',
    'Transit Inspector',
    'Delivery Rider',
    'Museum Educator',
    'Records Clerk',
    'Street Performer',
    'Nomadic Laborer',
    'Shift Supervisor',
    'Field Technician',
  ],
  [
    'Flea-Market Regular',
    'Prop Builder',
    'Pub Quiz Regular',
    'Puzzle Enthusiast',
    'Amateur Triathlete',
    'Wildlife Photographer',
    'Community Musician',
    'Kart Racer',
    'Cave Explorer',
    'Film Archivist',
    'Model Engineer',
    'Railway Rambler',
  ],
  ['Shelter Arrival', 'Barnyard Escapee', 'Crowded Nest', 'Indoor Royalty', 'Last Pick', 'Alley Forager'],
  ['Puzzle Feeder', 'Garden Roamer', 'Trail Companion', 'Cupboard Burglar', 'Window Sentry', 'Obedience Graduate'],
  [
    'Warehouse Watcher',
    'Sofa Monarch',
    'Territory Defender',
    'Agility Competitor',
    'Therapy Companion',
    'Orchard Helper',
  ],
  ['Snack Inspector', 'Lap Seeker', 'Fence Investigator', 'Night Prowler', 'Toy Collector', 'Park Celebrity'],
]
export const homebrewBackgrounds: BuilderBackground[] = bookBackgrounds.map((background) => {
  const group = builderStages.indexOf(background.stage) + (background.species === 'animal' ? 4 : 0)
  const siblings = bookBackgrounds.filter(
    (item) => item.species === background.species && item.stage === background.stage,
  )
  const row = siblings.findIndex((item) => item.name === background.name)
  const alternative =
    siblings[(row + 1) % siblings.length].skills.find((skill) => !background.skills.includes(skill)) ??
    bookBackgrounds.flatMap((item) => item.skills).find((skill) => !background.skills.includes(skill))!
  return {
    ...background,
    name: homebrewNames[group][row],
    skills: [...background.skills.slice(0, 2), alternative].map((name) => homebrewSkillIdentities[name].name),
    homebrew: true,
  }
})

export type BuilderCombat = {
  name: string
  kind: 'weapon' | 'unarmed' | 'spell'
  skill: string
  effect?: string
  homebrew?: boolean
}
const weaponNames = [
  'Club',
  'Improvised Weapons',
  'Warhammer',
  'Axe',
  'Dagger',
  'Longsword',
  'Bow',
  'Crossbow',
  'Handgun',
  'Shotgun',
  'Javelin',
  'Shuriken',
  'Slingshot',
  'Polearm',
  'Quarterstaff',
]
export const bookCombat: BuilderCombat[] = [
  ...weaponNames.map((name) => ({ name, skill: name, kind: 'weapon' as const })),
  ...['Pugilism|Iron Punch', 'Foot Soldier|Smush', 'Noggin Nocker|Skullcracker', 'Wrasslin’|Toss'].map((row) => {
    const [skill, effect] = row.split('|')
    return { name: skill, skill, effect, kind: 'unarmed' as const }
  }),
  ...['Dirt Clod', 'Fire Fingers', 'Frost Scar', 'Shock Treatment', 'Soul Collector'].map((name) => ({
    name,
    skill: name,
    kind: 'spell' as const,
  })),
]
const homebrewWeapons = [
  'Security Baton',
  'Wrench Bundle',
  'Demolition Maul',
  'Rescue Hatchet',
  'Utility Knife',
  'Practice Saber',
  'Field Bow',
  'Compact Crossbow',
  'Signal Pistol',
  'Coach Gun',
  'Survey Spear',
  'Steel Throwing Stars',
  'Pocket Catapult',
  'Pruning Glaive',
  'Walking Staff',
]
export const homebrewCombat: BuilderCombat[] = [
  ...homebrewWeapons.map((name) => ({ name, skill: `${name} Training`, kind: 'weapon' as const, homebrew: true })),
  ...[
    'Palm Fighter|Hammer Palm',
    'Heel Striker|Stomp Shock',
    'Shoulder Charger|Bone Rattle',
    'Grapple Artist|Ground Slam',
  ].map((row) => {
    const [skill, effect] = row.split('|')
    return { name: skill, skill, effect, kind: 'unarmed' as const, homebrew: true }
  }),
  ...['Gravel Flick', 'Ember Palm', 'Rime Lash', 'Static Jab', 'Spirit Siphon'].map((name) => ({
    name,
    skill: name,
    kind: 'spell' as const,
    homebrew: true,
  })),
]
export const builderStoryKeys = ['pastTrauma', 'looseEnds', 'regrets'] as const
export const bookStories: Record<(typeof builderStoryKeys)[number], string[]> = {
  pastTrauma: [
    'Someone I trusted mistreated me.',
    'I survived a serious accident.',
    'I witnessed someone die.',
    'Someone close betrayed me.',
    'A parent abandoned me.',
    'Open spaces frighten me.',
    'Darkness or isolation frightens me.',
    'My home was destroyed by fire.',
    'I was falsely accused.',
    'Someone close publicly humiliated me.',
    'I let another person take the blame.',
    'Heights frighten me.',
  ],
  looseEnds: [
    'My education was unfinished.',
    'I was about to launch a business.',
    'My novel was unfinished.',
    'I could not say farewell to someone who died.',
    'I was close to a discovery.',
    'I still owed someone a promise.',
    'My collection lacked one piece.',
    'My first performance never happened.',
    'I meant to end a relationship.',
    'My home purchase or renovation was unfinished.',
    'I never sent an important letter.',
    'I never visited my dream destination.',
  ],
  regrets: [
    'I never proposed.',
    'I declined a wonderful job.',
    'I failed to speak up.',
    'I protected myself instead of helping.',
    'I never said goodbye.',
    'I wasted years on something meaningless.',
    'I did something I knew was wrong.',
    'I lied to avoid an important occasion.',
    'My secret hurt another person.',
    'I never made an apology I owed.',
    'I abandoned someone in need.',
    'I put my trust in the wrong people.',
  ],
}
export const homebrewStories: Record<(typeof builderStoryKeys)[number], string[]> = {
  pastTrauma: [
    'A rescue team left me behind.',
    'I survived a collapsed tunnel.',
    'I lost a mentor during an emergency.',
    'Someone sold my private history.',
    'I was separated from my family during an evacuation.',
    'Crowded rooms make me panic.',
    'I dread the sound of alarms.',
    'A flood destroyed my neighborhood.',
    'I was blamed for a workplace disaster.',
    'My worst failure was broadcast online.',
    'I froze while someone else was hurt.',
    'I cannot stand being trapped underground.',
  ],
  looseEnds: [
    'My apprenticeship ended one test short.',
    'My community workshop never opened.',
    'My documentary remains unedited.',
    'I never returned a borrowed keepsake.',
    'My research partner is waiting for my findings.',
    'I promised to take care of a neighbor.',
    'One missing photograph completes my family album.',
    'My first exhibition was due next week.',
    'I left an argument unresolved.',
    'My family reunion never happened.',
    'A message of thanks is still in my drafts.',
    'I never retraced my grandparents’ journey.',
  ],
  regrets: [
    'I chose pride over reconciliation.',
    'I ignored an offer to start again.',
    'I laughed along when I should have objected.',
    'I took credit for someone else’s work.',
    'I missed a final phone call.',
    'I put ambition ahead of my friendships.',
    'I cheated someone who trusted me.',
    'I avoided a difficult but necessary conversation.',
    'I revealed a confidence to impress a stranger.',
    'I refused to admit I was wrong.',
    'I left a teammate to face the consequences.',
    'I dismissed a warning from someone who cared.',
  ],
}
export type BuilderSeed = { content_type: ContentType; name: string; data: Record<string, unknown> }
export const builderSeeds: BuilderSeed[] = [
  ...homebrewBackgrounds.map((background) => ({
    content_type: `background_${background.stage}` as ContentType,
    name: background.name,
    data: {
      species: background.species,
      stage: background.stage,
      skills: background.skills,
      builderSeed: `background:${background.species}:${background.stage}:${background.name}`,
    },
  })),
  ...homebrewCombat.flatMap((combat, index): BuilderSeed[] => [
    {
      content_type: combat.kind === 'spell' ? 'spell' : 'skill',
      name: combat.skill,
      data: {
        ...(combat.kind === 'spell'
          ? { ...starterSpell(index - 19), ...spellRankUpgrades(index - 19) }
          : { ...starterAttack(index), ...attackRankUpgrades(index) }),
        builderCombat: combat,
        builderSeed: `combat:${combat.skill}`,
      },
    },
    ...(combat.kind === 'weapon'
      ? [
          {
            content_type: 'weapon' as const,
            name: combat.name,
            data: {
              ...starterWeapon(index),
              builderCombat: combat,
              builderSeed: `weapon:${combat.name}`,
            },
          },
        ]
      : []),
    ...(combat.effect
      ? [
          {
            content_type: 'skill' as const,
            name: combat.effect,
            data: {
              ...starterEffects[combat.effect],
              ...damageEffectRankUpgrades[combat.effect],
              checkType: 'Passive',
              combatRelated: true,
              builderSeed: `effect:${combat.effect}`,
            },
          },
        ]
      : []),
  ]),
  ...Object.entries(homebrewSkillIdentities).map(([source, identity]): BuilderSeed => {
    const combatIndex = bookCombat.findIndex((combat) => combat.skill === source)
    const mechanics =
      combatIndex >= 0 && combatIndex < 19
        ? { ...starterAttack(combatIndex), ...attackRankUpgrades(combatIndex) }
        : { ...starterUtilities[source], ...utilityRankUpgrades(source) }
    if (!mechanics) throw new Error(`Missing background skill mechanics: ${source}`)
    const data = Object.fromEntries(
      Object.entries(mechanics).map(([key, value]) => [
        key,
        typeof value === 'string' ? homebrewSkillText(value) : value,
      ]),
    )
    return {
      content_type: 'skill',
      name: identity.name,
      data: {
        ...data,
        details: `${identity.description}\n\n${data.details}`,
        builderSeed: `background-skill:${identity.name}`,
      },
    }
  }),
  ...builderStoryKeys.map((key) => ({
    content_type: 'reference_table' as const,
    name: `Crawler Creation: ${key === 'pastTrauma' ? 'Past Traumas' : key === 'looseEnds' ? 'Loose Ends' : 'Regrets'}`,
    data: {
      builderSeed: `story:${key}`,
      builderStory: key,
      rollFormula: '1d12',
      columns: ['Roll', 'Story'],
      rows: homebrewStories[key].map((story, index) => [String(index + 1), story]),
    },
  })),
]
