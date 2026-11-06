export type ContentOrigin = {
  provider: 'point-mongo'
  entryId: number
  originalName: string
  author: string
  url: string
}

export type ProvenancedContent = { provenance?: ContentOrigin[]; sharedWithCelestial?: boolean }

/** A community pack's adaptation credit follows every included entry and nested pack. */
export function inheritCelestialPackOrigin(data: Record<string, unknown>): Record<string, unknown> {
  if (!data.celestialOrigin || !Array.isArray(data.entries)) return data
  const result = structuredClone(data)
  const seen = new WeakSet<object>()
  const visit = (node: Record<string, any>, origin: unknown) => {
    if (seen.has(node)) return
    seen.add(node)
    node.celestialOrigin ??= structuredClone(origin)
    node.sharedWithCelestial = false
    for (const entry of Array.isArray(node.entries) ? node.entries : []) {
      if (entry?.data && typeof entry.data === 'object') visit(entry.data, node.celestialOrigin)
    }
  }
  visit(result, data.celestialOrigin)
  return result
}

/** Include origins of granted spells, effects and linked snapshots too. */
export function contentOrigins(value: unknown): ContentOrigin[] {
  const origins = new Map<number, ContentOrigin>()
  const seen = new WeakSet<object>()
  function visit(node: unknown) {
    if (!node || typeof node !== 'object' || seen.has(node)) return
    seen.add(node)
    const record = node as Record<string, unknown>
    if (
      record.provider === 'point-mongo' &&
      Number.isSafeInteger(record.entryId) &&
      Number(record.entryId) > 0 &&
      typeof record.originalName === 'string' &&
      typeof record.author === 'string' &&
      typeof record.url === 'string'
    ) {
      origins.set(Number(record.entryId), record as ContentOrigin)
    }
    for (const child of Object.values(record)) visit(child)
  }
  visit(value)
  return [...origins.values()]
}

export function canShareContent(value: unknown): boolean {
  if (contentOrigins(value).length) return false
  const seen = new WeakSet<object>()
  function external(node: unknown): boolean {
    if (!node || typeof node !== 'object' || seen.has(node)) return false
    seen.add(node)
    const record = node as Record<string, unknown>
    if (record.celestialOrigin) return true
    if (
      typeof record.source === 'string' &&
      record.source.trim() &&
      !['game', 'homebrew', 'rules', 'CrawlSpace Homebrew'].includes(record.source)
    )
      return true
    if (record.source && typeof record.source === 'object' && 'book' in record.source) return true
    return Object.values(record).some(external)
  }
  return !external(value)
}

export const isPointMongoCatalogId = (id: number | null | undefined) => typeof id === 'number' && id < 0

export function pointMongoUrl(value: string): string | undefined {
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'pointmongo.com' ? url.href : undefined
  } catch {
    return undefined
  }
}
