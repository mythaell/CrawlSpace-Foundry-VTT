/**
 * The minimap: the app's round blue radar in the corner, showing the whole viewed scene (its background image) with a
 * dot for each token that has an actor. Players see the tokens they can see on the canvas; the GM sees all of them.
 * A toggle in the token controls hides it for this user. It can be dragged; each user's spot is remembered.
 *
 * The CrawlSpace Atlas module replaces it: with Atlas active, this minimap and its toggle aren't set up at all.
 */
const t = (key: string) => game.i18n.localize(`CRAWLSPACE.Minimap.${key}`)

/** The radar's inside diameter in CSS pixels (the app's 190 px circle less its border). */
const SIZE = 180
const BACKGROUND = '#102d50'
const COLORS = { own: '#44f275', crawler: '#4395ff', hostile: '#ff405e', other: '#ffffff' }

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/** Scene background images, loaded once each. */
const images = new Map<string, HTMLImageElement>()
function imageFor(src: string | null | undefined, loaded: () => void) {
  if (!src) return null
  let image = images.get(src)
  if (!image) {
    image = new Image()
    image.crossOrigin = 'anonymous'
    image.onload = loaded
    image.src = src
    images.set(src, image)
  }
  return image.complete && image.naturalWidth ? image : null
}

class Minimap extends foundry.applications.api.ApplicationV2 {
  static DEFAULT_OPTIONS: any = {
    id: 'crawl-minimap',
    classes: ['crawlspace', 'crawl-minimap'],
    window: { frame: false, positioned: false },
  }

  #canvas: HTMLCanvasElement | null = null
  #frame = 0

  async _renderHTML() {
    const element = document.createElement('canvas')
    element.width = element.height = Math.round(SIZE * (window.devicePixelRatio || 1))
    element.setAttribute('aria-label', t('Title'))
    return element
  }

  _replaceHTML(result: HTMLCanvasElement, content: HTMLElement) {
    content.replaceChildren(result)
    this.#canvas = result
    this.draw()
  }

  _insertElement(element: HTMLElement) {
    const existing = document.getElementById(element.id)
    if (existing) existing.replaceWith(element)
    else document.body.append(element)
    return element
  }

  _onRender(context: any, options: any) {
    super._onRender?.(context, options)
    const element = this.element as HTMLElement
    const saved: any = game.settings.get('crawlspace', 'minimapPosition')
    this.#place(element, Number.isFinite(saved?.left) ? saved.left : window.innerWidth - SIZE - 340, Number.isFinite(saved?.top) ? saved.top : 70)
    this.#bindDrag(element)
  }

