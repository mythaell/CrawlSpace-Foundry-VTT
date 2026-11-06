/**
 * Area templates and auras (abilityTemplates.ts, vttTemplates.ts, proximityAuras.ts), done with Foundry's Regions.
 *
 * A skill or spell's area (its own, else the published one for its name) is placed from its roll card as a
 * Region: circles, cones, rectangles and lines the user drops and turns with the mouse wheel. An area with an
 * aura or dread becomes an aura the way pf2e does them: a circle aura rides on the caster's token as an
 * emanation, and an "aura" Region behavior hands the item's conditions to the tokens inside that it targets
 * (allies, enemies or everyone, the caster only if it includes them), taking them away again as they leave.
 * A placed area goes when its spell's duration runs out, or with the combat for "end of combat" durations.
 */
import {
  normalizeAbilityTemplate,
  rankAbilityTemplate,
  templateFields,
  withPublishedAbilityTemplates,
  type AbilityTemplate,
  type AbilityTemplateArea,
  type AbilityTemplateFields,
} from '../crawlspace-shared/shared/abilityTemplates'
import { STAT_KEYS, statKeyFromCode } from '../config'
import { effectDuration } from '../import/convert'
import { endTriggers } from './end-triggers'
import { conditionData, useConditions } from './use-conditions'

const STATS = ['STR', 'INT', 'CON', 'DEX', 'CHA'] as const

/** The actor's stat scores, for areas that grow with a stat. */
function statTotals(actor: any) {
  const attributes = actor?.system?.attributes ?? {}
  return Object.fromEntries(
    STATS.map((code) => {
      const key = statKeyFromCode(code) ?? STAT_KEYS.find((stat: string) => stat.toUpperCase().startsWith(code))
      return [code, Math.floor(Number(attributes[key as string]?.total) || 0)]
    }),
  )
}

/** The item's own template fields, falling back to the published ones for its name. */
export function areaFields(item: any): AbilityTemplateFields {
  if (!['skill', 'spell'].includes(item?.type)) return {}
  const own = (item.system?.areas ?? {}) as AbilityTemplateFields
  return withPublishedAbilityTemplates({ name: item.name, ...own }, item.type)
}

/** The area this item has at its current Rank, or null. */
export function itemArea(item: any): AbilityTemplate | null {
  if (!['skill', 'spell'].includes(item?.type)) return null
  const rank = Math.floor(Number(item.system?.rank?.total) || 0)
  return rankAbilityTemplate(areaFields(item), rank, statTotals(item.actor))
}

const COLORS = { aura: '#3fa9f5', dread: '#c0392b', splash: '#ff9e62', area: '#71c9ff' }

/** A Region shape for one area, in canvas pixels. A circle aura on a token is an emanation of that token. */
function shapeFor(area: AbilityTemplateArea, token: any = null) {
  const px = canvas.dimensions.distancePixels
  const length = area.distance * px
  const width = area.width * px
  switch (area.type) {
    case 'circle':
      return token
        ? {
            type: 'emanation',
            base: { type: 'token', x: token.x, y: token.y, width: token.width, height: token.height, shape: token.shape },
            radius: length,
          }
        : { type: 'circle', x: 0, y: 0, radius: length }
    case 'cone':
      return { type: 'cone', x: 0, y: 0, radius: length, angle: area.angle, rotation: 0, curvature: 'round' }
    case 'rectangle':
      return { type: 'rectangle', x: 0, y: 0, width: length, height: width, anchorX: 0.5, anchorY: 0.5, rotation: 0 }
    case 'ray':
      return { type: 'line', x: 0, y: 0, length, width, rotation: 0 }
  }
}

/** When a placed area ends: world time from its duration text, or the end of combat. */
function areaExpiry(item: any) {
  const text = String(item.system?.duration ?? '')
  if (!text) return {}
  if (endTriggers(text).includes('combatEnd')) return { combat: true }
  const timed = effectDuration(text)
  return timed?.value ? { expires: game.time.worldTime + Number(timed.value) } : {}
}

