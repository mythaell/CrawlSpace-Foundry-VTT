import type { EffectProperty } from './contentModels'

const record = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)

/** Overlay normalized fields while retaining detached, unrecognized JSON fields. */
export function preserveContentFields<T>(original: unknown, normalized: T): T {
  if (record(original) && record(normalized)) {
    return Object.fromEntries([
      ...Object.entries(original)
        .filter(([key]) => !Object.hasOwn(normalized, key))
        .map(([key, value]) => [key, structuredClone(value)]),
      ...Object.entries(normalized).map(([key, value]) => [key, preserveContentFields(original[key], value)]),
    ]) as T
  }
  // Normalizers retain order for valid rows. Never attach old metadata to a
  // different row after an invalid entry was removed or a default was inserted.
  if (Array.isArray(original) && Array.isArray(normalized) && original.length === normalized.length) {
    return normalized.map((value, index) => preserveContentFields(original[index], value)) as T
  }
  return structuredClone(normalized)
}

/** Editors keep IDs; imported copies use fresh IDs. Both retain source snapshots. */
export function cloneContentEffects(value: unknown, freshIds = false): EffectProperty[] {
  if (!Array.isArray(value)) return []
  return value.map((effect) =>
    preserveContentFields(effect, {
      id: !freshIds && typeof effect?.id === 'string' ? effect.id : crypto.randomUUID(),
      type: typeof effect?.type === 'string' ? (effect.type as EffectProperty['type']) : '',
      target: typeof effect?.target === 'string' ? effect.target : '',
      value: typeof effect?.value === 'string' ? effect.value : '',
      slots: Array.isArray(effect?.slots) ? effect.slots.map(String) : [],
      requiredRank: typeof effect?.requiredRank === 'string' ? effect.requiredRank : '',
    }),
  )
}
