/**
 * Map grid calibration (GridAlignmentWizard.tsx), on the Foundry canvas. Four steps in a floating panel:
 *   1. Anchor: click a grid intersection printed on the map (drag or arrow keys to refine it).
 *   2. Horizontal: set the distance per square, then click the intersection three squares across.
 *   3. Vertical: click the intersection three squares down.
 *   4. Fine tune: check the corners against a preview grid; nudge each axis's spacing (or drag a preview line).
 * Done scales the map so a printed square is one grid square and shifts it onto the grid
 * (rules/grid-calibration.ts). Right-drag pans and the wheel zooms as usual; Escape cancels.
 */
import { calibrationUpdate, cellFromMeasure, gridIntersection, referencePoint, type Point, type Rect } from '../rules/grid-calibration'

type Step = 1 | 2 | 3 | 4

const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ''))
const t = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(`CRAWLSPACE.Calibrate.${key}`, data) : game.i18n.localize(`CRAWLSPACE.Calibrate.${key}`))

let active: GridCalibration | null = null

class GridCalibration {
  scene: any
  step: Step = 1
  color = '#39ff14'
  anchor: Point | null = null
  horizontal: Point | null = null
  vertical: Point | null = null
  cursor: Point | null = null
  fine = { x: 1, y: 1 }
  distance: string
  units: string
  saving = false
  graphics: any
  panel!: HTMLElement
  drag: { id: number; start: Point; fine: { x: number; y: number }; axisX: boolean; axisY: boolean } | null = null
  hold: number | null = null
  hooks: [string, number][] = []
  listeners: [EventTarget, string, EventListener, boolean][] = []

  constructor(scene: any) {
    this.scene = scene
    this.distance = String(scene.grid.distance)
    this.units = String(scene.grid.units ?? '')
  }

  /* ---------------------------------------- */
  /*  Geometry                                */
  /* ---------------------------------------- */

  /** The map image on the canvas (the viewed level's background). */
  get image(): Rect {
    const mesh = canvas.primary?.background
    if (mesh?.texture?.valid && mesh.width > 0) return { x: mesh.x - mesh.width * mesh.anchor.x, y: mesh.y - mesh.height * mesh.anchor.y, width: mesh.width, height: mesh.height }
    const rect = canvas.dimensions.sceneRect
    return { x: rect.x, y: rect.y, width: rect.width, height: rect.height }
  }

  get cellX() {
    return this.anchor ? cellFromMeasure(this.anchor, this.horizontal) * this.fine.x : 0
  }

  get cellY() {
    return this.anchor ? cellFromMeasure(this.anchor, this.vertical) * this.fine.y : 0
  }

  /** On-screen pixels per canvas pixel. */
  get zoom() {
    return canvas.stage.scale.x || 1
  }

  get canAdvance() {
    if (this.step === 1) return !!this.anchor
    if (this.step === 2) return cellFromMeasure(this.anchor!, this.horizontal) * 3 >= 1 && this.validMeasure
    if (this.step === 3) return cellFromMeasure(this.anchor!, this.vertical) * 3 >= 1
    return this.cellX > 0 && this.cellY > 0
  }

  get validMeasure() {
    const distance = Number(this.distance)
    return Number.isFinite(distance) && distance >= 0.01 && distance <= 100000 && !!this.units.trim()
  }

  pointAt(event: PointerEvent): Point {
    return canvas.canvasCoordinatesFromClient({ x: event.clientX, y: event.clientY })
  }

  /* ---------------------------------------- */
  /*  Lifecycle                               */
  /* ---------------------------------------- */

  start() {
    this.graphics = new PIXI.Graphics()
    this.graphics.eventMode = 'none'
    canvas.interface.addChild(this.graphics)
    this.panel = document.createElement('section')
    this.panel.className = 'crawlspace crawl-calibration'
    this.panel.setAttribute('role', 'dialog')
    this.panel.setAttribute('aria-label', t('Title'))
    document.body.append(this.panel)
    this.bindPanel()
    const view = canvas.app.view as HTMLCanvasElement
    this.listen(view, 'pointerdown', (event) => this.onPointerDown(event as PointerEvent), true)
    this.listen(window, 'pointermove', (event) => this.onPointerMove(event as PointerEvent), true)
    this.listen(window, 'pointerup', (event) => this.onPointerUp(event as PointerEvent), true)
    this.listen(window, 'keydown', (event) => this.onKey(event as KeyboardEvent), true)
    this.listen(window, 'blur', () => this.stopHold(), false)
    this.hooks.push(['canvasPan', Hooks.on('canvasPan', () => this.draw())])
    // Leaving the scene ends the calibration.
    this.hooks.push(['canvasTearDown', Hooks.on('canvasTearDown', () => this.close())])
    this.render()
  }

