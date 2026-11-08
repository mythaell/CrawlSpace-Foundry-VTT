/**
 * An actor's flavor text, shown when someone Shift-hovers its token (the app's token flavor tooltip). Its own
 * Flavor field, or else the plain text of its description (where mobs and NPCs keep the database's flavor).
 */
export const FLAVOR_LIMIT = 600

export function plainText(html: string) {
  return String(html ?? '')
    .replace(/<(br|\/p|\/div|\/li|\/h\d)\b[^>]*>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

export function flavorText(system: { flavor?: string; description?: string } | null | undefined) {
  const text = String(system?.flavor ?? '').trim() || plainText(system?.description ?? '')
  return text.length > FLAVOR_LIMIT ? `${text.slice(0, FLAVOR_LIMIT - 1).trimEnd()}…` : text
}

/**
 * A crawler's card (crawlerTooltip.ts): number, name, level, race and class, then its own flavor text if it has
 * any.
 */
export function crawlerFlavorText(details: Record<string, unknown> | null | undefined, name: string, flavor = '') {
  const field = (key: string) => String(details?.[key] ?? '').trim()
  const digits = field('crawlerNumber').replace(/^#/, '')
  const plain = digits.replaceAll(',', '')
  const number = /^\d+$/.test(plain) ? Number(plain).toLocaleString('en-US') : digits
  const label = name.trim()
  const lines = [
    `Crawler #${number || '???'}${label ? ` “${label}”` : ''}`,
    `Level ${field('level') || '???'}`,
    `Race: ${field('race') || 'Not yet assigned'}`,
    `Class: ${field('className') || 'Not yet assigned'}`,
  ]
  const extra = String(flavor ?? '').trim()
  return extra ? `${lines.join('\n')}\n\n${extra}` : lines.join('\n')
}
