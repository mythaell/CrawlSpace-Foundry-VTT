/**
 * Crawler frames (App.tsx party-status-rail): one frame per party crawler, with its pets, mounts and minions
 * under it. Each shows Health and Mana bars, and (for the GM) Evade, DR, Level, race and class, then its
 * condition badges. The GM can drag a crawler's Health in 10% steps. Badges follow the condition clicks: left
 * adds a stack, right takes one off, shift removes it. The panel can be dragged by its header; each user's
 * spot is remembered.
 */
import { followerKind, followersOf } from '../actors/companions'
import { clickCondition, isStackable } from '../effects/stacks'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

/** The party: crawlers that a player owns, or every crawler while no player owns one (a GM running them all). */
function partyCrawlers() {
  const crawlers = game.actors.contents.filter((actor: any) => actor.type === 'crawler' && actor.visible).sort((a: any, b: any) => a.name.localeCompare(b.name))
  const owned = crawlers.filter((actor: any) => actor.hasPlayerOwner)
  return owned.length ? owned : crawlers
}

/** Health in 10% steps at a point on the track (rounded down). */
const healthAt = (clientX: number, track: HTMLElement) => {
  const bounds = track.getBoundingClientRect()
  const ratio = Math.clamp((clientX - bounds.left) / Math.max(1, bounds.width), 0, 1)
  return Math.floor(ratio * 10 + 1e-6) * 10
}

const healthColor = (pct: number) => `hsl(${Math.floor((pct / 100) * 120)} 68% 42%)`

/** Under the floor timer, beside the scene controls. */
function defaultPosition() {
  const timers = document.getElementById('crawlspace-timers')?.getBoundingClientRect()
  const column = document.getElementById('ui-left-column-2')?.getBoundingClientRect()
  const left = Math.floor(column && column.left > 0 && column.left < window.innerWidth ? column.left : 115)
  const top = Math.floor(timers && timers.height ? timers.bottom + 30 : 190)
  return { left, top }
}

/** A condition badge. */
function badge(effect: any, shields: any[] = []) {
  const debuff = effect.system?.conditionType === 'debuff' || (effect.statuses?.size > 0 && effect.system?.conditionType !== 'buff')
  const stacks = Math.max(1, Number(effect.system?.stacks) || 1)
  // Permanent conditions have Infinity remaining: no time to show.
  const left = Number(effect.duration?.remaining)
  const remaining = Number.isFinite(left) && left > 0 ? effect.duration.label : ''
  return {
    id: effect.id,
    img: effect.img,
    name: effect.name,
    kind: debuff ? 'debuff' : 'buff',
    stacks: isStackable(effect) && stacks > 1 ? stacks : 0,
    tooltip: [effect.name, remaining, shieldText(shields.find((shield) => shield.id === effect.id))].filter(Boolean).join(' · '),
  }
}

const shieldText = (shield: any) => (shield ? game.i18n.format('CRAWLSPACE.Effect.ShieldCount', { remaining: shield.remaining, perSlot: shield.perSlot }) : '')

