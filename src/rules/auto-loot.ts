/**
 * Auto-loot settings (autoLootSettings.ts): the chance, tier weights, the box types every crawler can get, and
 * extra types per crawler (keyed by actor id here, by character id in the app). The callers pass the box types
 * and tiers (lootData.ts), which keeps this free of the loot catalog.
 */

export type AutoLootSettings<Tier extends string = string, Type extends string = string> = {
  chancePercent: number
  weights: Record<Tier, number>
  /** Box types every crawler can receive. */
  allTypes: Type[]
  /** Extra box types per crawler, by actor id. A crawler gets `allTypes` plus these. */
  crawlerTypes: Record<string, Type[]>
  /** Roll for the party on its own every so many minutes of play. */
  timer: { enabled: boolean; minutes: number }
}

export const DEFAULT_TIER_WEIGHTS: Record<string, number> = { Bronze: 60, Silver: 25, Gold: 10, Platinum: 4, Legendary: 1, Celestial: 0 }

const bounded = (value: unknown, min: number, max: number, fallback: number) =>
  value !== null && value !== '' && Number.isFinite(Number(value)) ? Math.min(max, Math.max(min, Math.floor(Number(value)))) : fallback

/**
 * Saved settings, cleaned up against the box types and tiers that exist. Saves from before the table had a single
 * `types` list: that becomes the shared one.
 */
export function normalizeAutoLoot<Tier extends string, Type extends string>(
  value: unknown,
  available: readonly Type[],
  tiers: readonly Tier[],
): AutoLootSettings<Tier, Type> {
  const source = value && typeof value === 'object' ? (value as Record<string, any>) : {}
  const weights = source.weights && typeof source.weights === 'object' ? source.weights : {}
  const typeList = (list: unknown) => (Array.isArray(list) ? available.filter((type) => list.includes(type)) : undefined)
  return {
    chancePercent: bounded(source.chancePercent, 0, 100, 10),
    weights: Object.fromEntries(tiers.map((tier) => [tier, bounded(weights[tier], 0, 1000, DEFAULT_TIER_WEIGHTS[tier] ?? 0)])) as Record<Tier, number>,
    allTypes: typeList(source.allTypes) ?? typeList(source.types) ?? [...available],
    crawlerTypes: Object.fromEntries(
      Object.entries(source.crawlerTypes && typeof source.crawlerTypes === 'object' ? source.crawlerTypes : {})
        .map(([id, types]) => [id, typeList(types) ?? []] as const)
        .filter(([, types]) => types.length),
    ),
    timer: {
      enabled: !!source.timer?.enabled,
      minutes: bounded(source.timer?.minutes, 1, 1440, 60),
    },
  }
}

/**
 * Play time only counts while the GM and at least one player are online. Given the seconds counted so far
 * and the seconds just played, returns the new count and whether a roll is due (the count starts over).
 */
export function autoLootTick(counted: number, seconds: number, settings: { timer: { enabled: boolean; minutes: number } }, playersOnline: boolean) {
  if (!settings.timer.enabled || !playersOnline) return { counted, due: false }
  const total = Math.max(0, counted) + Math.max(0, seconds)
  const interval = settings.timer.minutes * 60
  return total >= interval ? { counted: total - interval, due: true } : { counted: total, due: false }
}

/** The box types one crawler can receive, in catalog order. */
export function crawlerLootTypes<Type extends string>(settings: Pick<AutoLootSettings<string, Type>, 'allTypes' | 'crawlerTypes'>, id: string, available: readonly Type[]): Type[] {
  const own = settings.crawlerTypes[id] ?? []
  return available.filter((type) => settings.allTypes.includes(type) || own.includes(type))
}
