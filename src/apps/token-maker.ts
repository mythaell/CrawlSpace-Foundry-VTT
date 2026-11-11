/**
 * The token maker from the CrawlSpace app (tokenCreatorDialog.ts) as a Foundry window: a round ring around an
 * actor's portrait (or any image), with pop-out artwork that reaches past the ring. Use Token uploads the PNG into the
 * world and makes it the actor's token; Download PNG saves it instead.
 */
import { ActorPopup } from './actions-config'
import { ensureDirectory } from './account-import'
import {
  backdropColor,
  blankSelection,
  brushSelection,
  cutoutFromBackdrop,
  drawToken,
  exportToken,
  exportTokenBlob,
  fitArtwork,
  fitReach,
  rgbHex,
  tokenCanvasSize,
  tokenDesignSize,
  tokenFrameScale,
  type TokenBorder,
  type TokenImage,
  type TokenLook,
  type TokenPlacement,
} from '../tokens/token-render'

const t = (key: string, data?: Record<string, unknown>) => game.i18n.format(`CRAWLSPACE.TokenMaker.${key}`, data ?? {})
const slug = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'token'
type Point = { x: number; y: number }

/** Loads an image whose pixels can be read (same-origin, or a site that allows it). Waits on load, not decode(). */
function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error(`Could not load ${src}`))
    image.src = src
  })
}