const conditionsOf = (actor: any) => {
  const shields = actor.conditionShields?.() ?? []
  return actor.effects.contents.filter((effect: any) => effect.active && !effect.flags?.crawlspace?.build).map((effect: any) => badge(effect, shields))
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
    },
  }

  static PARTS = { frames: { template: 'systems/crawlspace/templates/hud/frames.hbs' } }

  _insertElement(element: HTMLElement) {
    const existing = document.getElementById(element.id)
    if (existing) existing.replaceWith(element)
    else document.body.append(element)
    return element
  }

  async _prepareContext() {
    const gm = game.user.isGM
    const collapsed = !game.settings.get('crawlspace', 'crawlerFrames')
    const frames = partyCrawlers().map((actor: any) => {
      const system = actor.system
      const pct = Math.floor(system.health.pct ?? 0)
      const players = game.users.filter((user: any) => !user.isGM && actor.testUserPermission(user, 'OWNER')).map((user: any) => user.name)
      return {
        uuid: actor.uuid,
        name: actor.name,
        players: players.join(', '),
        pct,
        color: healthColor(pct),
        mana: { value: system.mana.value, max: system.mana.max, pct: Math.floor(system.mana.pct ?? 0) },
        effects: conditionsOf(actor),
        details: gm
          ? { evade: system.evade.total, dr: system.dr.total, level: system.details.level, race: system.details.race || '—', className: system.details.className || '—' }
          : null,
        followers: followersOf(actor).map((follower: any) => {
          const health = follower.system.health
          const percent = health.max > 0 ? Math.floor((health.value / health.max) * 100) : 0
          return {
            uuid: follower.uuid,
            name: follower.name,
            kind: game.i18n.localize(`CRAWLSPACE.Companion.${followerKind(follower)}`),
            health,
            pct: percent,
            color: healthColor(percent),
            effects: conditionsOf(follower),
          }
        }),
      }
    })
    return { frames, gm, collapsed }
  }

  _onRender(context: any, options: any) {
    super._onRender(context, options)
    const element = this.element as HTMLElement
    const saved = game.settings.get('crawlspace', 'crawlerFramesPosition') as { left: number; top: number } | null
    const position = saved && Number.isFinite(saved.top) ? saved : defaultPosition()
    Object.assign(element.style, { left: `${position.left}px`, top: `${position.top}px` })
    this.#bindDrag(element)
    for (const button of element.querySelectorAll<HTMLElement>('[data-effect-id]')) {
      button.addEventListener('click', (event) => this.#onBadge(event, button))
      button.addEventListener('contextmenu', (event) => this.#onBadge(event, button))
    }
    if (game.user.isGM) for (const track of element.querySelectorAll<HTMLElement>('[data-health-track]')) this.#bindHealth(track)
  }

  /** Drag the panel by its header; the spot is saved for this user. Double-click puts it back. */
  #bindDrag(element: HTMLElement) {
    const handle = element.querySelector<HTMLElement>('.crawl-frames-head')
    if (!handle) return
    handle.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || (event.target as HTMLElement).closest('[data-action]')) return
      event.preventDefault()
      const start = { x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop }
      handle.setPointerCapture(event.pointerId)
      const move = (moved: PointerEvent) => {
        const left = Math.clamp(start.left + moved.clientX - start.x, 0, window.innerWidth - 40)
        const top = Math.clamp(start.top + moved.clientY - start.y, 0, window.innerHeight - 30)
        Object.assign(element.style, { left: `${left}px`, top: `${top}px` })
      }
      const up = () => {
        handle.removeEventListener('pointermove', move)
        handle.removeEventListener('pointerup', up)
        game.settings.set('crawlspace', 'crawlerFramesPosition', { left: element.offsetLeft, top: element.offsetTop })
      }
      handle.addEventListener('pointermove', move)
      handle.addEventListener('pointerup', up)
    })
    handle.addEventListener('dblclick', () => game.settings.set('crawlspace', 'crawlerFramesPosition', null).then(() => this.render()))
  }

  #bindHealth(track: HTMLElement) {
    const fill = track.querySelector<HTMLElement>('.fill')
    const label = track.querySelector<HTMLElement>('span')
    const preview = (pct: number) => {
      if (fill) Object.assign(fill.style, { width: `${pct}%`, backgroundColor: healthColor(pct) })
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

  /** Health 0–100% is stored as 10–110 (the first 10 is the last slot before dying). */
  async #setHealth(track: HTMLElement, pct: number) {
    const actor: any = fromUuidSync(track.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')
    if (!actor) return
    const current = Number(actor.system.health.value) || 0
    const value = pct === 0 ? Math.min(current, 10) : pct + 10
    if (value === current) return this.render()
    await actor.update({ 'system.health.value': value })
  }

  async #onBadge(event: MouseEvent, button: HTMLElement) {
    event.preventDefault()
    event.stopPropagation()
    const actor: any = fromUuidSync(button.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')
    const effect = actor?.effects.get(button.dataset.effectId)
    if (!effect || !(game.user.isGM || actor.isOwner)) return
    await clickCondition(event, effect)
  }

  static async #onToggle(this: CrawlerFrames) {
    await game.settings.set('crawlspace', 'crawlerFrames', !game.settings.get('crawlspace', 'crawlerFrames'))
    this.render()
  }

  static #onOpenSheet(this: CrawlerFrames, _event: Event, target: HTMLElement) {
    fromUuidSync(target.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')?.sheet.render(true)
  }
}

let frames: CrawlerFrames | null = null

export function registerFrames() {
  game.settings.register('crawlspace', 'crawlerFrames', { scope: 'client', config: false, type: Boolean, default: true })
  game.settings.register('crawlspace', 'crawlerFramesPosition', { scope: 'client', config: false, type: Object, default: null })
  Hooks.once('ready', () => {
    frames = new CrawlerFrames()
    // After the floor timer has drawn, so the default spot sits under it.
    setTimeout(() => frames?.render(true), 250)
  })
  const refresh = foundry.utils.debounce(() => frames?.rendered && frames.render(), 100)
  const changed = (actor: any) => actor?.documentName === 'Actor' && refresh()
  Hooks.on('createActor', changed)
  Hooks.on('updateActor', changed)
  Hooks.on('deleteActor', changed)
  for (const hook of ['createActiveEffect', 'updateActiveEffect', 'deleteActiveEffect']) Hooks.on(hook, (effect: any) => changed(effect.parent))
  // Item changes (equipping armor, raising INT) move Evade, DR and Mana.
  for (const hook of ['createItem', 'updateItem', 'deleteItem']) Hooks.on(hook, (item: any) => changed(item.parent))
  for (const hook of ['updateUser', 'canvasReady', 'createToken', 'deleteToken']) Hooks.on(hook, refresh)
}
