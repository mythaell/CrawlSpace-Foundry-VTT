import { createBuff, type BuffEntry, type EffectProperty } from './contentModels'
import { debuffs, debuffStacks } from './debuffs'
import { shieldSlotCount } from './conditionShields'
import { conditionAtRank, effectActivationRank, effectActiveAtRank } from './effectValues'

export type UseEffect = {
  id: string
  kind: 'buff' | 'debuff'
  minRank: number
  maxRank?: number
  standardDebuff?: string
  buff: BuffEntry
}
export type UseEffectFields = { useEffects?: UseEffect[] }
export const useEffectDragType = 'application/x-crawlspace-use-effect'

export function normalizeUseEffects(value: unknown): UseEffect[] {
  if (!Array.isArray(value) || value.length > 40) return []
  return value.flatMap((entry): UseEffect[] => {
    if (
      !entry ||
      typeof entry !== 'object' ||
      typeof entry.id !== 'string' ||
      entry.id.length > 100 ||
      !['buff', 'debuff'].includes(entry.kind) ||
      !Number.isInteger(entry.minRank) ||
      entry.minRank < 0 ||
      entry.minRank > 15 ||
      (entry.maxRank !== undefined &&
        (!Number.isInteger(entry.maxRank) || entry.maxRank < entry.minRank || entry.maxRank > 15)) ||
      !entry.buff ||
      typeof entry.buff !== 'object' ||
      JSON.stringify(entry.buff).length > 30000
    )
      return []
    const base = createBuff()
    const buff = { ...base, ...entry.buff, properties: { ...base.properties, ...entry.buff.properties } } as BuffEntry
    if (
      ![buff.name, buff.description, buff.duration].every((text) => typeof text === 'string' && text.length <= 10000) ||
      !buff.name.trim() ||
      buff.name.length > 100 ||
      (buff.cleanupFormula !== undefined &&
        (typeof buff.cleanupFormula !== 'string' ||
          buff.cleanupFormula.length > 160 ||
          !/^[\s\ddF%khl()+*/-]*$/i.test(buff.cleanupFormula))) ||
      !Array.isArray(buff.properties.effects) ||
      buff.properties.effects.length > 100 ||
      buff.properties.effects.some(
        (effect) =>
          !effect ||
          typeof effect.type !== 'string' ||
          typeof effect.target !== 'string' ||
          typeof effect.value !== 'string' ||
          !Array.isArray(effect.slots),
      )
    )
      return []
    for (const key of ['statModifiers', 'skillModifiers', 'spellModifiers'] as const)
      if (
        !Array.isArray(buff.properties[key]) ||
        buff.properties[key].some((modifier) => !modifier || typeof modifier.value !== 'string')
      )
        return []
    const standard = debuffs.find((definition) => definition.name === entry.standardDebuff)
    return [
      {
        id: entry.id,
        kind: entry.kind,
        minRank: entry.minRank,
        ...(entry.maxRank !== undefined ? { maxRank: entry.maxRank } : {}),
        ...(entry.kind === 'debuff' && standard ? { standardDebuff: standard.name } : {}),
        buff,
      },
    ]
  })
}

export function rankUseEffects(source: UseEffectFields | undefined, rank = 1): UseEffect[] {
  return normalizeUseEffects(source?.useEffects).filter(
    (effect) => rank >= effect.minRank && (effect.maxRank === undefined || rank <= effect.maxRank),
  )
}

/** What a holder cannot have: from its active conditions, its skills and spells at their Rank, and equipped items. */
function immunityTargets(data: Record<string, any>) {
  const held = (effects: EffectProperty[] | undefined, rank?: number) =>
    (Array.isArray(effects) ? effects : []).flatMap((entry) =>
      entry?.type === 'conditionImmunity' &&
      entry.target?.trim() &&
      (rank === undefined || (effectActiveAtRank(entry, rank) && effectActivationRank(entry) <= rank))
        ? [entry.target.trim().toLowerCase()]
        : [],
    )
  const list = (field: string) => (Array.isArray(data[field]) ? data[field] : [])
  return [
    ...[...list('externalBuffs'), ...list('internalBuffs'), ...list('customDebuffs')].flatMap((buff: BuffEntry) =>
      buff?.active ? held(buff.properties?.effects) : [],
    ),
    ...[...list('skills'), ...list('spells')].flatMap((entry: any) =>
      held(entry?.effects, Number(entry?.enhancedRank || entry?.unenhancedRank) || 0),
    ),
    ...list('inventory').flatMap((item: any) => (item?.equipped ? held(item.properties?.effects) : [])),
  ]
}
const matchesImmunity = (name: string, targets: string[]) =>
  targets.some((target) => name.toLowerCase().includes(target))

