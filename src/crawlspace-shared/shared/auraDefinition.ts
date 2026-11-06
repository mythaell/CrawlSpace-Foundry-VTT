import { normalizeUseEffects, type UseEffect } from './useEffects'
export type Aura = {
  kind: 'aura' | 'dread'
  targets: 'allies' | 'enemies' | 'everyone'
  includeSource: boolean
  effects: UseEffect[]
}
export function normalizeAura(value: unknown): Aura | undefined {
  const aura = value as Aura | undefined
  if (
    !aura ||
    !['aura', 'dread'].includes(aura.kind) ||
    !['allies', 'enemies', 'everyone'].includes(aura.targets) ||
    typeof aura.includeSource !== 'boolean'
  )
    return undefined
  const effects = normalizeUseEffects(aura.effects)
  if (effects.length !== aura.effects?.length) return undefined
  return { kind: aura.kind, targets: aura.targets, includeSource: aura.includeSource, effects }
}
