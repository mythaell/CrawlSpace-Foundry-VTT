/**
 * Token sizes from creature sizes (vttTokenPrototype.ts creatureTokenSize): size 1–8, or its name, sets how
 * many grid squares the token covers. A prototype that still has an automatic size follows the creature's
 * size; one the GM resized by hand keeps its own.
 */

const NAMES = ['tiny', 'small', 'petite', 'medium', 'large', 'huge', 'colossal', 'gargantuan']
const SQUARES = [0.5, 0.7, 0.9, 1, 2, 3, 4, 5]

type Dimensions = { width?: number; height?: number }

/** Grid squares per side for a creature size, or null when the size isn't one of the eight. */
export function tokenSquares(size: unknown): number | null {
  const text = String(size ?? '').trim().toLowerCase()
  if (!text) return null
  // Past size 8, tokens stay 5×5.
  const index = NAMES.includes(text) ? NAMES.indexOf(text) : Math.min(Math.floor(Number(text)), SQUARES.length) - 1
  return SQUARES[index] ?? null
}

/** Where an actor type keeps its size: crawlers in their details, NPCs nowhere. */
export function actorSize(type: string, system: any): string {
  if (type === 'npc') return ''
  return String((type === 'crawler' ? system?.details?.size : system?.size) ?? '')
}

/** The size the first compendium build gave mobs: one square up to size 5, then two. */
const firstBuildSquares = (size: unknown) => Math.max(1, Math.round((Math.trunc(Number(size)) || 1) / 4)) || 1

/** The prototype's new width and height when its size is still automatic, or null to leave it. */
export function sizedPrototype(size: unknown, token: Dimensions = {}): { width: number; height: number } | null {
  const squares = tokenSquares(size)
  const { width = 1, height = 1 } = token
  if (squares === null || width !== height || width === squares) return null
  if (width !== 1 && width !== firstBuildSquares(size)) return null
  return { width: squares, height: squares }
}

/** After the size changes from `before` to `after`: the new width and height, if the token followed `before`. */
export function resizedPrototype(before: unknown, after: unknown, token: Dimensions = {}): { width: number; height: number } | null {
  const squares = tokenSquares(after)
  const { width = 1, height = 1 } = token
  if (squares === null || width !== height || width === squares) return null
  const followed = width === (tokenSquares(before) ?? 1) || width === 1 || width === firstBuildSquares(before)
  return followed ? { width: squares, height: squares } : null
}
