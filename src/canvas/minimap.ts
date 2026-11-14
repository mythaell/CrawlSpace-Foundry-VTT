/**
 * The minimap: the app's round blue radar in the corner, showing the whole viewed scene (its background image) with a
 * dot for each token that has an actor. The image is redrawn in blues, like a blueprint: dark lines deep blue, light
 * floors near white. Players see the tokens they can see on the canvas; the GM sees all of them.
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

/** The blueprint's darkest and lightest blues, as RGB. */
const DARK = [26, 79, 160]
const LIGHT = [240, 245, 252]
/** The bluescale copy is at most this many pixels on its long side; the radar is far smaller. */
const BLUE_SIZE = 512

/** Scene background images in blues, made once each. */
const images = new Map<string, { image: HTMLImageElement; blue: HTMLCanvasElement | HTMLImageElement | null }>()
function imageFor(src: string | null | undefined, loaded: () => void) {
  if (!src) return null
  let entry = images.get(src)
  if (!entry) {
    const image = new Image()
    const made: { image: HTMLImageElement; blue: HTMLCanvasElement | HTMLImageElement | null } = { image, blue: null }
    entry = made
    image.crossOrigin = 'anonymous'
    image.onload = () => {
      made.blue = bluescale(image)
      loaded()
    }
    image.src = src
    images.set(src, entry)
  }
  return entry.blue
}

/** The image shrunk and recolored by brightness between the two blues. If it can't be read, the image as it is. */
function bluescale(image: HTMLImageElement) {
  const shrink = Math.min(1, BLUE_SIZE / Math.max(image.naturalWidth, image.naturalHeight))
  const result = document.createElement('canvas')
  result.width = Math.max(1, Math.round(image.naturalWidth * shrink))
  result.height = Math.max(1, Math.round(image.naturalHeight * shrink))
  const context = result.getContext('2d', { willReadFrequently: true })!
  context.drawImage(image, 0, 0, result.width, result.height)
  try {
    const pixels = context.getImageData(0, 0, result.width, result.height)
    const data = pixels.data
    for (let i = 0; i < data.length; i += 4) {
      const light = (0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2]) / 255
      for (let c = 0; c < 3; c++) data[i + c] = DARK[c] + (LIGHT[c] - DARK[c]) * light
    }
    context.putImageData(pixels, 0, 0)
    return result
  } catch {
    return image
  }
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
