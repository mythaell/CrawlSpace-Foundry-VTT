export const lootTiers = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legendary', 'Celestial'] as const
export type LootTier = (typeof lootTiers)[number]
export const lootTypes = [
  'Adventurer',
  'Apparel',
  "Assassin's",
  "Asshole's",
  'Benefactor',
  'Boss',
  'Bounty',
  "Crafter's",
  'Goblin',
  'Looter',
  'Lucky Bastard',
  'Lucky Bitch',
  "Mechanic's",
  'Pet',
  'Quest',
  'Savage',
  'Earth',
  "Survivor's",
  'Weapon',
  'Custom',
] as const
export type LootType = (typeof lootTypes)[number]
export const tierRules: Record<
  LootTier,
  {
    items: number
    consumables: number
    potions: number
    rolls: number
    gold: string
    dice: number
    sides: number
    multiplier: number
  }
> = {
  Bronze: { items: 1, consumables: 2, potions: 0, rolls: 0, gold: '1d10', dice: 1, sides: 10, multiplier: 1 },
  Silver: { items: 1, consumables: 2, potions: 0, rolls: 1, gold: '1d10 × 100', dice: 1, sides: 10, multiplier: 100 },
  Gold: { items: 1, consumables: 2, potions: 0, rolls: 2, gold: '1d6 × 1,000', dice: 1, sides: 6, multiplier: 1000 },
  Platinum: {
    items: 1,
    consumables: 2,
    potions: 1,
    rolls: 3,
    gold: '2d6 × 1,000',
    dice: 2,
    sides: 6,
    multiplier: 1000,
  },
  Legendary: {
    items: 2,
    consumables: 2,
    potions: 1,
    rolls: 4,
    gold: '1d10 × 10,000',
    dice: 1,
    sides: 10,
    multiplier: 10000,
  },
  Celestial: { items: 2, consumables: 2, potions: 1, rolls: 5, gold: 'No Gold', dice: 0, sides: 0, multiplier: 0 },
}
export const categories = ['Mundane / Weapon', 'Clothing', 'Accessory'] as const
export type LootCategory = (typeof categories)[number]
export const uniqueResults = [
  "GM's choice",
  'Interacts with a god',
  'Item is intelligent',
  'Summons minions to fight for the crawler',
  'Mimics the encounter where this box was earned',
  "Player's choice, with GM approval",
]
export function propertyLabels(category: LootCategory) {
  return [
    'Stat Bonus',
    'Skill Bonus',
    'Buff (no Stat/Skill bonus)',
    category === 'Clothing'
      ? 'Uncommon damage resistance'
      : category === 'Accessory'
        ? 'Recovery / Restore once per Floor'
        : 'Passive Skill Rank',
    category === 'Clothing' ? '+1 Damage Resistance' : 'Inherent Spell',
    'Something Unique',
  ]
}
export type LootObject = {
  name: string
  type: 'other' | 'weapon' | 'equipment' | 'tattoos'
  slot: string
  tags: string
}
const objects = (names: string, type: LootObject['type'], slot: string, tags: string): LootObject[] =>
  names.split('|').map((name) => ({ name, type, slot, tags }))