  #place(element: HTMLElement, left: number, top: number) {
    const size = element.offsetWidth || SIZE + 10
    element.style.left = `${clamp(left, 0, Math.max(0, window.innerWidth - size))}px`
    element.style.top = `${clamp(top, 0, Math.max(0, window.innerHeight - size))}px`
  }

  /** Drag to move it; the spot is saved for this user. */
  #bindDrag(element: HTMLElement) {
    element.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      const start = { x: event.clientX, y: event.clientY, left: element.offsetLeft, top: element.offsetTop }
      element.setPointerCapture(event.pointerId)
      element.classList.add('dragging')
      const move = (moved: PointerEvent) => this.#place(element, start.left + moved.clientX - start.x, start.top + moved.clientY - start.y)
      const up = () => {
        element.removeEventListener('pointermove', move)
        element.removeEventListener('pointerup', up)
        element.classList.remove('dragging')
        if (element.offsetLeft !== start.left || element.offsetTop !== start.top)
          game.settings.set('crawlspace', 'minimapPosition', { left: element.offsetLeft, top: element.offsetTop }).catch(() => null)
      }
      element.addEventListener('pointermove', move)
      element.addEventListener('pointerup', up)
    })
  }

  /** Redraws on the next frame; many token updates in one frame draw once. */
  draw() {
    if (this.#frame) return
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0
      this.#draw()
    })
  }

  #draw() {
    const element = this.#canvas
    const scene = canvas.scene
    if (!element || !scene || !canvas.ready) return
    const ratio = element.width / SIZE
    const context = element.getContext('2d')!
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    context.fillStyle = BACKGROUND
    context.fillRect(0, 0, SIZE, SIZE)

    // The whole scene, fitted inside the circle.
    const rect = canvas.dimensions.sceneRect
    const scale = (SIZE - 8) / Math.hypot(rect.width, rect.height)
    const left = SIZE / 2 - (rect.width * scale) / 2
    const top = SIZE / 2 - (rect.height * scale) / 2
    context.fillStyle = scene.backgroundColor?.css ?? String(scene.backgroundColor ?? '#000')
    context.fillRect(left, top, rect.width * scale, rect.height * scale)
    const image = imageFor(scene.background?.src, () => this.draw())
    if (image) context.drawImage(image, left, top, rect.width * scale, rect.height * scale)
    context.strokeStyle = 'rgba(182, 239, 255, 0.6)'
    context.lineWidth = 1
    context.strokeRect(left, top, rect.width * scale, rect.height * scale)

    // A dot per token with an actor; yours on top.
    const tokens = (canvas.tokens?.placeables ?? []).filter((token: any) => token.actor && (game.user.isGM || token.isVisible))
    tokens.sort((a: any, b: any) => Number(a.isOwner && !game.user.isGM) - Number(b.isOwner && !game.user.isGM))
    for (const token of tokens) {
      const x = left + (token.center.x - rect.x) * scale
      const y = top + (token.center.y - rect.y) * scale
      const hostile = token.document.disposition === CONST.TOKEN_DISPOSITIONS.HOSTILE
      const own = token.isOwner && !game.user.isGM
      const color = own ? COLORS.own : hostile ? COLORS.hostile : token.actor.type === 'crawler' ? COLORS.crawler : COLORS.other
      context.globalAlpha = token.document.hidden ? 0.45 : 1
      context.beginPath()
      context.arc(x, y, Math.max(2.5, (token.w / 2) * scale), 0, Math.PI * 2)
      context.fillStyle = color
      context.fill()
      context.lineWidth = 1
      context.strokeStyle = '#164667'
      context.stroke()
    }
    context.globalAlpha = 1
  }
}

let minimap: Minimap | null = null

/** Shows the minimap on the viewed scene unless this user turned it off. */
function sync() {
  const wanted = canvas.ready && !!canvas.scene && game.settings.get('crawlspace', 'showMinimap')
  if (!wanted) {
    if (minimap?.rendered) minimap.close({ animate: false })
    return
  }
  minimap ??= new Minimap()
  if (minimap.rendered) minimap.draw()
  else minimap.render({ force: true })
}

/** The CrawlSpace Atlas module brings its own minimap, which does all this and more. */
const atlasActive = () => !!game.modules.get('crawlspace-atlas')?.active

export function registerMinimap() {
  if (atlasActive()) return
  game.settings.register('crawlspace', 'showMinimap', { scope: 'client', config: false, type: Boolean, default: true, onChange: sync })
  game.settings.register('crawlspace', 'minimapPosition', { scope: 'client', config: false, type: Object, default: null })
  Hooks.on('getSceneControlButtons', (controls: any) => {
    const tokens = controls.tokens
    if (!tokens?.tools) return
    tokens.tools.crawlMinimap = {
      name: 'crawlMinimap',
      order: Object.keys(tokens.tools).length + 1,
      title: 'CRAWLSPACE.Minimap.Toggle',
      icon: 'fa-solid fa-compass',
      toggle: true,
      active: game.settings.get('crawlspace', 'showMinimap'),
      onChange: (_event: Event, active: boolean) => game.settings.set('crawlspace', 'showMinimap', active),
    }
  })
  Hooks.on('canvasReady', sync)
  const redraw = () => minimap?.rendered && minimap.draw()
  for (const hook of ['refreshToken', 'createToken', 'deleteToken', 'updateScene', 'sightRefresh']) Hooks.on(hook, redraw)
}
