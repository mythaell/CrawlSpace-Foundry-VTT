import { normalizeAura, type Aura } from './auraDefinition'
export const templateTypes = ['circle', 'cone', 'rectangle', 'ray'] as const
export type TemplateType = (typeof templateTypes)[number]
export const templateName = (type: TemplateType) => `${type[0].toUpperCase()}${type.slice(1)} Template`
/** When a spell's template runs out: in-game time (Collapse timer ms), real time, or the end of combat. */
export type TemplateExpiry = { gameMs?: number; realAt?: number; combat?: boolean }
export type MeasurementTemplate = {
  aura?: Aura
  attachment?: { tokenId: string; offsetX: number; offsetY: number }
  sourceRollId?: string
  /** The caster's token, which decides allies and enemies for an aura on an unattached template. */
  sourceTokenId?: string
  /** The caster's side when no caster token is on the scene. */
  sourceSide?: string
  expiry?: TemplateExpiry
  id: string
  ownerId: number
  type: TemplateType
  x: number
  y: number
  distance: number
  width: number
  direction: number
  angle: number
  color: string
  hidden: boolean
}
export function normalizeMeasurementTemplate(value: unknown): MeasurementTemplate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const entry = value as Record<string, unknown>
  const attachment = entry.attachment as MeasurementTemplate['attachment']
  if (
    attachment !== undefined &&
    (!attachment ||
      typeof attachment !== 'object' ||
      typeof attachment.tokenId !== 'string' ||
      !attachment.tokenId ||
      attachment.tokenId.length > 100 ||
      !Number.isFinite(attachment.offsetX) ||
      Math.abs(attachment.offsetX) > 10000 ||
      !Number.isFinite(attachment.offsetY) ||
      Math.abs(attachment.offsetY) > 10000)
  )
    return null
  if (
    typeof entry.id !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(entry.id) ||
    !templateTypes.includes(entry.type as TemplateType)
  )
    return null
  for (const key of ['x', 'y', 'distance', 'width', 'direction', 'angle']) {
    if (typeof entry[key] !== 'number' || !Number.isFinite(entry[key]) || Math.abs(entry[key] as number) > 100000)
      return null
  }
  if (
    Math.abs(entry.x as number) > 10000 ||
    Math.abs(entry.y as number) > 10000 ||
    (entry.type !== 'rectangle' && ((entry.distance as number) < 0 || (entry.width as number) < 0)) ||
    (entry.angle as number) < 1 ||
    (entry.angle as number) > 360 ||
    typeof entry.hidden !== 'boolean' ||
    typeof entry.color !== 'string' ||
    !/^#[0-9a-f]{6}$/i.test(entry.color)
  )
    return null
  if (entry.aura !== undefined && !normalizeAura(entry.aura)) return null
  return {
    ...(entry.aura ? { aura: normalizeAura(entry.aura) } : {}),
    ...(attachment
      ? { attachment: { tokenId: attachment.tokenId, offsetX: attachment.offsetX, offsetY: attachment.offsetY } }
      : {}),
    ...(typeof entry.sourceRollId === 'string' && entry.sourceRollId.length <= 100
      ? { sourceRollId: entry.sourceRollId }
      : {}),
    ...(typeof entry.sourceTokenId === 'string' && entry.sourceTokenId && entry.sourceTokenId.length <= 100
      ? { sourceTokenId: entry.sourceTokenId }
      : {}),
    ...(typeof entry.sourceSide === 'string' && entry.sourceSide && entry.sourceSide.length <= 60
      ? { sourceSide: entry.sourceSide }
      : {}),
    ...(normalizeTemplateExpiry(entry.expiry) ? { expiry: normalizeTemplateExpiry(entry.expiry) } : {}),
    id: entry.id,
    ownerId: Number(entry.ownerId) || 0,
    type: entry.type as TemplateType,
    x: entry.x as number,
    y: entry.y as number,
    distance: entry.distance as number,
    width: entry.width as number,
    direction: (((entry.direction as number) % 360) + 360) % 360,
    angle: entry.angle as number,
    color: entry.color,
    hidden: entry.hidden,
  }
}
export type TemplateToken = { id: string; x: number; y: number; width?: number; height?: number }

function normalizeTemplateExpiry(value: unknown): TemplateExpiry | undefined {
  if (!value || typeof value !== 'object') return undefined
  const source = value as Record<string, unknown>
  const expiry: TemplateExpiry = {
    ...(Number.isFinite(source.gameMs) ? { gameMs: Number(source.gameMs) } : {}),
    ...(Number.isFinite(source.realAt) ? { realAt: Number(source.realAt) } : {}),
    ...(source.combat === true ? { combat: true } : {}),
  }
  return Object.keys(expiry).length ? expiry : undefined
}

/** Whether a spell's template has run out. A game clock is the Collapse timer's remaining ms, which falls. */
export function templateExpired(
  template: Pick<MeasurementTemplate, 'expiry'>,
  now: { gameMs: number | null; realMs: number; combatEnded?: boolean },
) {
  const expiry = template.expiry
  if (!expiry) return false
  if (expiry.combat && now.combatEnded) return true
  if (expiry.gameMs !== undefined && now.gameMs !== null) return now.gameMs <= expiry.gameMs
  return expiry.realAt !== undefined && now.realMs >= expiry.realAt
}

