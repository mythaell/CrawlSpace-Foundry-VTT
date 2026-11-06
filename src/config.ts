/** System-wide constants. Values follow CrawlSpace's `src/shared` definitions. */

export const SYSTEM_ID = 'crawlspace'

export const STATS = {
  str: { code: 'STR', label: 'Strength' },
  int: { code: 'INT', label: 'Intelligence' },
  con: { code: 'CON', label: 'Constitution' },
  dex: { code: 'DEX', label: 'Dexterity' },
  cha: { code: 'CHA', label: 'Charisma' },
} as const
export type StatKey = keyof typeof STATS
export const STAT_KEYS = Object.keys(STATS) as StatKey[]
export const statKeyFromCode = (code: string): StatKey | null => {
  const lower = String(code ?? '').trim().toLowerCase().slice(0, 3)
  return (STAT_KEYS as string[]).includes(lower) ? (lower as StatKey) : null
}

/** Core Rulebook Table 10. */
export const DAMAGE_TYPES = [
  'Acid',
  'Bludgeoning',
  'Electric',
  'Fire',
  'Force',
  'Holy',
  'Ice',
  'Necrotic',
  'Piercing',
  'Poison',
  'Psychic',
  'Slashing',
  'Sonic',
] as const

export const GEAR_SLOTS = {
  head: 'Head',
  torso: 'Torso',
  arms: 'Arms',
  hands: 'Hands',
  legs: 'Legs',
  feet: 'Feet',
  accessory: 'Accessory',
} as const
export const ACCESSORY_LIMIT = 10

export const CHECK_TYPES = ['Unopposed', 'Opposed', 'Attack', 'Passive', 'Other'] as const

export const COMBAT_PHASES = [
  { id: 'mobDeclaration', label: 'Mob Action Declaration', side: 'mob' },
  { id: 'crawlerReaction', label: 'Crawler Reaction Phase', side: 'crawler' },
  { id: 'mobResolution', label: 'Mob Actions Resolution', side: 'mob' },
  { id: 'crawlerAction', label: 'Crawler Action Phase', side: 'crawler' },
  { id: 'cleanUp', label: 'Clean Up', side: null },
] as const

/** mobRules.ts bossRules. */
export const BOSS_TIERS = {
  Neighborhood: { statsPerLevel: 3, healthSlots: 10 },
  Borough: { statsPerLevel: 4, healthSlots: 15 },
  City: { statsPerLevel: 5, healthSlots: 20 },
  Province: { statsPerLevel: 6, healthSlots: 25 },
  Country: { statsPerLevel: 8, healthSlots: 30 },
  Floor: { statsPerLevel: 10, healthSlots: 40 },
} as const

/** mobRules.ts creatureSizes and creatureTypes. */
export const CREATURE_SIZES = [
  { value: '1', name: 'Tiny' },
  { value: '2', name: 'Small' },
  { value: '3', name: 'Petite' },
  { value: '4', name: 'Medium' },
  { value: '5', name: 'Large' },
  { value: '6', name: 'Huge' },
  { value: '7', name: 'Colossal' },
  { value: '8', name: 'Gargantuan' },
] as const
export const CREATURE_TYPES = ['Beastly', 'Undead', 'Humanoid', 'Ooze', 'Trapezoidal', 'Patchwork', 'Celestial', 'Deity'] as const

export const LOOT_TIERS = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legendary', 'Celestial'] as const

/** Health runs 0–110 in steps of 10: 110 is full, 10 is 0% HP (Dying), 0 is dead. */
export const HEALTH_MAX = 110
export const HEALTH_SLOTS = 10
