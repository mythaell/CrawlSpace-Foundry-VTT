// Ported unchanged from the CrawlSpace app's token maker (src/tokenCreator/tokenRender.ts).
/**
 * Canvas drawing for round tokens. The ring is 512 design pixels across and fills the canvas; with pop-out on, the
 * canvas grows by a transparent margin on every side for the art to extend into. Export scales the design.
 */
export const tokenDesignSize = 512
/** Transparent space around the ring when pop-out artwork extends past it. */
export const tokenPopOutMargin = 100
/** The canvas edge length in design pixels. */
export const tokenCanvasSize = (popOut: boolean) => tokenDesignSize + (popOut ? 2 * tokenPopOutMargin : 0)
/** How much a scene enlarges a pop-out token so its ring fills the grid square; the margin spills past it. */
export const tokenFrameScale = tokenCanvasSize(true) / tokenDesignSize

export type TokenBorder = 'standard' | 'thin' | 'thick' | 'double'
export type Rgb = [number, number, number]
export type TokenImage = HTMLImageElement | HTMLCanvasElement | ImageBitmap

/** Where the artwork sits: `scale` maps image pixels to design pixels; offsets move its center from the token's. */
export type TokenPlacement = { scale: number; offsetX: number; offsetY: number }

export type TokenLook = {
  ringColor: string
  fill: string
  border: TokenBorder
  zoom: number
  /** The selected part of the artwork is drawn over the ring, out into the transparent margin. */
  popOut: boolean
  pixelArt: boolean
}

const ringRadius = tokenDesignSize / 2
const innerRadius: Record<TokenBorder, number> = {
  standard: ringRadius - 16,
  thin: ringRadius - 8,
  thick: ringRadius - 27,
  double: ringRadius - 21,
}
/** How far the creature reaches from the center when fitted: inside the ring, or out into the margin for pop-out. */
export const fitReach = { ring: innerRadius.standard - 4, popOut: ringRadius + tokenPopOutMargin - 16 }

const size = (image: TokenImage) => ({ width: image.width, height: image.height })

const cornerColor = (data: Uint8ClampedArray, width: number, height: number) => {
  const corners = [0, width - 1, width * (height - 1), width * height - 1]
  return [0, 1, 2].map((channel) =>
    Math.round(corners.reduce((sum, index) => sum + data[index * 4 + channel], 0) / 4),
  ) as Rgb
}

/** The portrait's background color: the average of its corners. */
export function backdropColor(image: TokenImage) {
  const probe = document.createElement('canvas')
  probe.width = probe.height = 32
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, 32, 32)
  return cornerColor(ctx.getImageData(0, 0, 32, 32).data, 32, 32)
}

/**
 * Centers and scales the creature so it reaches `reach` design pixels from the center. The backdrop is the average
 * corner color. With a cut-out (see `cutoutFromBackdrop`), its opaque pixels are the creature; without one, anything
 * clearly different from the backdrop is.
 */
export function fitArtwork(
  image: TokenImage,
  reach = fitReach.ring,
  cutout?: TokenImage | null,
): TokenPlacement & { backdrop: Rgb } {
  const { width, height } = size(image)
  const probe = document.createElement('canvas')
  const side = 160
  probe.width = probe.height = side
  const ctx = probe.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0, side, side)
  const data = ctx.getImageData(0, 0, side, side).data
  const backdrop = cornerColor(data, side, side)
  let shape: Uint8ClampedArray | null = null
  if (cutout) {
    ctx.clearRect(0, 0, side, side)
    ctx.drawImage(cutout, 0, 0, side, side)
    shape = ctx.getImageData(0, 0, side, side).data
  }
  const points: [number, number][] = []
  for (let y = 0; y < side; y++)
    for (let x = 0; x < side; x++) {
      const i = (y * side + x) * 4
      if (
        shape
          ? shape[i + 3] > 24
          : data[i + 3] > 100 &&
            Math.hypot(data[i] - backdrop[0], data[i + 1] - backdrop[1], data[i + 2] - backdrop[2]) > 85
      )
        points.push([((x + 0.5) * width) / side, ((y + 0.5) * height) / side])
    }
  if (points.length < 20) points.push([0, 0], [width, height])
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1])
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2,
    cy = (Math.min(...ys) + Math.max(...ys)) / 2
  // Reach to the far edge of a probe cell, not its middle.
  const cell = Math.hypot(width, height) / side / 2
  const extent = Math.max(...points.map((p) => Math.hypot(p[0] - cx, p[1] - cy))) + cell
  const scale = reach / Math.max(1, extent)
  return { scale, offsetX: (width / 2 - cx) * scale, offsetY: (height / 2 - cy) * scale, backdrop }
}

