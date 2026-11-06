/**
 * Crawler frames (App.tsx party-status-rail): one frame per party crawler beside the scene list, with its
 * Health and Mana bars and its buff/debuff badges. The GM's frames also show Evade, DR, Level, race and class,
 * let the GM drag Health in 10% steps, and open Awards or the crawler's Effects tab.
 * Right-clicking a badge removes that condition, for the GM or the crawler's owners.
 */
import { openAwards } from './awards'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

/** The party: crawlers that a player owns. */
const partyCrawlers = () =>
  game.actors.contents.filter((actor: any) => actor.type === 'crawler' && actor.hasPlayerOwner).sort((a: any, b: any) => a.name.localeCompare(b.name))

/** Health in 10% steps at a point on the track (rounded down). */
const healthAt = (clientX: number, track: HTMLElement) => {
  const bounds = track.getBoundingClientRect()
  const ratio = Math.clamp((clientX - bounds.left) / Math.max(1, bounds.width), 0, 1)
  return Math.floor(ratio * 10 + 1e-6) * 10
}

class CrawlerFrames extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS: any = {
    id: 'crawl-frames',
    classes: ['crawlspace', 'crawl-frames'],
    tag: 'aside',
    window: { frame: false, positioned: false },
    actions: {
      toggle: CrawlerFrames.#onToggle,
      openSheet: CrawlerFrames.#onOpenSheet,
      award: CrawlerFrames.#onAward,
      effects: CrawlerFrames.#onEffects,
    },
  }

  static PARTS = { frames: { template: 'systems/crawlspace/templates/hud/frames.hbs' } }

  /** Beside the scene list, under it. */
  _insertElement(element: HTMLElement) {
    const column = document.getElementById('ui-left-column-2')
    if (!column) return super._insertElement(element)
    const existing = document.getElementById(element.id)
    if (existing) existing.replaceWith(element)
    else column.append(element)
    return element
  }

  async _prepareContext() {
    const gm = game.user.isGM
    const collapsed = !game.settings.get('crawlspace', 'crawlerFrames')
    const frames = partyCrawlers().map((actor: any) => {
      const system = actor.system
      const pct = Math.floor(system.health.pct ?? 0)
      const players = game.users.filter((user: any) => !user.isGM && actor.testUserPermission(user, 'OWNER')).map((user: any) => user.name)
      const effects = actor.effects.contents
        .filter((effect: any) => effect.active && !effect.flags?.crawlspace?.build)
        .map((effect: any) => {
          // Status conditions count as debuffs unless marked as buffs.
          const debuff = effect.system?.conditionType === 'debuff' || (effect.statuses?.size > 0 && effect.system?.conditionType !== 'buff')
          const stacks = Number(effect.system?.stacks) || 1
          const remaining = effect.duration?.remaining ? effect.duration.label : ''
          return {
            id: effect.id,
            img: effect.img,
            name: effect.name,
            kind: debuff ? 'debuff' : 'buff',
            stacks: stacks > 1 ? stacks : 0,
            tooltip: [effect.name, remaining].filter(Boolean).join(' · '),
          }
        })
      return {
        uuid: actor.uuid,
        name: actor.name,
        players: players.join(', '),
        pct,
        color: `hsl(${Math.floor((pct / 100) * 120)} 68% 42%)`,
        mana: { value: system.mana.value, max: system.mana.max, pct: Math.floor(system.mana.pct ?? 0) },
        effects,
        canEdit: actor.isOwner,
        details: gm
          ? {
              evade: system.evade.total,
              dr: system.dr.total,
              level: system.details.level,
              race: system.details.race || '—',
              className: system.details.className || '—',
            }
          : null,
      }
    })
    return { frames, gm, collapsed }
  }

  _onRender(context: any, options: any) {
    super._onRender(context, options)
    for (const badge of (this.element as HTMLElement).querySelectorAll<HTMLElement>('[data-effect-id]'))
      badge.addEventListener('contextmenu', (event) => this.#removeEffect(event, badge))
    if (!game.user.isGM) return
    for (const track of (this.element as HTMLElement).querySelectorAll<HTMLElement>('[data-health-track]')) {
      const fill = track.querySelector<HTMLElement>('.fill')
      const label = track.querySelector<HTMLElement>('span')
      const preview = (pct: number) => {
        if (fill) Object.assign(fill.style, { width: `${pct}%`, backgroundColor: `hsl(${Math.floor((pct / 100) * 120)} 68% 42%)` })
        if (label) label.textContent = `${pct}%`
      }
      track.addEventListener('pointerdown', (event) => {
        if (event.button !== 0) return
        event.preventDefault()
        track.setPointerCapture(event.pointerId)
        preview(healthAt(event.clientX, track))
      })
      track.addEventListener('pointermove', (event) => {
        if (track.hasPointerCapture(event.pointerId)) preview(healthAt(event.clientX, track))
      })
      track.addEventListener('pointerup', (event) => {
        if (!track.hasPointerCapture(event.pointerId)) return
        track.releasePointerCapture(event.pointerId)
        this.#setHealth(track, healthAt(event.clientX, track))
      })
      track.addEventListener('pointercancel', () => this.render())
      track.addEventListener('keydown', (event) => {
        const keys: Record<string, (pct: number) => number> = {
          ArrowLeft: (pct) => pct - 10,
          ArrowDown: (pct) => pct - 10,
          ArrowRight: (pct) => pct + 10,
          ArrowUp: (pct) => pct + 10,
          Home: () => 0,
          End: () => 100,
        }
        if (!keys[event.key]) return
        event.preventDefault()
        this.#setHealth(track, Math.clamp(keys[event.key](Number(track.dataset.pct) || 0), 0, 100))
      })
    }
  }

  /** Health 0–100% is stored as 10–110 (the first 10 is the last slot before dying). */
  async #setHealth(track: HTMLElement, pct: number) {
    const actor: any = fromUuidSync(track.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')
    if (!actor) return
    const current = Number(actor.system.health.value) || 0
    const value = pct === 0 ? Math.min(current, 10) : pct + 10
    if (value === current) return this.render()
    await actor.update({ 'system.health.value': value })
  }

  async #removeEffect(event: MouseEvent, badge: HTMLElement) {
    event.preventDefault()
    event.stopPropagation()
    const actor: any = fromUuidSync(badge.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')
    const effect = actor?.effects.get(badge.dataset.effectId)
    if (!effect || !(game.user.isGM || actor.isOwner)) return
    await effect.delete()
  }

  static async #onToggle(this: CrawlerFrames) {
    await game.settings.set('crawlspace', 'crawlerFrames', !game.settings.get('crawlspace', 'crawlerFrames'))
    this.render()
  }

  static #actorOf(target: HTMLElement): any {
    return fromUuidSync(target.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')
  }

  static #onOpenSheet(this: CrawlerFrames, _event: Event, target: HTMLElement) {
    CrawlerFrames.#actorOf(target)?.sheet.render(true)
  }

  static #onAward(this: CrawlerFrames, _event: Event, target: HTMLElement) {
    const actor = CrawlerFrames.#actorOf(target)
    if (actor) return openAwards([actor])
  }

  static async #onEffects(this: CrawlerFrames, _event: Event, target: HTMLElement) {
    const sheet = CrawlerFrames.#actorOf(target)?.sheet
    if (!sheet) return
    await sheet.render(true)
    sheet.changeTab?.('effects', 'primary')
  }
}

let frames: CrawlerFrames | null = null

export function registerFrames() {
  game.settings.register('crawlspace', 'crawlerFrames', {
    name: 'CRAWLSPACE.Frames.Setting',
    hint: 'CRAWLSPACE.Frames.SettingHint',
    scope: 'client',
    config: false,
    type: Boolean,
    default: true,
  })
  Hooks.once('ready', () => {
    frames = new CrawlerFrames()
    frames.render(true)
  })
  const refresh = foundry.utils.debounce(() => frames?.rendered && frames.render(), 100)
  const crawlerChanged = (actor: any) => actor?.type === 'crawler' && refresh()
  Hooks.on('createActor', crawlerChanged)
  Hooks.on('updateActor', crawlerChanged)
  Hooks.on('deleteActor', crawlerChanged)
  for (const hook of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) Hooks.on(hook, (effect: any) => crawlerChanged(effect.parent))
  // Item changes (equipping armor, raising INT) move Evade, DR and Mana.
  for (const hook of ['createItem', 'updateItem', 'deleteItem']) Hooks.on(hook, (item: any) => crawlerChanged(item.parent))
  Hooks.on('updateUser', refresh)
}