/** The Region for one of the item's areas. */
function regionData(item: any, area: AbilityTemplateArea, token: any = null) {
  const aura = area.aura ?? null
  const color = aura ? COLORS[aura.kind] : area.label === 'Splash' ? COLORS.splash : COLORS.area
  const caster = item.actor?.getActiveTokens?.(false, true)?.[0] ?? null
  return {
    name: area.label ? `${item.name} (${area.label})` : item.name,
    color,
    shapes: [shapeFor(area, token)],
    displayMeasurements: true,
    visibility: CONST.REGION_VISIBILITY.ALWAYS,
    ownership: { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [game.user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER },
    ...(token ? { attachment: { token: token.id }, hidden: token.hidden, ...(token.level ? { levels: [token.level] } : {}) } : {}),
    flags: {
      crawlspace: {
        area: {
          item: item.uuid,
          source: caster?.uuid ?? '',
          aura: aura ? { kind: aura.kind, targets: aura.targets, includeSource: aura.includeSource } : null,
          effects: aura ? useConditions(item).map((effect: any) => effect.uuid) : [],
          // An aura on the caster lasts while they keep it; a placed area runs out with the spell.
          ...(token ? {} : areaExpiry(item)),
        },
      },
    },
  }
}

/** Place the item's area from its card: auras go on the caster's token; the rest are placed by hand. */
export async function placeArea(item: any) {
  const area = itemArea(item)
  if (!area || !canvas.ready) return
  const token = item.actor?.getActiveTokens?.(false, true)?.find((entry: any) => entry.parent === canvas.scene) ?? null
  const onToken = area.areas.filter((entry) => entry.aura && entry.type === 'circle' && token)
  const placed = area.areas.filter((entry) => !onToken.includes(entry))
  if (onToken.length) {
    // Recasting an aura replaces the one already on the token.
    const old = canvas.scene.regions.filter((region: any) => region.attachment?.token?.id === token.id && region.flags?.crawlspace?.area?.item === item.uuid)
    if (old.length) await canvas.scene.deleteEmbeddedDocuments('Region', old.map((region: any) => region.id))
    await canvas.scene.createEmbeddedDocuments('Region', onToken.map((entry) => regionData(item, entry, token)))
  }
  if (placed.length) {
    ui.notifications.info(game.i18n.localize('CRAWLSPACE.Area.PlaceHint'))
    await canvas.regions.placeRegions(placed.map((entry) => regionData(item, entry)))
  }
}

/** The card's "place area" button, when the item has an area at its Rank. */
export function areaButton(item: any) {
  const area = itemArea(item)
  if (!area) return ''
  const aura = area.areas.find((entry) => entry.aura)?.aura
  const label = game.i18n.localize(aura ? `CRAWLSPACE.Area.Place${aura.kind === 'dread' ? 'Dread' : 'Aura'}` : 'CRAWLSPACE.Area.Place')
  const esc = foundry.utils.escapeHTML
  return `<div class="card-area"><button type="button" data-crawl-action="place-area" data-item-uuid="${esc(item.uuid)}"><i class="fa-solid fa-draw-circle"></i> ${esc(label)}</button></div>`
}

/* -------------------------------------------- */
/*  Aura behavior                               */
/* -------------------------------------------- */

type Side = 'party' | 'opposition' | 'neutral'

const sideOf = (token: any): Side => {
  const { FRIENDLY, HOSTILE } = CONST.TOKEN_DISPOSITIONS
  return token?.disposition === FRIENDLY ? 'party' : token?.disposition === HOSTILE ? 'opposition' : 'neutral'
}

const isCorpse = (token: any) => !!token?.actor?.statuses?.has?.(CONFIG.specialStatusEffects.DEFEATED) || Number(token?.actor?.system?.health?.value) <= 0

/** Is this token one the aura works on (proximityAuras.ts)? */
export function auraAffects(aura: { targets: string; includeSource: boolean }, source: any, token: any) {
  if (isCorpse(token)) return false
  if (source && token.id === source.id) return aura.includeSource
  if (aura.targets === 'everyone') return true
  const own: Side = source ? sideOf(source) : 'opposition'
  const side = sideOf(token)
  if (aura.targets === 'allies') return side !== 'neutral' && side === own
  return side !== 'neutral' && own !== 'neutral' && side !== own
}

const auraMarker = (effect: any) => effect.flags?.crawlspace?.aura

export function createAuraBehavior() {
  const { fields } = foundry.data
  const Base = foundry.data.regionBehaviors.RegionBehaviorType

  return class AuraBehavior extends Base {
    [key: string]: any
    static LOCALIZATION_PREFIXES = ['CRAWLSPACE.Aura']

    static defineSchema() {
      return {
        effects: new fields.SetField(new fields.DocumentUUIDField({ type: 'ActiveEffect', nullable: false })),
        kind: new fields.StringField({ required: true, initial: 'aura', choices: { aura: 'CRAWLSPACE.Aura.Kind.aura', dread: 'CRAWLSPACE.Aura.Kind.dread' } }),
        targets: new fields.StringField({
          required: true,
          initial: 'allies',
          choices: { allies: 'CRAWLSPACE.Aura.Targets.allies', enemies: 'CRAWLSPACE.Aura.Targets.enemies', everyone: 'CRAWLSPACE.Aura.Targets.everyone' },
        }),
        includeSource: new fields.BooleanField(),
        source: new fields.StringField({ required: true, blank: true }),
      }
    }

    /** The token the aura sides with: the one it's attached to, else its caster's. */
    get sourceToken() {
      return this.region?.attachment?.token ?? (this.source ? fromUuidSync(this.source) : null)
    }

    async apply(token: any) {
      const actor = token?.actor
      if (!actor || !auraAffects(this as any, this.sourceToken, token)) return
      const marker = this.behavior.uuid
      const have = new Set(actor.effects.filter((effect: any) => auraMarker(effect)?.behavior === marker).map((effect: any) => auraMarker(effect).effect))
      const effects = (await Promise.all([...this.effects].map((uuid: string) => fromUuid(uuid)))).filter((effect: any) => effect && !have.has(effect.uuid))
      if (!effects.length) return
      const data = effects.map((effect: any) => {
        const condition: any = conditionData(effect)
        // Inside the aura it lasts; leaving takes it away.
        delete condition.duration
        foundry.utils.setProperty(condition, 'flags.crawlspace.aura', { behavior: marker, effect: effect.uuid })
        return condition
      })
      await actor.createEmbeddedDocuments('ActiveEffect', data)
    }

    async remove(token: any) {
      const actor = token?.actor
      if (!actor) return
      const ids = actor.effects.filter((effect: any) => auraMarker(effect)?.behavior === this.behavior.uuid).map((effect: any) => effect.id)
      if (ids.length) await actor.deleteEmbeddedDocuments('ActiveEffect', ids)
    }

    static async #onEnter(this: any, event: any) {
      if (game.user.isActiveGM) await this.apply(event.data.token)
    }

    static async #onExit(this: any, event: any) {
      if (game.user.isActiveGM) await this.remove(event.data.token)
    }

    static async #onDeactivated(this: any) {
      if (!game.user.isActiveGM) return
      for (const token of this.region?.tokens ?? []) await this.remove(token)
    }

    static events = {
      [CONST.REGION_EVENTS.TOKEN_ENTER]: this.#onEnter,
      [CONST.REGION_EVENTS.TOKEN_EXIT]: this.#onExit,
      [CONST.REGION_EVENTS.BEHAVIOR_DEACTIVATED]: this.#onDeactivated,
    }
  }
}