  listen(target: EventTarget, type: string, handler: EventListener, capture: boolean) {
    target.addEventListener(type, handler, capture)
    this.listeners.push([target, type, handler, capture])
  }

  close() {
    this.stopHold()
    for (const [target, type, handler, capture] of this.listeners) target.removeEventListener(type, handler, capture)
    for (const [hook, id] of this.hooks) Hooks.off(hook, id)
    if (this.graphics && !this.graphics.destroyed) this.graphics.destroy()
    this.panel?.remove()
    if (active === this) active = null
  }

  /* ---------------------------------------- */
  /*  Canvas input                            */
  /* ---------------------------------------- */

  onPointerDown(event: PointerEvent) {
    // Only the left button is ours; right/middle drag and the wheel pan and zoom the canvas.
    if (event.button !== 0 || this.saving) return
    const point = this.pointAt(event)
    let axisX = false
    let axisY = false
    if (this.step === 4) {
      // Fine tune: grab a preview line and drag it to stretch that axis around the anchor.
      const near = gridIntersection(point, this.cellX, this.cellY, this.anchor!)
      axisX = Math.abs(point.x - near.x) * this.zoom < 10
      axisY = Math.abs(point.y - near.y) * this.zoom < 10
      if (!axisX && !axisY) return
    }
    event.preventDefault()
    event.stopImmediatePropagation()
    this.drag = { id: event.pointerId, start: point, fine: { ...this.fine }, axisX, axisY }
    this.place(point)
  }

  onPointerMove(event: PointerEvent) {
    if (!canvas.ready) return
    const point = this.pointAt(event)
    this.cursor = (event.target as HTMLElement) === canvas.app.view ? point : null
    if (this.drag?.id === event.pointerId) {
      event.stopImmediatePropagation()
      if (this.step === 4) this.stretch(point)
      else this.place(point)
      this.render()
    } else this.draw()
  }

  onPointerUp(event: PointerEvent) {
    if (this.drag?.id !== event.pointerId) return
    event.stopImmediatePropagation()
    this.drag = null
  }

  /** Steps 1-3: put the anchor or the measurement point here. */
  place(point: Point) {
    if (this.step === 1) {
      this.anchor = point
      this.horizontal = null
      this.vertical = null
    } else if (this.step === 2) this.horizontal = referencePoint(this.anchor!, point, 'x')
    else if (this.step === 3) this.vertical = referencePoint(this.anchor!, point, 'y')
    this.render()
  }

  /** Step 4: a dragged preview line scales its axis around the anchor. */
  stretch(point: Point) {
    const drag = this.drag!
    const anchor = this.anchor!
    const dx = drag.start.x - anchor.x
    const dy = drag.start.y - anchor.y
    const sx = drag.axisX && Math.abs(dx) > this.cellX / 2 ? Math.max(0.05, (point.x - anchor.x) / dx) : 1
    const sy = drag.axisY && Math.abs(dy) > this.cellY / 2 ? Math.max(0.05, (point.y - anchor.y) / dy) : 1
    this.fine = { x: Math.clamp(drag.fine.x * sx, 0.5, 2), y: Math.clamp(drag.fine.y * sy, 0.5, 2) }
  }