/** Wisp Armor's Mind Control immunity. The condition still lands, and is then taken off again. */
export function immuneToEffect(data: Record<string, any>, effect: UseEffect) {
  return matchesImmunity(effect.standardDebuff ?? effect.buff.name, immunityTargets(data))
}

export type HeldCondition = {
  field: 'activeDebuffs' | 'externalBuffs' | 'customDebuffs'
  name: string
  id?: string
  index?: number
}

/** Conditions held against an immunity, however they arrived or whichever came first. */
export function immuneConditionsHeld(data: Record<string, any>): HeldCondition[] {
  const targets = immunityTargets(data)
  if (!targets.length) return []
  return [
    ...Object.entries(data.activeDebuffs ?? {}).flatMap(([name, stacks]): HeldCondition[] =>
      debuffStacks(stacks) > 0 && matchesImmunity(name, targets) ? [{ field: 'activeDebuffs', name }] : [],
    ),
    ...(['externalBuffs', 'customDebuffs'] as const).flatMap((field) =>
      (Array.isArray(data[field]) ? data[field] : []).flatMap(
        (buff: BuffEntry & { id?: string }, index: number): HeldCondition[] =>
          buff?.active &&
          typeof buff.name === 'string' &&
          matchesImmunity(buff.name, targets) &&
          !buff.properties?.effects?.some((entry) => entry.type === 'conditionImmunity')
            ? [{ field, name: buff.name, ...(buff.id ? { id: buff.id } : { index }) }]
            : [],
      ),
    ),
  ]
}

export function withoutImmuneConditions(data: Record<string, any>): Record<string, any> {
  const next = { ...data }
  for (const held of immuneConditionsHeld(data)) {
    if (held.field === 'activeDebuffs') next.activeDebuffs = { ...next.activeDebuffs, [held.name]: 0 }
    else
      next[held.field] = next[held.field].filter(
        (buff: BuffEntry & { id?: string }, index: number) =>
          !(buff.name === held.name && (held.id ? buff.id === held.id : index === held.index)),
      )
  }
  return next
}

/** Use the same fields as the sheet's Buffs and Debuffs controls. */
export function applyUseEffect(
  data: Record<string, any>,
  linked: UseEffect,
  newId: () => string = () => crypto.randomUUID(),
): Record<string, any> {
  // A condition dragged from the database has no caster, so it applies as Rank 1.
  const effect = linked.buff.resolvedRank ? linked : { ...linked, buff: conditionAtRank(linked.buff, 1) }
  if (effect.standardDebuff) {
    const definition = debuffs.find((entry) => entry.name === effect.standardDebuff)!
    return {
      ...data,
      activeDebuffs: {
        ...data.activeDebuffs,
        [definition.name]: debuffStacks(debuffStacks(data.activeDebuffs?.[definition.name]) + 1, definition.stackable),
      },
    }
  }
  const field = effect.kind === 'buff' ? 'externalBuffs' : 'customDebuffs'
  const existing = Array.isArray(data[field]) ? data[field] : []
  const id = `use-effect:${effect.id}`
  const previous = existing.find((entry: { id: string }) => entry.id === id)
  const buff = {
    ...structuredClone(effect.buff),
    id,
    active: true,
    durationVersion: newId(),
    expanded: false,
    stacks: effect.buff.stackable
      ? Math.min(
          Math.max(1, Number(effect.buff.maxStacks) || 100),
          100,
          (previous?.active ? debuffStacks(previous.stacks ?? 1) : 0) + (debuffStacks(effect.buff.stacks ?? 1) || 1),
        )
      : 1,
    // Casting again renews the shield rather than adding a second one.
    ...(effect.buff.shield
      ? { shield: { ...effect.buff.shield, remaining: shieldSlotCount(effect.buff.shield) } }
      : {}),
  }
  return { ...data, [field]: [...existing.filter((entry: { id: string }) => entry.id !== id), buff] }
}

/** Takes back what `applyUseEffect` added. */
export function withoutUseEffect(data: Record<string, any>, effect: UseEffect): Record<string, any> {
  if (effect.standardDebuff) return { ...data, activeDebuffs: { ...data.activeDebuffs, [effect.standardDebuff]: 0 } }
  const field = effect.kind === 'buff' ? 'externalBuffs' : 'customDebuffs'
  const existing = Array.isArray(data[field]) ? data[field] : []
  return { ...data, [field]: existing.filter((entry: { id: string }) => entry.id !== `use-effect:${effect.id}`) }
}