/** Every aura behavior on the scene. */
const auraBehaviors = (scene: any) =>
  (scene?.regions?.contents ?? []).flatMap((region: any) => region.behaviors.filter((behavior: any) => behavior.type === 'aura' && !behavior.disabled))

export function registerAreas() {
  // A user places the area; the GM gives an aura area its behavior (only GMs may add Region behaviors).
  Hooks.on('createRegion', (region: any) => {
    const area = region.flags?.crawlspace?.area
    if (!game.user.isActiveGM || !area?.aura || region.behaviors.size) return
    region
      .createEmbeddedDocuments('RegionBehavior', [
        {
          type: 'aura',
          name: game.i18n.localize(`CRAWLSPACE.Aura.Kind.${area.aura.kind}`),
          system: { ...area.aura, effects: area.effects ?? [], source: area.source ?? '' },
        },
      ])
      .catch((error: any) => console.error('CrawlSpace | aura behavior', error))
  })

  // Sides change (a mob raised as a minion, a token turned hostile) or a target dies: who's in the aura changes.
  const reconsider = (token: any) => {
    if (!game.user.isActiveGM || !token?.parent) return
    for (const behavior of auraBehaviors(token.parent)) {
      const inside = behavior.region.tokens.has(token)
      const system = behavior.system
      if (inside && auraAffects(system, system.sourceToken, token)) system.apply(token)
      else system.remove(token)
    }
  }
  Hooks.on('updateToken', (token: any, changes: any) => {
    if (!('disposition' in changes)) return
    reconsider(token)
    // The aura's own side changed: everyone inside is weighed again.
    for (const behavior of auraBehaviors(token.parent).filter((entry: any) => entry.system.sourceToken?.id === token.id))
      for (const inside of behavior.region.tokens) reconsider(inside)
  })
  Hooks.on('updateActor', (actor: any) => {
    for (const token of actor.getActiveTokens?.(false, true) ?? []) reconsider(token)
  })

  // Placed areas end with their spell's duration, or with the combat.
  const expire = async (test: (area: any) => boolean) => {
    if (!game.user.isActiveGM) return
    for (const scene of game.scenes) {
      const ids = scene.regions.filter((region: any) => region.flags?.crawlspace?.area && test(region.flags.crawlspace.area)).map((region: any) => region.id)
      if (ids.length) await scene.deleteEmbeddedDocuments('Region', ids)
    }
  }
  Hooks.on('updateWorldTime', (worldTime: number) => expire((area) => Number.isFinite(area.expires) && area.expires <= worldTime))
  Hooks.on('deleteCombat', () => expire((area) => area.combat === true))

  // pf2e shows an aura's ring while its token is hovered, controlled or in combat; otherwise it stays faint.
  const refreshAuras = () => {
    if (!canvas.ready) return
    for (const region of canvas.regions?.placeables ?? []) {
      const area = region.document.flags?.crawlspace?.area
      const token = region.document.attachment?.token?.object
      if (!area?.aura || !token) continue
      const shown = token.hover || token.controlled || !!token.inCombat || canvas.regions.active
      region.alpha = shown ? 1 : 0.25
    }
  }
  for (const hook of ['hoverToken', 'controlToken', 'refreshRegion', 'combatStart', 'deleteCombat', 'canvasReady']) Hooks.on(hook, refreshAuras)
}

