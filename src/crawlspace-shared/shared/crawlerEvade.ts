import { abilityScoreModifier } from './abilityScores'
const object = (v: any): Record<string, any> => (v && typeof v === 'object' ? v : {})
const array = (v: any): Record<string, any>[] => (Array.isArray(v) ? v : [])
const number = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0)
/** Saved-sheet calculation, matching the GM crawler summary. Live sheets supply their calculated Evade directly. */
export function crawlerEvade(data: Record<string, any>) {
  if (data.evadeOverride !== undefined && String(data.evadeOverride) !== '') return number(data.evadeOverride)
  const properties = (entry: Record<string, any>) => object(entry.properties)
  const sources = [
    ...array(data.racialAbilities),
    ...array(data.classAbilities),
    ...array(data.otherAbilities),
    ...array(data.inventory).filter((entry) => entry.equipped === true),
    ...array(data.internalBuffs).filter((entry) => entry.active === true),
    ...array(data.externalBuffs).filter((entry) => entry.active === true),
    ...array(data.customDebuffs).filter((entry) => entry.active === true),
  ].flatMap((entry) => array(properties(entry).effects))
  const sum = (effects: Record<string, any>[], type: string, target?: string) =>
    effects.reduce(
      (total, effect) =>
        total + (effect.type === type && (!target || effect.target === target) ? number(effect.value) : 0),
      0,
    )
  const skillEffects = array(data.skills).flatMap((skill) => {
    const override = object(data.skillEnhancedOverrides)[String(skill.id)]
    const overridden = override !== undefined && String(override) !== ''
    const rank = overridden ? number(override) : number(skill.unenhancedRank) + sum(sources, 'skillRank', skill.name)
    return array(skill.effects).filter(
      (effect) =>
        effect.requiredRank !== '' &&
        Number.isFinite(Number(effect.requiredRank)) &&
        rank >= Number(effect.requiredRank),
    )
  })
  const effects = [...sources, ...skillEffects]
  const dex = object(array(data.attributeValues)[3])
  const override = object(data.attributeOverrides)['3']
  const overridden = override !== undefined && String(override) !== ''
  const value = overridden ? number(override) : number(dex.unenhanced) + sum(effects, 'statBonus', 'DEX')
  const modOverride = object(data.attributeModOverrides)['3']
  const modifier =
    modOverride !== undefined && String(modOverride) !== ''
      ? number(modOverride)
      : !overridden && (dex.unenhanced === undefined || dex.unenhanced === '')
        ? 0
        : abilityScoreModifier(value)
  return modifier + number(object(data.character).evadeBuffs) + sum(effects, 'evadeModifier')
}
