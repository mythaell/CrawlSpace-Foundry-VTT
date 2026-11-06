/** Crawler/creature ability score bands. Blank or invalid values are unset. */
export function abilityScoreModifier(value: unknown): number {
  if (value === '' || value === undefined || value === null || !Number.isFinite(Number(value))) return 0
  const tier = [2, 5, 9, 19, 49, 99, 149, 199, 299].findIndex((limit) => Number(value) <= limit)
  return tier < 0 ? 10 : tier + 1
}