/* -------------------------------------------- */
/*  Item sheet editor                           */
/* -------------------------------------------- */

const TIERS = [
  { key: 'template', rank: 0 },
  { key: 'rank5Template', rank: 5 },
  { key: 'rank10Template', rank: 10 },
  { key: 'rank15Template', rank: 15 },
] as const

/** The area editor's rows: each Rank tier with its areas, published ones shown until edited. */
export function areaEditorContext(item: any) {
  const fields = areaFields(item)
  const rank = Math.floor(Number(item.system?.rank?.total) || 0)
  let current = ''
  for (const tier of TIERS) if (rank >= tier.rank && fields[tier.key] !== undefined) current = tier.key
  return {
    enabled: fields.areaTemplatesEnabled !== false,
    tiers: TIERS.map((tier) => ({
      key: tier.key,
      label: tier.rank ? game.i18n.localize(`CRAWLSPACE.Item.Upgrade${tier.rank}`) : game.i18n.localize('CRAWLSPACE.Area.Base'),
      current: tier.key === current,
      areas: (normalizeAbilityTemplate(fields[tier.key])?.areas ?? []).map((area, index) => ({
        index,
        ...area,
        auraKind: area.aura?.kind ?? '',
        auraTargets: area.aura?.targets ?? 'allies',
        auraSelf: !!area.aura?.includeSource,
      })),
    })),
  }
}