/**
 * The creature alone, for portraits on a flat background: background-colored pixels joined to the image's edge become
 * transparent, so background-colored parts inside the creature stay. Edge pixels fade with their distance from the
 * backdrop color and have that color removed so they don't keep a halo. Returns null when the background isn't flat.
 */
export function cutoutFromBackdrop(image: TokenImage, backdrop: Rgb) {
  const { width, height } = size(image)
  const layer = document.createElement('canvas')
  layer.width = width
  layer.height = height
  const ctx = layer.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(image, 0, 0)
  const pixels = ctx.getImageData(0, 0, width, height),
    data = pixels.data
  const count = width * height
  const distance = new Float32Array(count)
  for (let p = 0; p < count; p++)
    distance[p] = Math.hypot(data[p * 4] - backdrop[0], data[p * 4 + 1] - backdrop[1], data[p * 4 + 2] - backdrop[2])
  // Closer than `solid` is background; past `edge` is creature; between, partly both.
  const solid = 18,
    edge = 60
  if ([0, width - 1, count - width, count - 1].some((p) => distance[p] > 40)) return null
  const background = new Uint8Array(count)
  const queue = new Int32Array(count)
  let head = 0,
    tail = 0
  const visit = (p: number) => {
    if (!background[p] && distance[p] < edge) {
      background[p] = 1
      queue[tail++] = p
    }
  }
  for (let x = 0; x < width; x++) {
    visit(x)
    visit(count - width + x)
  }
  for (let y = 0; y < height; y++) {
    visit(y * width)
    visit(y * width + width - 1)
  }
  while (head < tail) {
    const p = queue[head++],
      x = p % width
    if (x > 0) visit(p - 1)
    if (x < width - 1) visit(p + 1)
    if (p >= width) visit(p - width)
    if (p < count - width) visit(p + width)
  }
  // A busy background barely floods: there's no outline to find.
  if (tail < count * 0.05) return null
  for (let p = 0; p < count; p++) {
    if (!background[p]) continue
    const opacity = Math.max(0, Math.min(1, (distance[p] - solid) / (edge - solid))),
      i = p * 4
    if (opacity > 0) for (let c = 0; c < 3; c++) data[i + c] = (data[i + c] - (1 - opacity) * backdrop[c]) / opacity
    data[i + 3] = Math.round(opacity * data[i + 3])
  }
  ctx.putImageData(pixels, 0, 0)
  return layer
}

/** A blank selection layer the size of the image, for the pop-out brush. */
export function blankSelection(image: TokenImage) {
  const layer = document.createElement('canvas')
  ;({ width: layer.width, height: layer.height } = size(image))
  layer.getContext('2d', { willReadFrequently: true })
  return layer
}

/** Image-pixel position under a point in design space. */
export function designToImage(
  image: TokenImage,
  placement: TokenPlacement,
  zoom: number,
  point: { x: number; y: number },
  center: number,
) {
  const scale = placement.scale * zoom
  return {
    x: (point.x - center - placement.offsetX * zoom) / scale + image.width / 2,
    y: (point.y - center - placement.offsetY * zoom) / scale + image.height / 2,
  }
}

/**
 * One brush stroke on the selection. Reveal paints only where the creature is (from `cutout`); erase removes.
 * `from`/`to` are in design space; `diameter` is in design pixels.
 */
