import publishedTemplates from './publishedAbilityTemplates.json'
import { templateTypes, type MeasurementTemplate, type TemplateType } from './vttTemplates'
import { normalizeAura, type Aura } from './auraDefinition'

export type AbilityTemplateArea = {
  type: TemplateType
  distance: number
  width: number
  angle: number
  distanceStat?: 'STR' | 'INT' | 'CON' | 'DEX' | 'CHA'
  distanceMultiplier?: number
  atEnd?: boolean
  label?: string
  /** An aura or dread the placed area applies to the tokens it covers. */
  aura?: Aura
}
/** Attached when the card is rolled: the spell's `duration` text, so the placed template can expire, and the
 * caster's character, whose token decides allies and enemies for the template's aura. */
export type AbilityTemplate = { areas: AbilityTemplateArea[]; duration?: string; sourceCharacterId?: number }
export const templateFields = ['template', 'rank5Template', 'rank10Template', 'rank15Template'] as const
export type TemplateField = (typeof templateFields)[number]
export type AbilityTemplateFields = Partial<Record<TemplateField, AbilityTemplate | null>> & {
  areaTemplatesEnabled?: boolean
}

export function normalizeAbilityTemplate(value: unknown): AbilityTemplate | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const areas = (value as AbilityTemplate).areas
  if (!Array.isArray(areas) || !areas.length || areas.length > 8) return null
  const normalized: AbilityTemplateArea[] = []
  for (const area of areas) {
    if (
      !area ||
      !templateTypes.includes(area.type) ||
      ![area.distance, area.width, area.angle].every(Number.isFinite) ||
      area.distance <= 0 ||
      area.distance > 100000 ||
      area.width <= 0 ||
      area.width > 100000 ||
      area.angle < 1 ||
      area.angle > 360 ||
      (area.distanceStat !== undefined && !['STR', 'INT', 'CON', 'DEX', 'CHA'].includes(area.distanceStat)) ||
      (area.distanceMultiplier !== undefined &&
        (!Number.isFinite(area.distanceMultiplier) || area.distanceMultiplier < 0 || area.distanceMultiplier > 100)) ||
      (area.aura !== undefined && !normalizeAura(area.aura))
    )
      return null
    normalized.push({
      type: area.type,
      distance: area.distance,
      width: area.width,
      angle: area.angle,
      ...(area.distanceStat
        ? { distanceStat: area.distanceStat, distanceMultiplier: area.distanceMultiplier ?? 1 }
        : {}),
      ...(area.atEnd === true ? { atEnd: true } : {}),
      ...(typeof area.label === 'string' ? { label: area.label.slice(0, 60) } : {}),
      ...(area.aura ? { aura: normalizeAura(area.aura) } : {}),
    })
  }
  const { duration, sourceCharacterId } = value as AbilityTemplate
  return {
    areas: normalized,
    ...(typeof duration === 'string' && duration.trim() ? { duration: duration.slice(0, 200) } : {}),
    ...(Number.isSafeInteger(sourceCharacterId) && Number(sourceCharacterId) > 0 ? { sourceCharacterId } : {}),
  }
}
export function normalizeAbilityTemplateFields(value: AbilityTemplateFields): AbilityTemplateFields {
  return {
    ...Object.fromEntries(
      templateFields
        .filter((field) => Object.hasOwn(value, field) && value[field] !== undefined)
        .map((field) => [field, normalizeAbilityTemplate(value[field])]),
    ),
    ...(typeof value.areaTemplatesEnabled === 'boolean' ? { areaTemplatesEnabled: value.areaTemplatesEnabled } : {}),
  }
}
export function rankAbilityTemplate(
  value: AbilityTemplateFields | undefined,
  rank: number,
  stats: Partial<Record<NonNullable<AbilityTemplateArea['distanceStat']>, number>> = {},
): AbilityTemplate | null {
  if (!value) return null
  if (value.areaTemplatesEnabled === false) return null
  let selected = value.template
  for (const [threshold, field] of [
    [5, 'rank5Template'],
    [10, 'rank10Template'],
    [15, 'rank15Template'],
  ] as const) {
    if (rank >= threshold && value[field] !== undefined) selected = value[field]
  }
  const template = normalizeAbilityTemplate(selected)
  return template
    ? {
        areas: template.areas.map((area) => ({
          ...area,
          distance: Math.min(
            100000,
            area.distance +
              (area.distanceStat ? Math.max(0, stats[area.distanceStat] ?? 0) * (area.distanceMultiplier ?? 1) : 0),
          ),
          distanceStat: undefined,
          distanceMultiplier: undefined,
        })),
      }
    : null
}
export function abilityTemplateLabel(template: AbilityTemplate): string {
  return template.areas
    .map(
      (area) =>
        (area.type === 'rectangle'
          ? `${area.distance} × ${area.width} ft rectangle`
          : `${area.distance} ft ${area.type === 'circle' ? 'radius' : area.type === 'ray' ? 'line' : 'cone'}`) +
        (area.label ? ` (${area.label})` : ''),
    )
    .join(' + ')
}
export function createAbilityMeasurementTemplates(
  template: AbilityTemplate,
  rollId: string,
  ownerId: number,
  origin: { x: number; y: number },
  direction: number,
  grid: { cellX: number; cellY: number; distance: number },
  ids: string[],
  resolvePlacement?: (point: { x: number; y: number }, type: MeasurementTemplate['type']) => { x: number; y: number },
): MeasurementTemplate[] {
  const primary = template.areas[0]
  return template.areas.map((area, index) => {
    const point = {
      x:
        origin.x +
        (area.atEnd ? ((Math.cos((direction * Math.PI) / 180) * primary.distance) / grid.distance) * grid.cellX : 0),
      y:
        origin.y +
        (area.atEnd ? ((Math.sin((direction * Math.PI) / 180) * primary.distance) / grid.distance) * grid.cellY : 0),
    }
    const resolved = resolvePlacement?.(point, area.type)
    return {
      id: ids[index],
      ownerId,
      sourceRollId: rollId,
      type: area.type,
      ...(resolved ?? point),
      distance: area.distance,
      width: area.width,
      angle: area.angle,
      direction,
      color: area.label === 'Splash' ? '#ff9e62' : '#71c9ff',
      hidden: false,
      ...(area.aura ? { aura: area.aura } : {}),
    }
  })
}

export function withPublishedAbilityTemplates<T extends AbilityTemplateFields & { name: string }>(
  value: T,
  contentType: 'skill' | 'spell',
): T & AbilityTemplateFields {
  const defaults = publishedTemplates.find(
    (entry) =>
      entry.content_type === contentType &&
      entry.name.replace(/[^a-z0-9]/gi, '').toLowerCase() === value.name.replace(/[^a-z0-9]/gi, '').toLowerCase(),
  )?.fields
  return {
    ...value,
    ...normalizeAbilityTemplateFields({
      ...defaults,
      ...Object.fromEntries(
        Object.entries(value).filter(
          ([key, field]) => templateFields.includes(key as TemplateField) && field !== undefined,
        ),
      ),
    } as AbilityTemplateFields),
  }
}