const NEW_AREA: AbilityTemplateArea = { type: 'circle', distance: 10, width: 5, angle: 60 }

/** Read the editor back into template fields and save them on the item. */
async function saveAreas(item: any, root: HTMLElement, change?: (fields: AbilityTemplateFields) => void) {
  const fields: AbilityTemplateFields = foundry.utils.deepClone(areaFields(item))
  for (const tier of TIERS) {
    const rows = root.querySelectorAll<HTMLElement>(`[data-area-tier="${tier.key}"] [data-area-index]`)
    if (!rows.length) continue
    const areas: AbilityTemplateArea[] = [...rows].map((row) => {
      const value = (name: string) => row.querySelector<HTMLInputElement>(`[data-area-field="${name}"]`)
      const number = (name: string, fallback: number) => {
        const parsed = Number(value(name)?.value)
        return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
      }
      const kind = value('auraKind')?.value
      const label = value('label')?.value?.trim()
      return {
        type: (value('type')?.value ?? 'circle') as AbilityTemplateArea['type'],
        distance: number('distance', 5),
        width: number('width', 5),
        angle: Math.min(360, number('angle', 60)),
        ...(value('atEnd')?.checked ? { atEnd: true } : {}),
        ...(label ? { label } : {}),
        ...(kind === 'aura' || kind === 'dread'
          ? { aura: { kind, targets: (value('auraTargets')?.value ?? 'allies') as any, includeSource: !!value('auraSelf')?.checked, effects: [] } }
          : {}),
      }
    })
    fields[tier.key] = { ...(fields[tier.key] ?? {}), areas }
  }
  const enabled = root.querySelector<HTMLInputElement>('[data-area-enabled]')
  if (enabled) fields.areaTemplatesEnabled = enabled.checked
  change?.(fields)
  const saved: Record<string, unknown> = {}
  for (const key of templateFields) if (fields[key] !== undefined) saved[key] = fields[key]
  saved.areaTemplatesEnabled = fields.areaTemplatesEnabled ?? true
  await item.update({ 'system.areas': foundry.data.operators.ForcedReplacement.create(saved) })
}

/** Wire the area editor in an item sheet. */
export function bindAreaEditor(root: HTMLElement, item: any, editable: boolean) {
  const editor = root.querySelector<HTMLElement>('.area-editor')
  if (!editor || !editable) return
  editor.addEventListener('change', (event) => {
    const target = event.target as HTMLElement
    if (!target.matches('[data-area-field], [data-area-enabled]')) return
    event.stopPropagation()
    saveAreas(item, editor)
  })
  editor.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLElement>('[data-area-op]')
    if (!button) return
    event.preventDefault()
    const tier = button.closest<HTMLElement>('[data-area-tier]')?.dataset.areaTier as keyof AbilityTemplateFields
    const index = Number(button.closest<HTMLElement>('[data-area-index]')?.dataset.areaIndex)
    saveAreas(item, editor, (fields: any) => {
      const areas: AbilityTemplateArea[] = [...(fields[tier]?.areas ?? [])]
      if (button.dataset.areaOp === 'add') areas.push({ ...NEW_AREA })
      else if (button.dataset.areaOp === 'remove') areas.splice(index, 1)
      // An emptied tier has no area (and stops a lower tier's area carrying up).
      fields[tier] = areas.length ? { ...(fields[tier] ?? {}), areas } : button.dataset.areaOp === 'clear' ? undefined : null
    })
  })
}
