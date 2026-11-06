/** Changes a weapon or an attack makes to its damage roll. `bonus` is added on top of
 * the roll and may be a number, dice or a stat (`2`, `+1d6`, `-1`, `STR`, `1d4+2`).
 * The other fields change the formula's first dice term, the weapon's own dice: `dieStep`
 * moves the die up or down the d4 → d6 → d8 → d10 → d12 → d20 ladder, and `advantage`
 * or `disadvantage` rolls those dice twice over and keeps the higher or lower half.
 * Only one of the two is set at a time; across a weapon and its attack they cancel. */
export type DamageModification = {
  bonus?: string
  dieStep?: string
  advantage?: boolean
  disadvantage?: boolean
}

export const DIE_LADDER = [4, 6, 8, 10, 12, 20]

const whole = (value: unknown) => {
  const number = Number(String(value ?? '').trim())
  return Number.isFinite(number) ? Math.trunc(number) : 0
}

export const hasDamageModification = (modification: DamageModification | undefined) =>
  !!modification &&
  (!!String(modification.bonus ?? '').trim() ||
    whole(modification.dieStep) !== 0 ||
    !!modification.advantage !== !!modification.disadvantage)

const stepDie = (sides: number, steps: number) => {
  if (!steps) return sides
  let index = DIE_LADDER.indexOf(sides)
  if (index === -1) {
    // A die off the ladder starts from the nearest smaller size on it.
    index = DIE_LADDER.reduce((found, size, position) => (size <= sides ? position : found), -1)
    if (index === -1) return sides
  }
  return DIE_LADDER[Math.max(0, Math.min(DIE_LADDER.length - 1, index + steps))]
}

/** Net advantage of several modifications: 1 advantage, -1 disadvantage, 0 neither. */
export function damageAdvantage(modifications: (DamageModification | undefined)[]) {
  const net = modifications.reduce(
    (total, modification) => total + (modification?.advantage ? 1 : 0) - (modification?.disadvantage ? 1 : 0),
    0,
  )
  return Math.sign(net)
}

/** Applies the dice changes of each modification, in order, to a damage formula. */
export function applyDamageDiceModifications(formula: string, modifications: (DamageModification | undefined)[]) {
  const match = /(\d*)d(\d+)(k[hl]\d*)?/i.exec(formula)
  if (!match) return formula
  const count = match[1] === '' ? 1 : Number(match[1])
  let sides = Number(match[2])
  for (const modification of modifications) if (modification) sides = stepDie(sides, whole(modification.dieStep))
  // A term that already keeps dice keeps its own rule.
  const advantage = match[3] ? 0 : damageAdvantage(modifications)
  if (sides === Number(match[2]) && !advantage) return formula
  const term = advantage
    ? `${count * 2}d${sides}k${advantage > 0 ? 'h' : 'l'}${count}`
    : `${match[1]}d${sides}${match[3] ?? ''}`
  return formula.slice(0, match.index) + term + formula.slice(match.index + match[0].length)
}

/** A bonus as a roll modifier: a plain number stays a value, anything else a formula. */
export function damageBonusModifier(bonus: string | undefined): { value: number } | { formula: string } | undefined {
  const text = String(bonus ?? '').trim()
  if (!text) return undefined
  const number = Number(text)
  if (Number.isFinite(number)) return number === 0 ? undefined : { value: number }
  const formula = text.replace(/^\+/, '').trim()
  return formula ? { formula } : undefined
}

/** A short summary such as `advantage, die size +1, +1d6`. */
export function describeDamageModification(modification: DamageModification | undefined) {
  if (!hasDamageModification(modification)) return ''
  const parts: string[] = []
  const advantage = damageAdvantage([modification])
  if (advantage) parts.push(advantage > 0 ? 'advantage' : 'disadvantage')
  const step = whole(modification!.dieStep)
  if (step) parts.push(`die size ${step > 0 ? '+' : ''}${step}`)
  const bonus = String(modification!.bonus ?? '').trim()
  if (bonus) parts.push(/^[+-]/.test(bonus) ? bonus : `+${bonus}`)
  return parts.join(', ')
}
