import { openGrinding } from './grinding'
/** GM time controls and shared countdowns (partyTimers.ts); all game timers use core world time. */
import { advanceTime } from '../time'
import { formatTime, restSeconds, timeParts, timePartsSeconds, type TimeParts } from '../rules/time'
import { rest, advanceMarked } from './upkeep'

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api

export type Countdown = { id: string; label: string; floor: boolean; visible: boolean; remaining: number; end: number | null; announced: boolean }

/** Remaining game seconds; paused timers retain their saved value. */
export const timerRemaining = (timer: Countdown) => Math.max(0, timer.end === null ? timer.remaining : timer.end - game.time.worldTime)

/** Label every countdown unit so the thirty-hour day is unambiguous. */
function labeledTime(seconds: number) {
  return Object.entries(timeParts(seconds)).map(([unit, value]) => `${value} ${game.i18n.localize(`CRAWLSPACE.Time.${unit}`)}`).join(' ')
}

/** Read explicit fields, accepting values such as ninety minutes or thirty-five hours. */
function readTimeFields(element: HTMLElement) {
  return timePartsSeconds(Object.fromEntries(['days', 'hours', 'minutes', 'seconds'].map((unit) => [unit, Number(element.querySelector<HTMLInputElement>(`[name=${unit}]`)?.value ?? 0)])) as TimeParts)
}

/** Normalize on change without moving focus or re-rendering the form. */
function bindTimeFields(element: HTMLElement) {
  for (const input of element.querySelectorAll<HTMLInputElement>('[data-time-field]')) {
    if (input.dataset.timeBound) continue
    input.dataset.timeBound = 'true'
    const normalize = () => {
      try {
        const parts = timeParts(readTimeFields(element))
        for (const [unit, value] of Object.entries(parts)) element.querySelector<HTMLInputElement>(`[name=${unit}]`)!.value = String(value)
      } catch {
        ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Time.InvalidDuration'))
      }
    }
    input.addEventListener('change', normalize)
    input.addEventListener('blur', normalize)
  }
}

/** Prompt at first GM entry, and allow the remaining time to be corrected later. */
async function promptTimer(timer?: Countdown) {
  const content = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/dialogs/time-fields.hbs', timeParts(timer ? timerRemaining(timer) : 0))
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.localize(timer ? 'CRAWLSPACE.Time.Edit' : 'CRAWLSPACE.Time.SetFloor') },
    classes: ['crawlspace', 'time-panel'],
    content: `<p>${game.i18n.localize('CRAWLSPACE.Time.FloorPrompt')}</p>${content}`,
    rejectClose: false,
    render: (_event: Event, dialog: any) => bindTimeFields(dialog.element),
    ok: { label: game.i18n.localize('CRAWLSPACE.Time.Save'), callback: (_event: Event, button: any) => readTimeFields(button.form) },
  })
  if (answer == null || answer === false) return
  if (!(answer > 0)) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Time.InvalidDuration'))
  const timers: Countdown[] = foundry.utils.deepClone(game.settings.get('crawlspace', 'timers'))
  if (timer) {
    const saved = timers.find((entry) => entry.id === timer.id)
    if (!saved) return
    saved.remaining = answer
    saved.end = saved.end === null ? null : game.time.worldTime + answer
    saved.announced = false
  } else {
    timers.push({ id: foundry.utils.randomID(), label: game.i18n.localize('CRAWLSPACE.Time.Floor'), floor: true, visible: true, remaining: answer, end: game.time.worldTime + answer, announced: false })
  }
  await game.settings.set('crawlspace', 'timers', timers)
}

/** A persistent table display keeps the floor clock visible even when the control panel is closed. */
function renderTimerHud() {
  if (!game.ready) return
  let hud = document.getElementById('crawlspace-timers')
  if (!hud) {
    hud = document.createElement('aside')
    hud.id = 'crawlspace-timers'
    hud.className = 'crawlspace'
    hud.addEventListener('click', openTime)
    document.body.append(hud)
  }
  const timers: Countdown[] = game.settings.get('crawlspace', 'timers')
  const visible = timers.filter((timer) => game.user.isGM || timer.visible).sort((a, b) => Number(b.floor) - Number(a.floor))
  hud.replaceChildren()
  for (const timer of visible) {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = timer.floor ? 'floor-timer' : ''
    const label = document.createElement('strong')
    label.textContent = timer.label
    const output = document.createElement('span')
    output.textContent = labeledTime(timerRemaining(timer))
    if (timer.end === null || game.paused || (!game.settings.get('crawlspace', 'clockRunning') && !game.combat?.started)) output.textContent += ` · ${game.i18n.localize('CRAWLSPACE.Time.Stopped')}`
    button.append(label, output)
    hud.append(button)
  }
  if (!visible.length && game.user.isGM) {
    const button = document.createElement('button')
    button.textContent = game.i18n.localize('CRAWLSPACE.Time.SetFloor')
    button.addEventListener('click', (event) => { event.stopPropagation(); void promptTimer() })
    hud.append(button)
  }
}