  onKey(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (!this.saving) this.close()
      return
    }
    const target = event.target as HTMLElement
    if (target?.isContentEditable || target?.closest?.('input, select, textarea')) return
    if (event.ctrlKey || event.metaKey || event.altKey || this.saving) return
    if (event.key === 'Enter' && !event.repeat) {
      if (target?.closest?.('button')) return
      event.preventDefault()
      event.stopImmediatePropagation()
      void this.next()
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      // Arrows would pan the canvas; here they nudge (Shift: ×10).
      event.preventDefault()
      event.stopImmediatePropagation()
      this.nudge(event.key, event.shiftKey)
    }
  }

  nudge(key: string, large: boolean) {
    const amount = large ? 10 : 1
    const dx = key === 'ArrowRight' ? amount : key === 'ArrowLeft' ? -amount : 0
    const dy = key === 'ArrowDown' ? amount : key === 'ArrowUp' ? -amount : 0
    if (this.step === 1 && this.anchor) this.place({ x: this.anchor.x + dx, y: this.anchor.y + dy })
    else if (this.step === 2 && this.horizontal) this.place({ x: this.horizontal.x + dx, y: this.horizontal.y })
    else if (this.step === 3 && this.vertical) this.place({ x: this.vertical.x, y: this.vertical.y + dy })
    else if (this.step === 4) this.scaleAxis(dx ? 'x' : 'y', (key === 'ArrowRight' || key === 'ArrowUp' ? 1 : -1) * amount * 0.0001)
  }

  scaleAxis(axis: 'x' | 'y', change: number) {
    this.fine = { ...this.fine, [axis]: Math.clamp(this.fine[axis] + change, 0.5, 2) }
    this.render()
  }

  /** Hold − or + for continuous micro adjustments (speeding up after a quarter second). */
  startHold(axis: 'x' | 'y', direction: number) {
    this.stopHold()
    this.scaleAxis(axis, direction * 0.0001)
    let start: number | null = null
    let previous = 0
    const repeat = (now: number) => {
      if (start === null) {
        start = now
        previous = now + 250
      }
      if (now > start + 250) {
        this.scaleAxis(axis, (direction * 0.0001 * Math.min(50, now - previous)) / (1000 / 60))
        previous = now
      }
      this.hold = requestAnimationFrame(repeat)
    }
    this.hold = requestAnimationFrame(repeat)
  }

  stopHold() {
    if (this.hold !== null) cancelAnimationFrame(this.hold)
    this.hold = null
  }

  /* ---------------------------------------- */
  /*  Steps                                   */
  /* ---------------------------------------- */

  async next() {
    if (this.saving || !this.canAdvance) return
    this.drag = null
    if (this.step < 4) {
      if (this.step === 3) this.fine = { x: 1, y: 1 }
      this.step = (this.step + 1) as Step
      return this.render()
    }
    this.stopHold()
    this.saving = true
    this.render()
    try {
      await this.save()
      ui.notifications.info(t('Saved'))
      this.close()
    } catch (error: any) {
      this.saving = false
      ui.notifications.error(error.message)
      this.render()
    }
  }

  back() {
    this.drag = null
    this.step = Math.max(1, this.step - 1) as Step
    this.render()
  }

  /** Scale the map so a printed square is one grid square, and shift the anchor onto the grid. */
  async save() {
    const scene = this.scene
    const dimensions = canvas.dimensions
    const update = calibrationUpdate({
      width: scene.width,
      height: scene.height,
      gridSize: scene.grid.size,
      sceneRect: { x: dimensions.sceneRect.x, y: dimensions.sceneRect.y, width: dimensions.sceneRect.width, height: dimensions.sceneRect.height },
      image: this.image,
      anchor: this.anchor!,
      cellX: this.cellX,
      cellY: this.cellY,
      dimensionsX: (width) => scene.grid.calculateDimensions(width, scene.height, scene.padding).x,
      dimensionsY: (height) => scene.grid.calculateDimensions(scene.width, height, scene.padding).y,
    })
    await scene.update({ ...update, 'grid.distance': Number(this.distance), 'grid.units': this.units.trim() })
  }

  /** Zoom to a corner or the center of the map, about 110 screen pixels to a square. */
  inspect(fx: number, fy: number) {
    const image = this.image
    const cell = this.step === 4 && this.cellX > 0 ? this.cellX : canvas.dimensions.size
    const scale = Math.clamp(110 / cell, CONFIG.Canvas.minZoom ?? 0.1, CONFIG.Canvas.maxZoom ?? 3)
    canvas.animatePan({ x: image.x + image.width * fx, y: image.y + image.height * fy, scale, duration: 250 })
  }

  /* ---------------------------------------- */
  /*  Drawing                                 */
  /* ---------------------------------------- */

  draw() {
    const g = this.graphics
    if (!g || g.destroyed) return
    g.clear()
    const color = Number(foundry.utils.Color.from(this.color))
    const px = 1 / this.zoom
    const image = this.image
    const anchor = this.anchor
    // Crossbars through the cursor while placing points.
    if (this.cursor && this.step < 4) {
      g.lineStyle(px, color, 0.8)
      g.moveTo(image.x - 200, this.cursor.y).lineTo(image.x + image.width + 200, this.cursor.y)
      g.moveTo(this.cursor.x, image.y - 200).lineTo(this.cursor.x, image.y + image.height + 200)
    }
    if (this.step === 4 && anchor && this.cellX > 1 && this.cellY > 1) {
      // The preview grid over the map (plus a margin), through the anchor.
      g.lineStyle(2.5 * px, color, 0.9)
      const left = image.x - 100
      const right = image.x + image.width + 100
      const top = image.y - 100
      const bottom = image.y + image.height + 100
      for (let x = anchor.x + Math.ceil((left - anchor.x) / this.cellX) * this.cellX; x <= right; x += this.cellX) g.moveTo(x, top).lineTo(x, bottom)
      for (let y = anchor.y + Math.ceil((top - anchor.y) / this.cellY) * this.cellY; y <= bottom; y += this.cellY) g.moveTo(left, y).lineTo(right, y)
    }
    if (anchor) {
      const size = Math.max(24 * px, canvas.dimensions.size * (this.step === 1 ? 0.6 : 0.2))
      if (this.step === 1) {
        g.lineStyle(px, color, 1)
        g.beginFill(color, 0.08).drawCircle(anchor.x, anchor.y, size / 2).endFill()
      }
      g.lineStyle(px, color, 1)
      g.moveTo(anchor.x - size / 2, anchor.y).lineTo(anchor.x + size / 2, anchor.y)
      g.moveTo(anchor.x, anchor.y - size / 2).lineTo(anchor.x, anchor.y + size / 2)
    }
    if ((this.step === 2 || this.step === 3) && anchor) {
      // Each measurement: a line with ticks at every square, and a dot at the chosen point.
      for (const point of [this.horizontal, this.vertical]) {
        if (!point) continue
        const dx = point.x - anchor.x
        const dy = point.y - anchor.y
        const length = Math.hypot(dx, dy)
        if (!length) continue
        const tick = Math.max(6 * px, canvas.dimensions.size * 0.08)
        g.lineStyle(2 * px, color, 1)
        g.moveTo(anchor.x, anchor.y).lineTo(point.x, point.y)
        for (let index = 0; index <= 3; index++) {
          const tx = anchor.x + (dx * index) / 3
          const ty = anchor.y + (dy * index) / 3
          g.moveTo(tx - (dy / length) * tick, ty + (dx / length) * tick).lineTo(tx + (dy / length) * tick, ty - (dx / length) * tick)
        }
        g.lineStyle(px, 0xffffff, 1)
        g.beginFill(color, 1).drawCircle(point.x, point.y, Math.max(4 * px, canvas.dimensions.size * 0.06)).endFill()
      }
    }
  }

  /* ---------------------------------------- */
  /*  Panel                                   */
  /* ---------------------------------------- */

  render() {
    this.draw()
    const step = this.step
    const measure = step === 2 ? this.horizontal : this.vertical
    const span = this.anchor ? cellFromMeasure(this.anchor, measure) * 3 : 0
    const status =
      step === 1
        ? this.anchor
          ? `X: ${this.anchor.x.toFixed(1)}, Y: ${this.anchor.y.toFixed(1)}`
          : t('StatusAnchor')
        : step === 2 || step === 3
          ? span >= 1
            ? t('StatusSpan', { px: span.toFixed(2), distance: `${Number(this.distance) * 3} ${this.units.trim()}` })
            : t(step === 2 ? 'StatusHorizontal' : 'StatusVertical')
          : t('StatusCorners')
    const navigator = [
      ['TopLeft', 0, 0, '⌜'],
      ['TopRight', 1, 0, '⌝'],
      ['Center', 0.5, 0.5, '□'],
      ['BottomLeft', 0, 1, '⌞'],
      ['BottomRight', 1, 1, '⌟'],
    ]
      .map(([name, x, y, icon]) => `<button type="button" data-inspect="${x},${y}" style="grid-column:${Number(x) * 2 + 1};grid-row:${Number(y) * 2 + 1}" data-tooltip="${esc(t(`Zoom${name}`))}" aria-label="${esc(t(`Zoom${name}`))}">${icon}</button>`)
      .join('')
    const sliders =
      step === 4
        ? `<div class="calibration-sliders">${(['x', 'y'] as const)
            .map((axis) => {
              const percent = this.fine[axis] * 100
              return `<label><span>${t(axis === 'x' ? 'HorizontalScale' : 'VerticalScale')} <output>${percent.toFixed(2)}%</output></span>
                <div><button type="button" data-hold="${axis}" data-direction="-1" aria-label="−">−</button>
                <input type="range" data-fine="${axis}" min="${Math.min(95, Math.floor(percent))}" max="${Math.max(105, Math.ceil(percent))}" step="0.001" value="${percent}">
                <button type="button" data-hold="${axis}" data-direction="1" aria-label="+">+</button></div></label>`
            })
            .join('')}<button type="button" data-op="resetFine">${t('ResetFine')}</button></div>`
        : ''
    const measureFields =
      step === 2
        ? `<div class="calibration-measure">
            <label>${t('Distance')} <input type="number" data-field="distance" min="0.01" max="100000" step="any" value="${esc(this.distance)}"></label>
            <label>${t('Units')} <input type="text" data-field="units" maxlength="20" value="${esc(this.units)}"></label>
            <p data-three>${this.validMeasure ? t('ThreeSquares', { distance: `${Number(this.distance) * 3} ${this.units.trim()}` }) : t('InvalidMeasure')}</p>
          </div>`
        : ''
    const position = this.panel.style.left ? { left: this.panel.style.left, top: this.panel.style.top } : null
    this.panel.innerHTML = `
      <header class="calibration-title"><strong>${t('Title')}</strong><button type="button" data-op="cancel" aria-label="${esc(t('Cancel'))}" ${this.saving ? 'disabled' : ''}>×</button></header>
      <fieldset ${this.saving ? 'disabled' : ''}>
        <div class="calibration-view"><div class="calibration-navigator">${navigator}</div><p>${t('Inspect')}</p></div>
        <strong aria-live="polite">${t('StepOf', { step, name: t(`Step${step}`) })}</strong>
        <p class="calibration-instructions">${t(`Help${step}`)}</p>
        <label class="calibration-color">${t('Color')} <input type="color" data-field="color" value="${this.color}"></label>
        ${measureFields}${sliders}
        <p class="calibration-status">${esc(status)}</p>
        <p class="calibration-help">${t(step === 1 ? 'KeysAnchor' : step < 4 ? 'KeysPoint' : 'KeysScale')} · ${t('KeysPan')}</p>
        <div class="calibration-actions">
          <button type="button" data-op="cancel">${t('Cancel')}</button>
          ${step > 1 ? `<button type="button" data-op="back">${t('Back')}</button>` : ''}
          <button type="button" data-op="next" ${this.canAdvance ? '' : 'disabled'}>${step === 4 ? (this.saving ? t('Saving') : t('Done')) : t('Next')}</button>
        </div>
      </fieldset>`
    if (position) Object.assign(this.panel.style, position)
  }

  /** One set of listeners on the panel; its content is redrawn on every change. */
  bindPanel() {
    const panel = this.panel
    panel.addEventListener('pointerdown', (event) => event.stopPropagation())
    panel.addEventListener('wheel', (event) => event.stopPropagation())
    panel.addEventListener('click', (event) => {
      const target = event.target as HTMLElement
      const inspect = target.closest<HTMLElement>('[data-inspect]')
      if (inspect) {
        const [x, y] = (inspect.dataset.inspect ?? '').split(',').map(Number)
        return this.inspect(x, y)
      }
      const op = target.closest<HTMLElement>('[data-op]')?.dataset.op
      if (op === 'cancel' && !this.saving) this.close()
      else if (op === 'back') this.back()
      else if (op === 'next') void this.next()
      else if (op === 'resetFine') {
        this.stopHold()
        this.fine = { x: 1, y: 1 }
        this.render()
      }
    })
    panel.addEventListener('input', (event) => {
      const input = event.target as HTMLInputElement
      if (input.dataset.fine) {
        this.fine = { ...this.fine, [input.dataset.fine]: Math.clamp(Number(input.value) / 100, 0.5, 2) }
        this.draw()
        const output = input.closest('label')?.querySelector('output')
        if (output) output.textContent = `${(this.fine[input.dataset.fine as 'x' | 'y'] * 100).toFixed(2)}%`
      } else if (input.dataset.field === 'color') {
        this.color = input.value
        this.draw()
      } else if (input.dataset.field === 'distance' || input.dataset.field === 'units') {
        if (input.dataset.field === 'distance') this.distance = input.value
        else this.units = input.value
        // Keep typing in place: only the summary line and the Next button change.
        const three = panel.querySelector('[data-three]')
        if (three) three.textContent = this.validMeasure ? t('ThreeSquares', { distance: `${Number(this.distance) * 3} ${this.units.trim()}` }) : t('InvalidMeasure')
        const next = panel.querySelector<HTMLButtonElement>('[data-op="next"]')
        if (next) next.disabled = !this.canAdvance
      }
    })
    panel.addEventListener('change', (event) => {
      if ((event.target as HTMLElement).dataset.fine) this.render()
    })
    // − and + repeat while held.
    panel.addEventListener('pointerdown', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-hold]')
      if (!button || event.button !== 0) return
      event.preventDefault()
      button.setPointerCapture(event.pointerId)
      this.startHold(button.dataset.hold as 'x' | 'y', Number(button.dataset.direction))
      const stop = () => {
        this.stopHold()
        button.removeEventListener('pointerup', stop)
        button.removeEventListener('pointercancel', stop)
        button.removeEventListener('lostpointercapture', stop)
      }
      button.addEventListener('pointerup', stop)
      button.addEventListener('pointercancel', stop)
      button.addEventListener('lostpointercapture', stop)
    })
    // Drag the panel by its title.
    panel.addEventListener('pointerdown', (event) => {
      const header = (event.target as HTMLElement).closest('.calibration-title')
      if (!header || event.button !== 0 || (event.target as HTMLElement).closest('button')) return
      event.preventDefault()
      const box = panel.getBoundingClientRect()
      const start = { x: event.clientX, y: event.clientY, left: box.left, top: box.top }
      const move = (step: PointerEvent) => {
        const left = Math.clamp(start.left + step.clientX - start.x, 8, window.innerWidth - panel.offsetWidth - 8)
        const top = Math.clamp(start.top + step.clientY - start.y, 8, window.innerHeight - panel.offsetHeight - 8)
        Object.assign(panel.style, { left: `${left}px`, top: `${top}px`, right: 'auto' })
      }
      const up = () => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
      }
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
  }
}