export function brushSelection(
  selection: HTMLCanvasElement,
  cutout: TokenImage,
  image: TokenImage,
  placement: TokenPlacement,
  zoom: number,
  stroke: {
    from: { x: number; y: number }
    to: { x: number; y: number }
    diameter: number
    erase: boolean
    /** The canvas center in design space. */
    center: number
  },
) {
  const a = designToImage(image, placement, zoom, stroke.from, stroke.center),
    b = designToImage(image, placement, zoom, stroke.to, stroke.center)
  const ctx = selection.getContext('2d')!,
    diameter = stroke.diameter / (placement.scale * zoom)
  ctx.save()
  ctx.globalCompositeOperation = stroke.erase ? 'destination-out' : 'source-over'
  ctx.strokeStyle = ctx.fillStyle = '#fff'
  ctx.lineWidth = diameter
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(a.x, a.y)
  ctx.lineTo(b.x, b.y)
  ctx.stroke()
  ctx.beginPath()
  ctx.arc(b.x, b.y, diameter / 2, 0, Math.PI * 2)
  ctx.fill()
  if (!stroke.erase) {
    ctx.globalCompositeOperation = 'source-in'
    ctx.drawImage(cutout, 0, 0)
  }
  ctx.restore()
}

/**
 * Draws the token in design space onto `ctx` (set a transform first to export at another size). With pop-out on,
 * `selection` is drawn over the ring, and `guide` (the full cut-out) shows faintly underneath while brushing.
 */
export function drawToken(
  ctx: CanvasRenderingContext2D,
  image: TokenImage,
  placement: TokenPlacement,
  look: TokenLook,
  layers: { selection?: TokenImage | null; guide?: TokenImage | null } = {},
) {
  const { zoom } = look,
    side = tokenCanvasSize(look.popOut),
    center = side / 2,
    w = image.width * placement.scale * zoom,
    h = image.height * placement.scale * zoom
  const x = center + placement.offsetX * zoom - w / 2,
    y = center + placement.offsetY * zoom - h / 2
  ctx.clearRect(0, 0, side, side)
  ctx.save()
  ctx.beginPath()
  ctx.arc(center, center, ringRadius, 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = look.ringColor
  ctx.fillRect(0, 0, side, side)
  if (look.border === 'double') {
    ctx.strokeStyle = '#332d33'
    ctx.lineWidth = 3
    ctx.beginPath()
    ctx.arc(center, center, ringRadius - 10, 0, Math.PI * 2)
    ctx.stroke()
  }
  ctx.beginPath()
  ctx.arc(center, center, innerRadius[look.border], 0, Math.PI * 2)
  ctx.clip()
  ctx.fillStyle = look.fill
  ctx.fillRect(0, 0, side, side)
  ctx.imageSmoothingEnabled = !look.pixelArt
  ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(image, x, y, w, h)
  ctx.restore()
  if (look.popOut && layers.selection) {
    ctx.save()
    ctx.imageSmoothingEnabled = !look.pixelArt
    ctx.drawImage(layers.selection, x, y, w, h)
    if (layers.guide) {
      ctx.globalCompositeOperation = 'destination-over'
      ctx.globalAlpha = 0.22
      ctx.drawImage(layers.guide, x, y, w, h)
    }
    ctx.restore()
  }
}

/** The finished token with a ring `pixels` across; a pop-out token's canvas is larger by its margin. */
export function renderToken(
  image: TokenImage,
  placement: TokenPlacement,
  look: TokenLook,
  selection: TokenImage | null,
  pixels: number,
) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = Math.round((pixels * tokenCanvasSize(look.popOut)) / tokenDesignSize)
  const ctx = canvas.getContext('2d')!
  ctx.setTransform(pixels / tokenDesignSize, 0, 0, pixels / tokenDesignSize, 0, 0)
  drawToken(ctx, image, placement, look, { selection })
  return canvas
}

/** The token as a PNG data URL (see `renderToken`). */
export const exportToken = (...args: Parameters<typeof renderToken>) => renderToken(...args).toDataURL('image/png')

/** The token as a PNG file (see `renderToken`). */
export const exportTokenBlob = (...args: Parameters<typeof renderToken>) =>
  new Promise<Blob>((resolve, reject) =>
    renderToken(...args).toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not draw the token.'))),
      'image/png',
    ),
  )

export const rgbHex = (rgb: Rgb) => '#' + rgb.map((n) => n.toString(16).padStart(2, '0')).join('')

/** Loads an image the token maker can read pixels from: storage redirects need CORS, so ask for it. */
export async function loadTokenImage(src: string) {
  const image = new Image()
  image.crossOrigin = 'anonymous'
  image.src = src
  await image.decode()
  return image
}