/** Shared clock panel, with controls restricted to the GM. */
export class CrawlTime extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS: any = {
    id: 'crawlspace-time',
    classes: ['crawlspace', 'time-panel'],
    position: { width: 560, height: 740 },
    window: { title: 'CRAWLSPACE.Time.Title', resizable: true },
    actions: { clock: CrawlTime.#clock, add: CrawlTime.#add, pause: CrawlTime.#pause, remove: CrawlTime.#remove, skip: CrawlTime.#skip, edit: CrawlTime.#edit },
  }

  busy = false

  static PARTS = { main: { template: 'systems/crawlspace/templates/dialogs/time.hbs', scrollable: [''] } }

  async _prepareContext() {
    const timers: Countdown[] = game.settings.get('crawlspace', 'timers')
    return {
      isGM: game.user.isGM,
      running: game.settings.get('crawlspace', 'clockRunning'),
      paused: game.paused,
      worldTime: formatTime(game.time.worldTime),
      timers: timers.filter((timer) => game.user.isGM || timer.visible).sort((a, b) => Number(b.floor) - Number(a.floor)).map((timer) => ({ ...timer, time: labeledTime(timerRemaining(timer)), running: timer.end !== null, ended: timerRemaining(timer) === 0 })),
      actors: game.actors.filter((actor: any) => actor.type === 'crawler').map((actor: any) => ({ id: actor.id, name: actor.name })),
    }
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    bindTimeFields(this.element)
  }

  static async #edit(_event: Event, target: HTMLElement) {
    if (!game.user.isGM) return
    const timer = game.settings.get('crawlspace', 'timers').find((entry: Countdown) => entry.id === target.dataset.id)
    if (timer) await promptTimer(timer)
  }

  static async #clock() {
    if (game.user.isGM) await game.settings.set('crawlspace', 'clockRunning', !game.settings.get('crawlspace', 'clockRunning'))
  }

  static async #add(this: CrawlTime) {
    if (!game.user.isGM) return
    const fields = this.element
    let seconds: number
    try { seconds = readTimeFields(fields) } catch { return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Time.InvalidDuration')) }
    const label = fields.querySelector('[name=label]').value.trim()
    if (!label || seconds === null || seconds <= 0) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Time.InvalidDuration'))
    const timers: Countdown[] = foundry.utils.deepClone(game.settings.get('crawlspace', 'timers'))
    const floor = fields.querySelector('[name=floor]').checked
    if (floor) for (const timer of timers) timer.floor = false
    timers.push({ id: foundry.utils.randomID(), label, floor, visible: fields.querySelector('[name=visible]').checked, remaining: seconds, end: game.time.worldTime + seconds, announced: false })
    await game.settings.set('crawlspace', 'timers', timers)
  }

  static async #pause(_event: Event, target: HTMLElement) {
    if (!game.user.isGM) return
    const timers: Countdown[] = foundry.utils.deepClone(game.settings.get('crawlspace', 'timers'))
    const timer = timers.find((entry) => entry.id === target.dataset.id)
    if (!timer) return
    timer.remaining = timerRemaining(timer)
    timer.end = timer.end === null ? game.time.worldTime + timer.remaining : null
    await game.settings.set('crawlspace', 'timers', timers)
  }

  static async #remove(_event: Event, target: HTMLElement) {
    if (!game.user.isGM) return
    await game.settings.set('crawlspace', 'timers', game.settings.get('crawlspace', 'timers').filter((timer: Countdown) => timer.id !== target.dataset.id))
  }

  static async #skip(this: CrawlTime) {
    if (!game.user.isGM || this.busy) return
    this.busy = true
    try {
      const kind = this.element.querySelector('[name=activity]').value
      const hours = Number(this.element.querySelector('[name=skipHours]').value)
      if (!Number.isSafeInteger(hours) || hours < 0 || hours > 30000) throw new Error(game.i18n.localize('CRAWLSPACE.Time.InvalidDuration'))
      const actors = [...this.element.querySelectorAll('[name=actor]:checked')].map((input: any) => game.actors.get(input.value)).filter(Boolean)
      if (kind !== 'skip' && !actors.length) throw new Error(game.i18n.localize('CRAWLSPACE.Time.SelectActors'))
      if (kind === 'grinding') return await openGrinding(actors, hours)
      const recovery = ['short', 'long', 'full', 'hourly'].includes(kind)
      const seconds = recovery ? restSeconds(kind, hours) : hours * 3600
      await advanceTime(seconds)
      for (const actor of actors) {
        if (recovery) await rest(actor, kind as any, hours, { advance: false })
        if (kind === 'safeRoom') {
          await advanceMarked(actor, 'safeRoom')
        }
      }
      ui.notifications.info(game.i18n.format('CRAWLSPACE.Time.Skipped', { time: formatTime(seconds) }))
    } catch (error: any) {
      ui.notifications.error(error.message)
    } finally {
      this.busy = false
    }
  }
}

