export type HealingUnit = 'slots'
export type HealingFields = {
  isHealing?: boolean
  healingFormula?: string
  rank5HealingFormula?: string
  rank10HealingFormula?: string
  rank15HealingFormula?: string
  healingUnit?: HealingUnit
}
export type HealingApplication = { amount: number; unit: HealingUnit }

export function healingShowsRoll(name: string, formula: string) {
  return /\d*d\d+/i.test(formula) || /^heal(self|others?)$/.test(name.toLowerCase().replace(/[^a-z]/g, ''))
}

/** Older check cards may lack a separate amount; never heal from a d20 check total. */
export function healingCardAmount(card: {
  result: number | null
  formula: string
  label: string | null
  healing_data?: { amount?: number; isCheck?: boolean; unit?: string } | null
  modifiers?: { label: string; value: number }[]
}) {
  if (!card.healing_data || card.result === null) return undefined
  if (card.healing_data.amount !== undefined) return card.healing_data.amount
  if (
    card.healing_data.isCheck ||
    (/\d*d20\b/i.test(card.formula) &&
      /^(?:first\s*aid|field\s*dressing)(?:\s+check)?$/i.test(card.label?.trim() ?? ''))
  ) {
    if (/^(?:first\s*aid|field\s*dressing)(?:\s+check)?$/i.test(card.label?.trim() ?? '')) {
      const rank = (card.modifiers ?? [])
        .filter((modifier) => /^(rank|skill rank|active (skill|rank) bonuses)$/i.test(modifier.label))
        .reduce((total, modifier) => total + modifier.value, 0)
      return rank >= 15 ? 2 : 1
    }
    return undefined
  }
  return card.result
}

/** Older records with healing formulas remain enabled until explicitly unchecked. */
export function isHealingSource(source: HealingFields) {
  return typeof source.isHealing === 'boolean'
    ? source.isHealing
    : [
        source.healingFormula,
        source.rank5HealingFormula,
        source.rank10HealingFormula,
        source.rank15HealingFormula,
      ].some((value) => typeof value === 'string' && Boolean(value.trim()))
}

export function normalizeHealing(source: Record<string, unknown>): Required<HealingFields> {
  return {
    isHealing: isHealingSource(source as HealingFields),
    healingFormula: typeof source.healingFormula === 'string' ? source.healingFormula : '',
    rank5HealingFormula: typeof source.rank5HealingFormula === 'string' ? source.rank5HealingFormula : '',
    rank10HealingFormula: typeof source.rank10HealingFormula === 'string' ? source.rank10HealingFormula : '',
    rank15HealingFormula: typeof source.rank15HealingFormula === 'string' ? source.rank15HealingFormula : '',
    healingUnit: 'slots',
  }
}
export function rankHealingFormula(source: HealingFields, rank: number) {
  if (!isHealingSource(source)) return ''
  const resolve = (formula: string) => formula.replace(/\bRANK_DIE\b/gi, `(${healingRankDie(rank)})`)
  for (const tier of [15, 10, 5] as const) {
    const formula = source[`rank${tier}HealingFormula`]?.trim()
    if (rank >= tier && formula) return resolve(formula)
  }
  return resolve(source.healingFormula?.trim() ?? '')
}

/** Core Rulebook p.176, Table 37. Used by Nature's Breath at every rank. */
export function healingRankDie(rank: number) {
  if (rank >= 20) return '2d10'
  if (rank >= 18) return '1d10+1d8'
  if (rank >= 16) return '2d8'
  if (rank >= 14) return '1d8+1d6'
  if (rank >= 12) return '1d12'
  if (rank >= 10) return '1d10'
  if (rank >= 8) return '1d8'
  if (rank >= 6) return '1d6'
  if (rank >= 4) return '1d4'
  if (rank >= 2) return '1d2'
  return rank >= 1 ? '1' : '0'
}

/** Restore whole missing slots in order; neither fractional slots nor leftover points carry over. */
export function healingSlots(amount: number, missingValues: number[]) {
  if (!Number.isFinite(amount) || amount <= 0) return 0
  return Math.min(missingValues.length, Math.floor(amount))
}