/** Start calibrating the scene on the canvas (GM only). */
export function calibrateGrid(scene: any = canvas.scene) {
  if (!game.user.isGM || !scene) return
  if (scene !== canvas.scene) return ui.notifications.warn(t('ViewFirst'))
  if (!scene.grid.isSquare && scene.grid.type !== CONST.GRID_TYPES.SQUARE) return ui.notifications.warn(t('SquareOnly'))
  active?.close()
  active = new GridCalibration(scene)
  active.start()
}

/** A "Calibrate grid" button in the token controls, and on the Scene configuration's Grid tab. */
export function registerGridCalibration() {
  Hooks.on('getSceneControlButtons', (controls: any) => {
    const tokens = controls.tokens
    if (!tokens?.tools || !game.user.isGM) return
    tokens.tools.crawlCalibrate = {
      name: 'crawlCalibrate',
      order: Object.keys(tokens.tools).length + 1,
      title: 'CRAWLSPACE.Calibrate.Title',
      icon: 'fa-solid fa-border-all',
      button: true,
      visible: game.user.isGM,
      onChange: () => calibrateGrid(),
    }
  })
  Hooks.on('renderSceneConfig', (app: any, html: HTMLElement) => {
    if (!game.user.isGM || html.querySelector('[data-crawl-calibrate]')) return
    const tab = html.querySelector('[data-tab="grid"]:not(a):not(button)') ?? html.querySelector('.tab[data-tab="grid"]')
    if (!tab) return
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.crawlCalibrate = ''
    button.innerHTML = `<i class="fa-solid fa-border-all"></i> ${esc(t('FromMap'))}`
    button.addEventListener('click', async () => {
      const scene = app.document
      if (scene !== canvas.scene) await scene.view()
      await app.close()
      calibrateGrid(scene)
    })
    tab.prepend(button)
  })
}
