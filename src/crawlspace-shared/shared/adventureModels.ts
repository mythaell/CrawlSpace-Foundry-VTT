export type AdventureKind = 'quests' | 'neighborhoods'
export type AdventureRecord = { localId: string; name: string; data: Record<string, any> }
export type AdventureReference = AdventureRecord & { contentType?: string }
export type AdventureEntry = Record<string, any>

export const adventureText = (value: unknown): string => (value == null ? '' : String(value))
export const adventureEntries = (data: Record<string, any>, key: string): AdventureEntry[] =>
  Array.isArray(data[key]) ? data[key] : []

export function createAdventureData(kind: AdventureKind): Record<string, any> {
  return {
    summary: '',
    overview: '',
    tags: '',
    strongStarts: '',
    strongStartEntries: [],
    storyArcs: '',
    storyArcEntries: [],
    mobs: [],
    environment: '',
    traps: '',
    trapEntries: [],
    items: '',
    itemEntries: [],
    questItems: '',
    questItemEntries: [],
    achievementsRewards: '',
    achievementEntries: [],
    rewardEntries: [],
    npcs: '',
    npcEntries: [],
    bossBattle: '',
    bosses: [],
    grindingNotes: '',
    grindingEvents: [],
    grindingComplications: [],
    ...(kind === 'neighborhoods'
      ? { quarters: Array.from({ length: 4 }, (_, index) => ({ name: `Quarter ${index + 1}`, description: '' })) }
      : { questStages: [] }),
  }
}

export const adventureSections = (kind: AdventureKind) => [
  'Summary & Overview',
  'Hooks & Stories',
  'Mobs & Boss Battle',
  'Environment',
  'Traps',
  'Items & Quest Items',
  'Achievements & Rewards',
  'Grinding for Experience',
  kind === 'neighborhoods' ? 'Exploring the Neighborhood' : 'Quest Stages',
  'NPCs',
]

const itemTypes = new Set([
  'weapon',
  'consumable',
  'tattoo',
  'other',
  'equipment_head',
  'equipment_torso',
  'equipment_arms',
  'equipment_hands',
  'equipment_legs',
  'equipment_feet',
  'equipment_accessory',
])
export type AdventureLinkKind = 'mob' | 'boss' | 'trap' | 'item' | 'achievement' | 'reward' | 'npc'
export function referencesFor(references: AdventureReference[], kind: AdventureLinkKind): AdventureReference[] {
  return references.filter((entry) =>
    kind === 'boss'
      ? entry.contentType === 'mob' && entry.data.kind === 'boss'
      : kind === 'reward'
        ? entry.contentType === 'loot_box' || itemTypes.has(entry.contentType ?? '')
        : kind === 'item'
          ? itemTypes.has(entry.contentType ?? '')
          : entry.contentType === kind,
  )
}

export function resolveAdventureLink(entry: AdventureEntry, references: AdventureReference[]) {
  const reference = references.find((candidate) => candidate.localId === entry.ref)
  return {
    reference,
    name: reference?.name || adventureText(entry.name) || 'Untitled entry',
    missing: Boolean(entry.ref && !reference),
  }
}