export const objectPools: Record<LootCategory, LootObject[]> = {
  'Mundane / Weapon': [
    ...objects(
      'Dagger|Stiletto|Garrote|Poison Needle|Razor',
      'weapon',
      'melee',
      'stealth assassin finesse poison combat savage',
    ),
    ...objects(
      'Axe|Warhammer|Quarterstaff|Spear|Crowbar|Meat Cleaver|Pitchfork|Chainsaw|Spiked Plunger|Sword|Frying Pan',
      'weapon',
      'melee',
      'combat weapon savage hunt bounty destroy',
    ),
    ...objects('Crossbow|Bow|Slingshot|Harpoon Launcher', 'weapon', 'ranged', 'combat hunt bounty weapon'),
    ...objects('Shield|Tower Shield|Defensive Buckler', 'equipment', 'Hands', 'apparel defense combat survival'),
    ...objects('Protective Goggles', 'equipment', 'Head', 'apparel defense technical'),
    ...objects('Utility Harness', 'equipment', 'Torso', 'apparel carrying adventure'),
    ...objects(
      'Socket Wrench|Ratchet|Jumper Cables|Grease Gun|Toolbox|Soldering Iron',
      'other',
      '',
      'mechanic technical crafting vehicle',
    ),
    ...objects(
      'Alchemy Kit|Crafting Hammer|Needle Kit|Salvage Magnet|Portable Workbench|Material Satchel',
      'other',
      '',
      'crafter crafting material tools',
    ),
    ...objects(
      'Rope|Lantern|Compass|Map Case|Canteen|Canoe Paddle|Torch|Foldable Shovel',
      'other',
      '',
      'adventure survival tracking hunt',
    ),
    ...objects(
      'Treasure Scoop|Loot Sack|Coin Sorter|Inventory Ledger',
      'other',
      '',
      'looter inventory carrying treasure acquisition',
    ),
    ...objects('Dice Cup|Gambling Chips|Scratcher Stylus|Roulette Wheel', 'other', '', 'luck gambling random risk'),
    ...objects('Detonator|Goblin Blast Kit|Bomb Disposal Spoon', 'other', '', 'goblin explosives destructive'),
    ...objects('Pet Brush|Treat Dispenser|Squeaky Bone|Pet Training Whistle', 'other', '', 'pet animal'),
    ...objects(
      'Participation Trophy|Toilet Brush|Complaint Form|Selfie Stick|Tax Receipt|Divorce Papers',
      'other',
      '',
      'asshole bizarre embarrassing ai punishment selfish',
    ),
  ],
  Clothing: [
    ...objects(
      'Jacket|Shirt|Cuirass|Bathrobe|Cheese Grater Vest|Chainmail|Apron',
      'equipment',
      'Torso',
      'apparel defense survival',
    ),
    ...objects('Leggings|Pants|Trousers|Kilt|Armored Underpants', 'equipment', 'Legs', 'apparel defense'),
    ...objects('Boots|Slippers|Sneakers|Clown Shoes', 'equipment', 'Feet', 'apparel survival escape'),
    ...objects('Gloves|Gauntlets|Mittens|Buckler|Oven Mitts', 'equipment', 'Hands', 'apparel defense combat'),
    ...objects('Helmet|Hat|Skullcap|Beret|Traffic Cone', 'equipment', 'Head', 'apparel defense'),
    ...objects('Elbow Pads|Bracers|Sleeves|Arm Guards', 'equipment', 'Arms', 'apparel defense combat'),
    ...objects('Silent Boots', 'equipment', 'Feet', 'assassin stealth finesse'),
    ...objects('Shadow Hood', 'equipment', 'Head', 'assassin stealth finesse'),
    ...objects('Mechanic Overalls|Crafting Apron', 'equipment', 'Torso', 'mechanic crafter crafting technical'),
    ...objects('Pet Handler Jacket|Biscuit Pocket Vest', 'equipment', 'Torso', 'pet animal'),
    ...objects('Bombproof Jacket|Goblin Blast Apron', 'equipment', 'Torso', 'goblin explosives destructive'),
    ...objects('Tracking Boots|Hunter Gaiters', 'equipment', 'Feet', 'bounty hunt tracking savage'),
    ...objects('Deep Pocket Coat|Treasure Vest', 'equipment', 'Torso', 'looter inventory carrying'),
    ...objects('Lucky Underpants', 'equipment', 'Legs', 'luck gambling ai punishment asshole bizarre'),
    ...objects('Gambler Hat|AI Shame Cap', 'equipment', 'Head', 'luck gambling ai punishment asshole bizarre'),
  ],
  Accessory: [
    ...objects(
      'Ring|Necklace|Bracelet|Belt|Patch|Amulet|Brooch|Earring|Cloak|Lanyard|Tie|Medallion|Purple Plume',
      'equipment',
      'Accessory',
      'apparel adventure',
    ),
    ...objects('Assassin Signet|Poison Locket|Shadow Pin', 'equipment', 'Accessory', 'assassin stealth finesse poison'),
    ...objects(
      'Tracking Charm|Hunter Pendant|Bounty Badge',
      'equipment',
      'Accessory',
      'hunt bounty tracking savage combat',
    ),
    ...objects('Explosive Belt|Goblin Fuse Ring', 'equipment', 'Accessory', 'goblin explosives destructive'),
    ...objects(
      'Tool Belt|Gear Bracelet|Engineer Badge',
      'equipment',
      'Accessory',
      'crafter mechanic tools crafting technical vehicle',
    ),
    ...objects('Treat Pouch|Pet Handler Charm|Collar Clip', 'equipment', 'Accessory', 'pet animal'),
    ...objects(
      'Treasure Keyring|Coin Purse|Inventory Pin',
      'equipment',
      'Accessory',
      'looter treasure carrying inventory',
    ),
    ...objects(
      'Lucky Horseshoe|Poker Chip Pendant|AI Penalty Badge|Loaded Dice Charm',
      'equipment',
      'Accessory',
      'luck gambling random ai punishment',
    ),
    ...objects(
      'Medic Charm|Survival Belt|Recovery Pendant',
      'equipment',
      'Accessory',
      'survival recovery healing defense',
    ),
    ...objects('Tough Guy Tattoo|Regrettable Tattoo|Tramp Stamp', 'tattoos', 'Accessory', 'bizarre asshole combat'),
  ],
}
export const themes: Record<LootType, string> = {
  Adventurer: 'adventure survival combat',
  Apparel: 'apparel defense',
  "Assassin's": 'assassin stealth finesse poison',
  "Asshole's": 'asshole bizarre embarrassing selfish',
  Benefactor: '',
  Boss: '',
  Bounty: 'bounty hunt tracking combat',
  "Crafter's": 'crafter crafting material tools',
  Goblin: 'goblin explosives destructive',
  Looter: 'looter treasure acquisition carrying inventory',
  'Lucky Bastard': 'luck gambling random risk',
  'Lucky Bitch': 'luck ai punishment random',
  "Mechanic's": 'mechanic technical vehicle crafting',
  Pet: 'pet animal',
  Quest: '',
  Savage: 'savage combat hunt',
  Earth: '',
  "Survivor's": 'survival recovery healing defense',
  Weapon: 'weapon combat',
  Custom: '',
}
export { nameWords } from './lootNames'