/** Open the shared timer panel from the tracker or an actor's upkeep menu. */
export function openTime() {
  const existing = foundry.applications.instances.get('crawlspace-time')
  return (existing ?? new CrawlTime()).render({ force: true })
}

/** Persist timers, announce completion once, and optionally advance core time during exploration. */
export function registerClock() {
  const refresh = () => {
    foundry.applications.instances.get('crawlspace-time')?.render(false)
    renderTimerHud()
  }
  game.settings.register('crawlspace', 'timers', { scope: 'world', config: false, type: Array, default: [], onChange: refresh })
  game.settings.register('crawlspace', 'clockRunning', { scope: 'world', config: false, type: Boolean, default: false, onChange: refresh })
  Hooks.on('updateWorldTime', async () => {
    renderTimerHud()
    const panel = foundry.applications.instances.get('crawlspace-time')
    if (panel?.rendered) {
      const elapsed = panel.element.querySelector('[data-world-time]')
      if (elapsed) elapsed.textContent = formatTime(game.time.worldTime)
      for (const timer of game.settings.get('crawlspace', 'timers')) {
        const output = panel.element.querySelector(`[data-timer="${timer.id}"]`)
        if (output) output.textContent = labeledTime(timerRemaining(timer))
      }
    }
    if (!game.user.isActiveGM) return
    const timers: Countdown[] = foundry.utils.deepClone(game.settings.get('crawlspace', 'timers'))
    const ended = timers.filter((timer) => !timer.announced && timerRemaining(timer) === 0)
    if (!ended.length) return
    for (const timer of ended) timer.announced = true
    await game.settings.set('crawlspace', 'timers', timers)
    for (const timer of ended) {
      await ChatMessage.create({
        content: `<p>${foundry.utils.escapeHTML(game.i18n.format('CRAWLSPACE.Time.Finished', { name: timer.label }))}</p>`,
        whisper: timer.visible ? [] : game.users.filter((user: any) => user.isGM).map((user: any) => user.id),
      })
    }
  })
  Hooks.on('ready', () => {
    renderTimerHud()
    if (game.user.isActiveGM && !game.settings.get('crawlspace', 'timers').some((timer: Countdown) => timer.floor)) void promptTimer()
  })
  Hooks.on('pauseGame', renderTimerHud)
  let last = Date.now()
  let ticking = false
  setInterval(async () => {
    const now = Date.now()
    const seconds = Math.floor((now - last) / 1000)
    last += seconds * 1000
    if (!seconds || ticking || !game.user?.isActiveGM || game.paused || !game.settings.get('crawlspace', 'clockRunning')) return
    if (game.combats.some((combat: any) => combat.active && combat.started)) return
    ticking = true
    try {
      // Do not charge time spent asleep or disconnected to the party.
      await advanceTime(Math.min(seconds, 5))
    } catch (error) {
      console.error('CrawlSpace | clock', error)
    } finally {
      ticking = false
    }
  }, 1000)
  Hooks.on('renderCombatTracker', (_app: any, html: HTMLElement) => {
    if (html.querySelector('[data-crawl-time]')) return
    const button = document.createElement('button')
    button.dataset.crawlTime = ''
    button.innerText = game.i18n.localize('CRAWLSPACE.Time.Title')
    button.addEventListener('click', openTime)
    html.querySelector('.directory-header')?.append(button)
  })
}
