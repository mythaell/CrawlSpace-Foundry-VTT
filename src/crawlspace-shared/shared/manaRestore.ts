/** Consumables that refill mana when used. The amount is points (`25`) or a share of max mana (`50%`). */
export type ManaRestoreFields = {
  isManaRestore?: boolean
  manaRestoreAmount?: string
}

/** Earlier builds kept `manaRestore: 'full' | '<points>'` with no checkbox; read it once and drop it. */
function legacyAmount(source: Record<string, unknown>) {
  const legacy = source.manaRestore
  if (typeof legacy !== 'string' || !legacy.trim()) return ''
  return legacy.trim().toLowerCase() === 'full' ? '100%' : legacy.trim()
}

export function isManaRestoreSource(source: ManaRestoreFields & Record<string, unknown>) {
  return typeof source.isManaRestore === 'boolean' ? source.isManaRestore : Boolean(legacyAmount(source))
}

export function normalizeManaRestore(source: Record<string, unknown>): Required<ManaRestoreFields> {
  return {
    isManaRestore: isManaRestoreSource(source),
    manaRestoreAmount: typeof source.manaRestoreAmount === 'string' ? source.manaRestoreAmount : legacyAmount(source),
  }
}

/** Item properties with the mana fields normalized and the old hidden `manaRestore` field removed. */
export function withManaRestore<T extends Record<string, any>>(properties: T): T & Required<ManaRestoreFields> {
  const { manaRestore: _legacy, ...rest } = properties
  return { ...(rest as T), ...normalizeManaRestore(properties) }
}

/** Mana points the item gives back, before capping at max mana. 0 when it restores nothing. */
export function manaRestorePoints(source: ManaRestoreFields, maxMana: number) {
  if (!source.isManaRestore) return 0
  const text = (source.manaRestoreAmount ?? '').trim()
  const match = /^(\d+(?:\.\d+)?)\s*(%?)$/.exec(text)
  if (!match) return 0
  const value = Number(match[1])
  return Math.max(0, match[2] ? Math.floor((Math.max(0, maxMana) * value) / 100) : Math.floor(value))
}

/** A content row's data without the old hidden `properties.manaRestore`, so it is not carried forward. */
export function dropLegacyManaRestore<T>(data: T): T {
  const properties = (data as { properties?: unknown } | null)?.properties
  if (!properties || typeof properties !== 'object' || !('manaRestore' in properties)) return data
  const { manaRestore: _legacy, ...rest } = properties as Record<string, unknown>
  return { ...(data as object), properties: rest } as T
}
