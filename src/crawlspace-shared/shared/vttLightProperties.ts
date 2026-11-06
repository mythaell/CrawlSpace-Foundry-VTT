export const lightAnimations = ['None', 'Chroma', 'Flickering Light', 'Pulse', 'Torch'] as const
export const lightColorations = [
  'Legacy Coloration',
  'Adaptive Luminance',
  'Internal Halo',
  'External Halo',
  'Color Burn',
  'Internal Color Burn',
  'External Color Burn',
  'Low Absorption',
  'High Absorption',
  'Invert Absorption',
  'Natural Light',
] as const
export type LightProperties = {
  elevation: number
  constrainedByWalls: boolean
  darknessSource: boolean
  colorIntensity: number
  animation: { type: (typeof lightAnimations)[number]; speed: number; intensity: number; reverse: boolean }
  advanced: {
    providesVision: boolean
    coloration: (typeof lightColorations)[number]
    luminosity: number
    attenuation: number
    saturation: number
    contrast: number
    shadows: number
  }
}
const bounded = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
// Interpolated random samples keep a flame irregular without frame-to-frame jitter.
const flameNoise = (position: number, seed: number) => {
  const index = Math.floor(position),
    fraction = position - index
  const random = (n: number) => {
    const value = Math.sin(n * 127.1 + seed * 311.7) * 43758.5453
    return value - Math.floor(value)
  }
  const blend = fraction * fraction * (3 - 2 * fraction)
  return random(index) * (1 - blend) + random(index + 1) * blend
}
export function normalizeLightProperties(value: unknown): LightProperties {
  const source = value && typeof value === 'object' ? (value as Partial<LightProperties>) : {}
  const animation = source.animation ?? ({} as Partial<LightProperties['animation']>)
  const advanced = source.advanced ?? ({} as Partial<LightProperties['advanced']>)
  return {
    elevation: bounded(source.elevation, 0, -100000, 100000),
    constrainedByWalls: source.constrainedByWalls !== false,
    darknessSource: source.darknessSource === true,
    colorIntensity: bounded(source.colorIntensity, 0.5, 0, 1),
    animation: {
      type: lightAnimations.includes(animation.type as never) ? animation.type! : 'None',
      speed: bounded(animation.speed, 5, 1, 10),
      intensity: bounded(animation.intensity, 5, 1, 10),
      reverse: animation.reverse === true,
    },
    advanced: {
      providesVision: advanced.providesVision === true,
      coloration: lightColorations.includes(advanced.coloration as never) ? advanced.coloration! : 'Adaptive Luminance',
      luminosity: bounded(advanced.luminosity, 0.5, -1, 1),
      attenuation: bounded(advanced.attenuation, 0.5, 0, 1),
      saturation: bounded(advanced.saturation, 0, -1, 1),
      contrast: bounded(advanced.contrast, 0, -1, 1),
      shadows: bounded(advanced.shadows, 0, 0, 1),
    },
  }
}
export function lightAnimationFrame(properties: LightProperties, time: number, seed = 0) {
  const { type, speed, intensity, reverse } = properties.animation
  const phase = (time / 1000) * speed * 0.45 * (reverse ? -1 : 1) + seed
  const depth = intensity / 10
  if (type === 'Torch') {
    // Default speed matches the reference's ~0.3s changes and slower flame swells.
    const seconds = (((time / 1000) * speed) / 5) * (reverse ? -1 : 1)
    const noise =
      flameNoise(seconds / 0.36, seed) * 0.68 +
      flameNoise(seconds / 1.4, seed + 17) * 0.24 +
      flameNoise(seconds / 0.095, seed + 53) * 0.08
    const flame = Math.max(0, Math.min(1, (noise - 0.15) / 0.7))
    return {
      phase,
      depth,
      hue: 28 + flame * 12 * depth,
      opacity: 1 - depth * 0.9 * (1 - flame),
      scale: 1 - depth * 0.55 * (1 - flame),
      rotation: phase * 45,
      wave: flame,
    }
  }
  const wave = (Math.sin(phase) + 1) / 2
  const flicker = (Math.sin(phase * 13) + Math.sin(phase * 23 + 0.7) + Math.sin(phase * 37 + 2) + 3) / 6
  const animated = type !== 'None'
  const flickering = type === 'Flickering Light'
  const hue = type === 'Chroma' ? (((phase * 55) % 360) + 360) % 360 : null
  return {
    phase,
    depth,
    hue,
    opacity: animated ? 1 - depth * (flickering ? 0.7 * (1 - flicker) : 0.4 * (1 - wave)) : 1,
    scale: type === 'Pulse' ? 1 - depth * 0.25 * (1 - wave) : 1,
    rotation: phase * 45,
    wave,
  }
}
