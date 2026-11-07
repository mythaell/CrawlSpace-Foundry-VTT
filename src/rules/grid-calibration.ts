/**
 * Map grid calibration math (gridAlignment.ts), in canvas pixels. The GM marks a printed grid intersection
 * (the anchor) and points three squares across and down; the map is then scaled so a printed square is one
 * Foundry grid square, and shifted so the anchor sits on a grid intersection. Pure, so tests can import it.
 */

export type Point = { x: number; y: number }
export type Rect = { x: number; y: number; width: number; height: number }

/** The nearest grid intersection of a grid with this cell size, through `origin`. */
export function gridIntersection(point: Point, cellX: number, cellY: number, origin: Point): Point {
  return {
    x: origin.x + Math.round((point.x - origin.x) / cellX) * cellX,
    y: origin.y + Math.round((point.y - origin.y) / cellY) * cellY,
  }
}

/** Keep a measurement on the anchor's row (horizontal) or column (vertical), without snapping. */
export function referencePoint(anchor: Point, point: Point, axis: 'x' | 'y'): Point {
  return axis === 'x' ? { x: point.x, y: anchor.y } : { x: anchor.x, y: point.y }
}

/** A printed square's size from a three-square measurement. */
export const cellFromMeasure = (anchor: Point, point: Point | null) => (point ? Math.hypot(point.x - anchor.x, point.y - anchor.y) / 3 : 0)

const mod = (value: number, size: number) => ((value % size) + size) % size

/**
 * The scene update that makes a printed square (cellX by cellY canvas pixels now) one grid square of
 * `gridSize`, with the anchor on a grid intersection. The map scales with the scene's width and height (as
 * Foundry's own grid tool does), and the scene shift moves it onto the grid. `dimensionsX/Y` give where the
 * scene's rectangle would start for a width or height (the padding, from Foundry's grid).
 */
export function calibrationUpdate(input: {
  width: number
  height: number
  gridSize: number
  sceneRect: Rect
  image: Rect
  anchor: Point
  cellX: number
  cellY: number
  dimensionsX: (width: number) => number
  dimensionsY: (height: number) => number
}) {
  const axis = (size: number, rectStart: number, rectSize: number, imageStart: number, imageSize: number, anchor: number, cell: number, start: (size: number) => number) => {
    const next = Math.max(1, Math.round(size * (input.gridSize / cell)))
    const scale = next / size
    // Where the image sits against the scene rectangle: its center offset, which stays as it is.
    const offset = imageStart + imageSize / 2 - (rectStart + rectSize / 2)
    const nextImage = imageSize * scale
    const base = start(next) + next / 2 + offset - nextImage / 2 + (anchor - imageStart) * scale
    const r = mod(base, input.gridSize)
    return { size: next, shift: Math.round(r <= input.gridSize / 2 ? r : r - input.gridSize) }
  }
  const x = axis(input.width, input.sceneRect.x, input.sceneRect.width, input.image.x, input.image.width, input.anchor.x, input.cellX, input.dimensionsX)
  const y = axis(input.height, input.sceneRect.y, input.sceneRect.height, input.image.y, input.image.height, input.anchor.y, input.cellY, input.dimensionsY)
  return { width: x.size, height: y.size, shiftX: x.shift, shiftY: y.shift }
}
