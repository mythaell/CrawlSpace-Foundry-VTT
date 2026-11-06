import type { BuffEntry, EffectProperty } from './contentModels'
import { evaluateHealthExpression } from './health'

export type StatLookup = (stat: string) => number
export const effectRankBands = [1, 5, 10, 15] as const
export const rankBand = (rank: number) => [...effectRankBands].reverse().find((band) => rank >= band) ?? 1

/** An effect with no bands chosen is active at every Rank. */
export const effectActiveAtRank = (effect: Pick<EffectProperty, 'ranks'>, rank: number) =>
  !effect.ranks?.length || effect.ranks.includes(rankBand(rank))

/** The Rank a row switches on at: its Rank input, or the lowest band chosen in the database. 0 means always. */
export const effectActivationRank = (effect: Pick<EffectProperty, 'ranks' | 'requiredRank'>) =>
  Number(effect.requiredRank) || (effect.ranks?.length ? Math.min(...effect.ranks) : 0)

/** A cast condition keeps the Rank it was cast at. Otherwise the sheet's Rank input applies, or Rank 1. */
export const conditionRank = (buff: Pick<BuffEntry, 'castBy' | 'resolvedRank' | 'rank'>) =>
  buff.castBy?.rank ?? buff.resolvedRank ?? (Number(buff.rank) || 1)

/** The Damage Modifiers on at the condition's Rank. A higher Rank's row replaces lower rows for the same damage. */
export function conditionDamageEffects(buff: BuffEntry) {
  const rank = conditionRank(buff)
  const key = (effect: EffectProperty) =>
    JSON.stringify([effect.damageScope ?? '', effect.target, effect.damageTypes ?? []])
  const reached = (buff.properties?.effects ?? []).filter(
    (effect) =>
      effect.type === 'damageBonus' && effectActiveAtRank(effect, rank) && effectActivationRank(effect) <= rank,
  )
  return reached.filter(
    (effect) =>
      !effectActivationRank(effect) ||
      !reached.some(
        (other) => key(other) === key(effect) && effectActivationRank(other) > effectActivationRank(effect),
      ),
  )
}

const withStats = (text: string, stat: StatLookup) =>
  text.replace(/\b(str|int|con|dex|cha)\b/gi, (key) => String(stat(key.toUpperCase())))

/** A plain number or stat key, such as `2`, `-dex` or `2*int`. Null when it cannot be worked out. */
export function effectNumber(value: string | number | null | undefined, stat: StatLookup = () => 0) {
  // Saved data can lack a value or hold a number; neither may crash the sheet showing it.
  const text = withStats(String(value ?? '').trim().replace(/^\+/, ''), stat).replace(/--/g, '+')
  if (!text) return null
  const result = evaluateHealthExpression(text)
  return result !== null && Number.isFinite(result) ? result : null
}

/** `*2` or `x2`; null for any other kind of value. */
export function effectMultiplier(value: string, stat: StatLookup = () => 0) {
  const match = /^\s*[*x]\s*(.+)$/i.exec(value)
  return match ? effectNumber(match[1], stat) : null
}

/** How far a value moves `base`: `+2`, `-dex`, `*2` or `10%`. */
export function effectChange(value: string, base: number, stat: StatLookup = () => 0) {
  const multiplier = effectMultiplier(value, stat)
  if (multiplier !== null) return base * multiplier - base
  const percent = /^\s*([+-]?\d+(?:\.\d+)?)\s*%\s*$/.exec(value)
  if (percent) return Math.floor((base * Number(percent[1])) / 100)
  return effectNumber(value, stat) ?? 0
}

/** The Stat Mod effects on one stat, added to its modifier. `-dex` uses the stat's own modifier. */
export const statModifierChange = (
  effects: readonly Pick<EffectProperty, 'type' | 'target' | 'value'>[],
  code: string,
  base: number,
  stat: StatLookup,
) =>
  effects
    .reduce((total, effect) => {
      // Feared: the stat's modifier is lost entirely.
      if (effect.type === 'statModifierLoss')
        return effect.value.toUpperCase() === code.toUpperCase() ? total - base : total
      return effect.type === 'statModifier' && effect.target.toUpperCase() === code.toUpperCase()
        ? total + effectChange(effect.value, base, stat)
        : total
    }, 0)

const conditionOnlyEffects = new Set<EffectProperty['type']>(['shield', 'lightOrb', 'raiseMinion'])

/** One condition covers every Rank: this is what it does at the Rank it was cast. */
export function conditionAtRank(
  buff: BuffEntry,
  rank: number,
  amount: (text: string) => string = (text) => text,
): BuffEntry {
  const effects = (buff.properties?.effects ?? []).filter((effect) => effectActiveAtRank(effect, rank))
  const shield = effects.find((effect) => effect.type === 'shield')
  const light = effects.find((effect) => effect.type === 'lightOrb')
  const duration = (['5', '10', '15'] as const)
    .filter((band) => Number(band) <= rank)
    .map((band) => buff.rankDurations?.[band])
    .filter(Boolean)
    .pop()
  return {
    ...buff,
    resolvedRank: rankBand(rank),
    duration: duration || buff.duration,
    properties: { ...buff.properties, effects: effects.filter((effect) => !conditionOnlyEffects.has(effect.type)) },
    ...(shield
      ? {
          shield: {
            slots: amount(shield.value),
            healthPerSlot: amount(shield.target),
            scope: shield.scope === 'nonMagic' ? ('nonMagic' as const) : ('all' as const),
          },
        }
      : {}),
    ...(light
      ? {
          lightOrb: {
            brightFeet: Number(light.target) || 0,
            dimFeet: Number(light.dimFeet) || 0,
            rangeFeet: Number(light.value) || 0,
            ...(light.doubled ? { doubleBright: true } : {}),
          },
        }
      : {}),
    ...(effects.some((effect) => effect.type === 'raiseMinion') ? { raisesMinion: true } : {}),
  }
}
