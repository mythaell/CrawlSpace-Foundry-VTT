/** Race/class cap exceptions become available on floor 7. Gear and temporary buffs cannot raise caps. */
export function advancementCap(
  name: string,
  floor: string | number,
  abilities: {
    value?: string
    name?: string
    properties?: { effects?: { type?: string; target?: string; value?: string }[] }
  }[] = [],
) {
  const normalized = name.trim().toLowerCase()
  // The plain Heal spell stays at Rank 1 (Heal Others, Heal Self and Heal Critters advance as usual).
  if (normalized === 'heal') return 1
  if (!Number.isSafeInteger(Number(floor)) || Number(floor) < 7) return 15
  return abilities.some((ability) => {
    if (
      ability.properties?.effects?.some(
        (effect) =>
          effect.type === 'rankCap' &&
          Number(effect.value) === 20 &&
          (effect.target?.trim() === '*' ||
            (effect.target ?? '').split(/[,;\n]/).some((target) => target.trim().toLowerCase() === normalized)),
      )
    )
      return true
    const text = `${ability.value ?? ability.name ?? ''}`.toLowerCase()
    return (
      /rank\s*20|rank\s*(?:cap|limit)\s*(?:of|:)?\s*20/.test(text) &&
      !/(?:cannot|can't|may not)\s+(?:reach|advance to)\s+rank\s*20/.test(text) &&
      (/all\s+(?:skills|spells)/.test(text) || (normalized.length > 0 && text.includes(normalized)))
    )
  })
    ? 20
    : 15
}