/** When a spell's template should end, from its duration text: an in-game time while there is a Collapse timer,
 * otherwise real time. Special durations other than the end of combat end only when the template is deleted. */
export function templateExpiryFor(
  durationMs: number | null,
  endsWithCombat: boolean,
  gameMs: number | null,
  realMs: number,
) {
  if (endsWithCombat) return { combat: true } satisfies TemplateExpiry
  if (durationMs === null || durationMs <= 0) return undefined
  return gameMs !== null ? { gameMs: gameMs - durationMs } : { realAt: realMs + durationMs }
}

export function attachTemplate(template: MeasurementTemplate, token: TemplateToken): MeasurementTemplate {
  return {
    ...template,
    attachment: { tokenId: token.id, offsetX: template.x - token.x, offsetY: template.y - token.y },
  }
}

export function resolveAttachedTemplate(template: MeasurementTemplate, tokens: TemplateToken[]): MeasurementTemplate {
  const token = tokens.find((entry) => entry.id === template.attachment?.tokenId)
  return token && template.attachment
    ? { ...template, x: token.x + template.attachment.offsetX, y: token.y + template.attachment.offsetY }
    : template
}
export function sizeTemplateFromDrag(
  template: MeasurementTemplate,
  end: { x: number; y: number },
  grid: { cellX: number; cellY: number; distance: number },
): MeasurementTemplate {
  const dx = ((end.x - template.x) / grid.cellX) * grid.distance
  const dy = ((end.y - template.y) / grid.cellY) * grid.distance
  return template.type === 'rectangle'
    ? { ...template, distance: dx, width: dy, direction: 0 }
    : { ...template, distance: Math.hypot(dx, dy), direction: ((Math.atan2(dy, dx) * 180) / Math.PI + 360) % 360 }
}
// Local geometry is expressed in feet; its SVG transform supplies the scene's grid scale.
export function templateOutline(template: MeasurementTemplate): string {
  const length = template.distance,
    width = template.width
  if (template.type === 'rectangle') return `M0 0H${length}V${width}H0Z`
  if (template.type === 'ray') return `M0 ${-width / 2}H${length}V${width / 2}H0Z`
  if (template.type === 'circle' || template.angle >= 360)
    return `M${length} 0A${length} ${length} 0 1 0 ${-length} 0A${length} ${length} 0 1 0 ${length} 0Z`
  const half = (template.angle * Math.PI) / 360
  const x = length * Math.cos(half),
    y = length * Math.sin(half)
  return `M0 0L${x} ${-y}A${length} ${length} 0 ${template.angle > 180 ? 1 : 0} 1 ${x} ${y}Z`
}
export const canManageTemplate = (template: Pick<MeasurementTemplate, 'ownerId'>, userId: number, isGm: boolean) =>
  isGm || template.ownerId === userId
export const templateVisibleTo = (template: MeasurementTemplate, userId: number, isGm: boolean) =>
  !template.hidden || canManageTemplate(template, userId, isGm)

export function snapTemplatePoint(
  point: { x: number; y: number },
  grid: { cellX: number; cellY: number; offsetX?: number; offsetY?: number; enabled?: boolean },
  bypass = false,
  type: TemplateType = 'circle',
) {
  if (bypass || grid.enabled === false || grid.cellX <= 0 || grid.cellY <= 0) return point
  const x = grid.offsetX ?? 0,
    y = grid.offsetY ?? 0
  const column = (point.x - x) / grid.cellX,
    row = (point.y - y) / grid.cellY,
    left = Math.floor(column),
    top = Math.floor(row)
  let nearest = { x: left, y: top },
    nearestDistance = Infinity
  for (const dx of [0, 0.5, 1]) {
    for (const dy of [0, 0.5, 1]) {
      const center = dx === 0.5 && dy === 0.5
      const edge = (dx === 0.5) !== (dy === 0.5)
      if ((type === 'ray' && center) || ((type === 'circle' || type === 'rectangle') && edge)) continue
      const distance = (column - left - dx) ** 2 + (row - top - dy) ** 2
      if (distance < nearestDistance) {
        nearest = { x: left + dx, y: top + dy }
        nearestDistance = distance
      }
    }
  }
  return { x: x + nearest.x * grid.cellX, y: y + nearest.y * grid.cellY }
}
export type TemplateChange =
  { action: 'upsert'; template: MeasurementTemplate } | { action: 'delete'; id: string } | { action: 'clear' }
export function applyTemplateChange(
  templates: MeasurementTemplate[],
  change: TemplateChange,
  userId?: number,
  isGm = false,
): MeasurementTemplate[] {
  if (change.action === 'delete') return templates.filter((template) => template.id !== change.id)
  if (change.action === 'clear')
    return userId === undefined || isGm ? [] : templates.filter((template) => template.ownerId !== userId)
  return [...templates.filter((template) => template.id !== change.template.id), change.template]
}
