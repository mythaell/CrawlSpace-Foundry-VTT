/** Core Rulebook Table 10 and Health Menu, printed pp.93–94. */
export const damageTypes = [
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
export const damageResponseKinds = ['Resistance', 'Vulnerability', 'Immunity'] as const
export type DamageResponse = { damageType: string; response: string }

/** Only explicit mechanical fields are interpreted; conditional narrative rules stay GM rulings. */
export function damageResponsesFromEffects(effects: { type: string; target: string }[]): DamageResponse[] {
  const kinds: Record<string, string> = {
    damageResistance: 'Resistance',
    damageVulnerability: 'Vulnerability',
    damageImmunity: 'Immunity',
  }
  return effects
    .filter((effect) => kinds[effect.type] && effect.target.trim())
    .map((effect) => ({
      damageType: effect.target,
      response: kinds[effect.type],
    }))
}

export function applyDamageResponses(damage: number, types: readonly string[], responses: readonly DamageResponse[]) {
  const selected = [...new Set(types.map((type) => type.trim().toLowerCase()).filter(Boolean))]
  const portions = (selected.length ? selected : ['']).map((type) => {
    const matches = responses.filter((entry) => {
      const target = String(entry.damageType ?? '')
        .trim()
        .toLowerCase()
      return target === 'all' || (type && target === type)
    })
    const has = (kind: string) => matches.some((entry) => String(entry.response).trim().toLowerCase() === kind)
    let amount = damage / (selected.length || 1)
    const resistanceBlocked = has('resistance') ? amount / 2 : 0
    if (has('resistance')) amount /= 2
    if (has('vulnerability')) amount *= 2
    if (has('immunity')) amount = 0
    return { damageType: type || 'unspecified', damage: amount, immune: has('immunity'), resistanceBlocked }
  })
  return {
    damage: portions.reduce((total, portion) => total + portion.damage, 0),
    resistanceBlocked: portions.reduce((total, portion) => total + portion.resistanceBlocked, 0),
    portions,
  }
}
