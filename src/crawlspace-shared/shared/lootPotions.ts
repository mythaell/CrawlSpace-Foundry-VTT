import type { DatabaseContent } from '../api/types'
import type { LootTier } from './lootData'

export type PotionKind =
  'healing' | 'good' | 'standard' | 'supreme' | 'mana' | 'antidote' | 'minorInjury' | 'majorInjury' | 'unsupported'
export const potionRules: Record<LootTier, Partial<Record<PotionKind, string>>> = {
  Bronze: { healing: '1d3', mana: '1d2', antidote: '1d3' },
  Silver: { healing: '1d3+1', good: '1d3', mana: '1d2+1', antidote: '1d4' },
  Gold: { healing: '1d4+1', good: '1d3+1', mana: '1d3+1', antidote: '1d6' },
  Platinum: { healing: '2d4+2', good: '1d6', standard: '1d4', mana: '1d4+1', antidote: '1d10' },
  Legendary: { good: '2d6', standard: '1d4+3', supreme: '1d4', mana: '1d4+4', antidote: '1d6+4' },
  Celestial: { supreme: '1d10', mana: '1d10', antidote: '1d10+4' },
}

export function potionKind(content: DatabaseContent): PotionKind | undefined {
  const name = content.name
    .toLowerCase()
    .replace(/^(bronze|silver|gold|platinum|legendary|celestial)\s+/, '')
    .replace(/[^a-z0-9]/g, '')
  if (/^(?:healingpotion|healthpotion|potionofhealing|healp(et|critter)potion)$/.test(name)) return 'healing'
  if (/^(?:goodhealingpotion|potionofgoodhealing)$/.test(name)) return 'good'
  // Retain compatibility with the original spreadsheet's misspelling.
  if (/^(?:standardheali(?:ng|on)potion|potionofstandardhealing)$/.test(name)) return 'standard'
  if (/^(?:supremehealingpotion|potionofsupremehealing)$/.test(name)) return 'supreme'
  if (/^(?:manapotion|potionofmana)$/.test(name)) return 'mana'
  if (name.includes('antidote')) return 'antidote'
  if (/minor.*injur|injur.*minor/.test(name)) return 'minorInjury'
  if (/major.*injur|injur.*major/.test(name)) return 'majorInjury'
  if (/potion/.test(name) && /healing|manarefill|severeinjur/.test(name)) return 'unsupported'
  return undefined
}

export function potionQuantityFormula(tier: LootTier, kind: PotionKind) {
  return potionRules[tier][kind === 'minorInjury' || kind === 'majorInjury' ? 'antidote' : kind]
}

export function rollPotionQuantity(formula: string, rng: () => number) {
  const match = /^(\d+)d(\d+)(?:\+(\d+))?$/.exec(formula)
  if (!match) throw new Error('Invalid potion quantity formula.')
  const [, dice, sides, bonus] = match
  return Array.from({ length: Number(dice) }, () =>
    Math.min(Number(sides), Math.floor(rng() * Number(sides)) + 1),
  ).reduce((total, roll) => total + roll, Number(bonus ?? 0))
}

export type ConsumableFamily = 'healing' | 'mana' | 'remedy' | 'other'
export function consumableFamily(content: DatabaseContent): ConsumableFamily {
  const kind = potionKind(content)
  if (kind === 'healing' || kind === 'good' || kind === 'standard' || kind === 'supreme') return 'healing'
  if (kind === 'mana') return 'mana'
  if (kind === 'antidote' || kind === 'minorInjury' || kind === 'majorInjury') return 'remedy'
  return 'other'
}
/** Family weights stay independent of how many records exist in the database. */
export const consumableFamilyWeights: Record<ConsumableFamily, number> = {
  healing: 45,
  mana: 30,
  remedy: 10,
  other: 15,
}

/** Box potions that the database already defines. Matching ignores spacing and punctuation. */
export type DatabasePotion = 'skill1' | 'skill2' | 'skill3' | 'skill5' | 'skillMax' | 'earthHobby'
const databasePotionNames: Record<DatabasePotion, RegExp> = {
  skill1: /^(?:\+?1skillpotion|potionof\+?1skill|skillrankpotion\+?1)$/,
  skill2: /^(?:\+?2skillpotion|potionof\+?2skill|skillrankpotion\+?2)$/,
  skill3: /^(?:\+?3skillpotion|potionof\+?3skill|skillrankpotion\+?3)$/,
  skill5: /^(?:\+?5skillpotion|potionof\+?5skill|skillrankpotion\+?5)$/,
  skillMax: /^(?:skillrankpotionmax|maxskillpotion|potionofmaximumskill|maximumskillpotion)$/,
  earthHobby: /^earthhobbypotion$/,
}
export function skillPotionKind(rank: number): DatabasePotion | undefined {
  return ({ 1: 'skill1', 2: 'skill2', 3: 'skill3', 5: 'skill5', 15: 'skillMax' } as const)[rank]
}
/** The GM's Homebrew copy wins over the game database so deliberate edits are kept. */
export function findDatabasePotion<T extends DatabaseContent & { source?: string }>(
  database: readonly T[],
  kind: DatabasePotion,
): T | undefined {
  const matches = database.filter((entry) =>
    databasePotionNames[kind].test(entry.name.toLowerCase().replace(/[^a-z0-9+]/g, '')),
  )
  return matches.find((entry) => entry.source === 'homebrew') ?? matches[0]
}