export class TokenMakerApp extends ActorPopup {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'token-maker'],
    position: { width: 440, height: 'auto' },
    window: { icon: 'fa-solid fa-circle-user' },
    actions: {
      chooseImage: TokenMakerApp.#onChooseImage,
      fit: TokenMakerApp.#onFit,
      autoSelect: TokenMakerApp.#onAutoSelect,
      clearSelection: TokenMakerApp.#onClearSelection,
      download: TokenMakerApp.#onDownload,
      useToken: TokenMakerApp.#onUseToken,
    },
  }

  static PARTS = { main: { template: 'systems/crawlspace/templates/apps/token-maker.hbs' } }

  /** Opens the token maker for an actor (a token's actor edits that token). */
  static open(actor: any) {
    const id = `crawl-token-maker-${actor.uuid.replace(/\./g, '-')}`
    const existing = foundry.applications.instances.get(id)
    if (existing) return existing.render({ force: true })
    return new TokenMakerApp(actor, { id }).render({ force: true })
  }

  /** The image being turned into a token: the portrait unless another was chosen. */
  source = ''
  image: HTMLImageElement | null = null
  error = ''
  // The creature without its flat background; null hides pop-out effects.
  cutout: TokenImage | null = null
  placement: TokenPlacement = { scale: 1, offsetX: 0, offsetY: 0 }
  // Fitted placements: inside the ring, and larger so pop-out artwork reaches into the margin.
  homes: { ring: TokenPlacement; popOut: TokenPlacement } = { ring: this.placement, popOut: this.placement }
  selection: HTMLCanvasElement | null = null
  look: TokenLook = { ringColor: '#00e650', fill: '#514238', border: 'standard', zoom: 1, popOut: false, pixelArt: false }
  tool: 'move' | 'add' | 'erase' = 'move'
  brush = 18
  output = 512
  busy = false

  get title() {
    return `${t('Title')}: ${this.actor.name}`
  }

  /** Uploading needs Foundry's file upload permission; everyone can download. */
  get canUpload() {
    return this.editable && game.user.can('FILES_UPLOAD')
  }

  async _prepareContext() {
    if (!this.source) this.source = this.actor.img ?? ''
    if (this.source && this.image?.dataset.source !== this.source) await this.#load(this.source)
    return {
      ready: !!this.image,
      error: this.error,
      size: tokenDesignSize,
      look: this.look,
      tool: this.tool,
      brush: this.brush,
      output: this.output,
      canPop: !!this.cutout,
      canUpload: this.canUpload,
      editable: this.editable,
      borders: Object.fromEntries((['standard', 'thin', 'thick', 'double'] as TokenBorder[]).map((key) => [key, t(`Border.${key}`)])),
      tools: { move: t('Tool.move'), add: t('Tool.add'), erase: t('Tool.erase') },
      outputs: { 256: '256 px', 512: '512 px', 1024: '1024 px' },
    }
  }

  /** Read the image and fit the creature, the way the app's dialog does when it opens. */
  async #load(src: string) {
    this.error = ''
    this.image = null
    try {
      const image = await loadImage(src)
      // Reading pixels fails for images from other sites that don't allow it.
      backdropColor(image)
      image.dataset.source = src
      this.image = image
    } catch {
      this.error = t('CantRead')
      return
    }
    const image = this.image
    this.cutout = cutoutFromBackdrop(image, backdropColor(image))
    const ring = fitArtwork(image, fitReach.ring, this.cutout)
    const popOut = fitArtwork(image, fitReach.popOut, this.cutout)
    this.homes = {
      ring: { scale: ring.scale, offsetX: ring.offsetX, offsetY: ring.offsetY },
      popOut: { scale: popOut.scale, offsetX: popOut.offsetX, offsetY: popOut.offsetY },
    }
    this.look = { ...this.look, fill: rgbHex(ring.backdrop), zoom: 1, popOut: false, pixelArt: /\.(gif)$/i.test(src) }
    this.placement = { ...this.homes.ring }
    this.selection = null
    this.tool = 'move'
  }

  get #canvas() {
    return (this.element as HTMLElement).querySelector<HTMLCanvasElement>('canvas.token-maker-preview')
  }
  get #home() {
    return this.look.popOut ? this.homes.popOut : this.homes.ring
  }
  get #brushing() {
    return this.look.popOut && this.tool !== 'move'
  }

  #redraw() {
    const canvas = this.#canvas
    if (!canvas || !this.image) return
    // Pop-out adds a margin around the ring, so the canvas grows; resizing also clears it.
    const side = tokenCanvasSize(this.look.popOut)
    if (canvas.width !== side) canvas.width = canvas.height = side
    canvas.classList.toggle('brushing', this.#brushing)
    drawToken(canvas.getContext('2d')!, this.image, this.placement, this.look, {
      selection: this.selection,
      guide: this.#brushing ? this.cutout : null,
    })
  }

  #fit() {
    this.placement = { ...this.#home }
    this.look.zoom = 1
    const zoom = (this.element as HTMLElement).querySelector<HTMLInputElement>('[data-field=zoom]')
    if (zoom) zoom.value = '1'
    this.#redraw()
  }

  #fitted() {
    return this.look.zoom === 1 && (['scale', 'offsetX', 'offsetY'] as const).every((key) => this.placement[key] === this.#home[key])
  }

  #autoSelect() {
    if (!this.image || !this.cutout) return
    this.selection = blankSelection(this.image)
    this.selection.getContext('2d')!.drawImage(this.cutout, 0, 0)
    this.#redraw()
  }

  /** A pointer position in design space. */
  #designPoint(event: { clientX: number; clientY: number }): Point {
    const canvas = this.#canvas!
    const rect = canvas.getBoundingClientRect()
    return { x: ((event.clientX - rect.left) * canvas.width) / rect.width, y: ((event.clientY - rect.top) * canvas.height) / rect.height }
  }

  #stroke(from: Point, to: Point) {
    if (!this.image || !this.cutout || !this.selection) return
    brushSelection(this.selection, this.cutout, this.image, this.placement, this.look.zoom, {
      from,
      to,
      diameter: this.brush,
      erase: this.tool === 'erase',
      center: this.#canvas!.width / 2,
    })
    this.#redraw()
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    const root = this.element as HTMLElement
    const canvas = this.#canvas
    const field = <T extends HTMLElement>(name: string) => root.querySelector<T>(`[data-field="${name}"]`)
    const zoom = field<HTMLInputElement>('zoom')
    const popTools = root.querySelector<HTMLElement>('[data-pop-tools]')

    field<HTMLInputElement>('ring')?.addEventListener('input', (event) => {
      this.look.ringColor = (event.target as HTMLInputElement).value
      this.#redraw()
    })
    field<HTMLInputElement>('fill')?.addEventListener('input', (event) => {
      this.look.fill = (event.target as HTMLInputElement).value
      this.#redraw()
    })
    field<HTMLSelectElement>('border')?.addEventListener('change', (event) => {
      this.look.border = (event.target as HTMLSelectElement).value as TokenBorder
      this.#redraw()
    })
    zoom?.addEventListener('input', () => {
      this.look.zoom = Number(zoom.value)
      this.#redraw()
    })
    field<HTMLSelectElement>('output')?.addEventListener('change', (event) => (this.output = Number((event.target as HTMLSelectElement).value)))
    field<HTMLInputElement>('brush')?.addEventListener('input', (event) => (this.brush = Number((event.target as HTMLInputElement).value)))
    field<HTMLSelectElement>('tool')?.addEventListener('change', (event) => {
      this.tool = (event.target as HTMLSelectElement).value as any
      this.#redraw()
    })
    field<HTMLInputElement>('pop')?.addEventListener('change', (event) => {
      // Untouched artwork follows the fit for the new mode, so turning pop-out on shows the effect at once.
      const untouched = this.#fitted()
      this.look.popOut = (event.target as HTMLInputElement).checked
      if (popTools) popTools.hidden = !this.look.popOut
      if (this.look.popOut && !this.selection) this.#autoSelect()
      if (untouched) this.#fit()
      else this.#redraw()
      this.setPosition({ height: 'auto' })
    })
    if (!canvas) return

    let dragPoint: Point | null = null
    canvas.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        const old = this.look.zoom
        this.look.zoom = Math.max(0.5, Math.min(4, old * Math.exp(-Math.sign(event.deltaY) * 0.1)))
        if (zoom) zoom.value = String(this.look.zoom)
        // Zoom about the pointer.
        const factor = 1 / this.look.zoom - 1 / old
        const point = this.#designPoint(event)
        this.placement.offsetX += (point.x - canvas.width / 2) * factor
        this.placement.offsetY += (point.y - canvas.height / 2) * factor
        this.#redraw()
      },
      { passive: false },
    )
    canvas.addEventListener('pointerdown', (event) => {
      canvas.focus()
      canvas.setPointerCapture(event.pointerId)
      dragPoint = this.#designPoint(event)
      if (this.#brushing) this.#stroke(dragPoint, dragPoint)
    })
    canvas.addEventListener('pointermove', (event) => {
      if (!dragPoint) return
      const point = this.#designPoint(event)
      if (this.#brushing) this.#stroke(dragPoint, point)
      else {
        this.placement.offsetX += (point.x - dragPoint.x) / this.look.zoom
        this.placement.offsetY += (point.y - dragPoint.y) / this.look.zoom
        this.#redraw()
      }
      dragPoint = point
    })
    canvas.addEventListener('lostpointercapture', () => (dragPoint = null))
    canvas.addEventListener('keydown', (event) => {
      const direction = ({ ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] } as Record<string, number[]>)[event.key]
      if (!direction) return
      event.preventDefault()
      // Keep the scene behind the window from moving tokens too.
      event.stopPropagation()
      const step = (event.shiftKey ? 16 : 3) / this.look.zoom
      this.placement.offsetX += direction[0] * step
      this.placement.offsetY += direction[1] * step
      this.#redraw()
    })
    this.#redraw()
  }

  static async #onChooseImage(this: TokenMakerApp) {
    const FilePicker = foundry.applications.apps.FilePicker.implementation
    new FilePicker({
      type: 'image',
      current: this.source,
      callback: (path: string) => {
        this.source = path
        this.render()
      },
    }).render({ force: true })
  }

  static #onFit(this: TokenMakerApp) {
    this.#fit()
  }

  static #onAutoSelect(this: TokenMakerApp) {
    this.#autoSelect()
  }

  static #onClearSelection(this: TokenMakerApp) {
    if (!this.image) return
    this.selection = blankSelection(this.image)
    this.tool = 'add'
    const tool = (this.element as HTMLElement).querySelector<HTMLSelectElement>('[data-field=tool]')
    if (tool) tool.value = 'add'
    this.#redraw()
  }

  #fileName() {
    return `${slug(this.actor.name)}-token`
  }

  static #onDownload(this: TokenMakerApp) {
    if (!this.image) return
    const link = document.createElement('a')
    link.download = `${this.#fileName()}.png`
    link.href = exportToken(this.image, this.placement, this.look, this.selection, this.output)
    link.click()
  }

  /** Upload the PNG into the world and make it this actor's token (a token's own actor: that token). */
  static async #onUseToken(this: TokenMakerApp, _event: Event, button: HTMLButtonElement) {
    if (!this.image || this.busy || !this.canUpload) return
    this.busy = true
    button.disabled = true
    try {
      const blob = await exportTokenBlob(this.image, this.placement, this.look, this.selection, this.output)
      const directory = `worlds/${game.world.id}/crawlspace-tokens`
      await ensureDirectory(directory)
      // A new name each time, so browsers and Foundry don't show a cached older token.
      const file = new File([blob], `${this.#fileName()}-${Date.now().toString(36)}.png`, { type: 'image/png' })
      const FilePicker = foundry.applications.apps.FilePicker.implementation
      const result: any = await FilePicker.upload('data', directory, file, {}, { notify: false })
      if (!result?.path) throw new Error(t('UploadFailed'))
      // Pop-out art spills past the ring, so the token is drawn larger than its grid square.
      const scale = this.look.popOut ? tokenFrameScale : 1
      const texture = { 'texture.src': result.path, 'texture.scaleX': scale, 'texture.scaleY': scale, 'texture.fit': 'contain', 'ring.enabled': false }
      const actor = this.actor
      if (actor.isToken) await actor.token.update(texture)
      else {
        await actor.update(Object.fromEntries(Object.entries(texture).map(([key, value]) => [`prototypeToken.${key}`, value])))
        // Placed tokens of a linked actor follow it; unlinked tokens keep their own look.
        if (actor.prototypeToken.actorLink)
          for (const scene of game.scenes) {
            const updates = scene.tokens.filter((token: any) => token.actorId === actor.id && token.actorLink).map((token: any) => ({ _id: token.id, ...texture }))
            // Owners of the actor may update its tokens; a scene they can't edit is skipped.
            if (updates.length) await scene.updateEmbeddedDocuments('Token', updates).catch(() => null)
          }
      }
      ui.notifications.info(t('Saved', { name: actor.name }))
      await this.close()
    } catch (error: any) {
      ui.notifications.error(error?.message || t('UploadFailed'))
    } finally {
      this.busy = false
      button.disabled = false
    }
  }
}
