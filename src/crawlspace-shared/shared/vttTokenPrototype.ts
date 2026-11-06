import { normalizeLightProperties, type LightProperties } from './vttLightProperties'
export const defaultActorTokenImage = '/icons/default-token.png'
export const tokenDisplayModes = [
  'Never Displayed',
  'When Controlled',
  'Hovered by Owner',
  'Hovered by Anyone',
  'Always for Owner',
  'Always for Everyone',
] as const
export const tokenDispositions = [
  'Other Crawlers',
  'Hostile NPCs',
  'Non-Hostile NPCs',
  'Non-crawlers or non-residents',
  'Pets and Familiars',
  'Minion (or Mercenary)',
  'Corpse',
  'Elites',
  'Important NPCs',
  'God',
] as const
export type TokenDisposition = (typeof tokenDispositions)[number]
export const tokenDispositionColors: Record<TokenDisposition | 'Self', string> = {
  Self: '#00c853',
  'Other Crawlers': '#2196ff',
  'Hostile NPCs': '#ff3030',
  'Non-Hostile NPCs': '#ffffff',
  'Non-crawlers or non-residents': '#ad54ff',
  'Pets and Familiars': '#ff9800',
  'Minion (or Mercenary)': '#ffffff',
  Corpse: '#000000',
  Elites: '#ffffff',
  'Important NPCs': '#ffffff',
  God: '#ffffff',
}
export function tokenDispositionAppearance(disposition: TokenDisposition, owned: boolean, secret = false, gm = false) {
  const visible =
    secret && !gm
      ? 'Non-Hostile NPCs'
      : disposition === 'Other Crawlers'
        ? owned && !gm
          ? 'Self'
          : 'Other Crawlers'
        : disposition
  return {
    color: tokenDispositionColors[visible],
    symbol:
      visible === 'Corpse' || visible === 'Minion (or Mercenary)'
        ? '×'
        : visible === 'Elites'
          ? '+'
          : visible === 'Important NPCs' || visible === 'God'
            ? '★'
            : '●',
    disposition: visible,
  }
}
export type TokenPrototype = {
  faction: string
  name: string
  displayName: (typeof tokenDisplayModes)[number]
  elevation: number
  sort: number
  lockRotation: boolean
  /** This token's own pace as a multiple of normal; null follows the scene's speed. */
  movementSpeed: number | null
  secretDisposition: boolean
  disposition: (typeof tokenDispositions)[number]
  hidden: boolean
  mirrorX: boolean
  mirrorY: boolean
  tint: string
  opacity: number
  fit: 'fill' | 'contain' | 'cover' | 'width' | 'height'
  anchorX: number
  anchorY: number
  scale: number
  /** A token-maker image with a pop-out margin: its ring fills the grid square and the art spills past it. */
  framed: boolean
  ring: {
    enabled: boolean
    color: string
    background: string
    subject: string | null
    subjectScale: number
    pulse: boolean
    gradient: boolean
    wave: boolean
    spectral: boolean
  }
  visionAngle: number
  visionMode: 'Basic Vision' | 'Darkvision' | 'Monochromatic' | 'Tremorsense' | 'Light Amplification'
  displayBars: (typeof tokenDisplayModes)[number]
  bar1: 'none' | 'health' | 'mana'
  bar2: 'none' | 'health' | 'mana'
  lightAngle: number
  lightProperties: LightProperties
  image: string | null
  width: number
  height: number
  rotation: number
  visionEnabled: boolean
  visionRangeFeet: number
  light: { enabled: boolean; brightFeet: number; dimFeet: number; color: string; opacity: number }
}

const number = (value: unknown, fallback: number, min: number, max: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(min, Math.min(max, value)) : fallback
export const tokenImage = (value: unknown): string | null =>
  typeof value === 'string' && /^(data:image\/(png|jpeg|webp|gif|avif|svg\+xml)[;,]|https?:\/\/|\/[^/])/i.test(value)
    ? value
    : null

export function normalizeTokenPrototype(
  value: unknown,
  kind: 'crawler' | 'pet' | 'mob' | 'boss' = 'crawler',
): TokenPrototype {
  const source = value && typeof value === 'object' ? (value as Partial<TokenPrototype>) : {}
  const legacyDisposition = ['Friendly', 'Self', 'Other crawlers'].includes(source.disposition as string)
    ? 'Other Crawlers'
    : (source.disposition as string) === 'Hostile'
      ? 'Hostile NPCs'
      : (source.disposition as string) === 'Neutral'
        ? 'Non-Hostile NPCs'
        : source.disposition
  const light =
    source.light && typeof source.light === 'object' ? source.light : ({} as Partial<TokenPrototype['light']>)
  const brightFeet = number(light.brightFeet, 0, 0, 100000)
  const hoverMode = 'Hovered by Anyone' as const
  return {
    faction:
      typeof source.faction === 'string' && source.faction.trim() ? source.faction.trim().slice(0, 80) : 'automatic',
    name: typeof source.name === 'string' ? source.name.slice(0, 100) : '',
    displayName: tokenDisplayModes.includes(source.displayName as never) ? source.displayName! : hoverMode,
    elevation: number(source.elevation, 0, -100000, 100000),
    sort: number(source.sort, 0, -100000, 100000),
    lockRotation: source.lockRotation === true,
    movementSpeed: number(source.movementSpeed, Number.NaN, 0.25, 4) || null,
    secretDisposition: source.secretDisposition === true,
    disposition: tokenDispositions.includes(legacyDisposition as never)
      ? legacyDisposition!
      : kind === 'crawler'
        ? 'Other Crawlers'
        : 'Hostile NPCs',
    hidden: source.hidden === true,
    mirrorX: source.mirrorX === true,
    mirrorY: source.mirrorY === true,
    tint: /^#[0-9a-f]{6}$/i.test(source.tint ?? '') ? source.tint! : '#ffffff',
    opacity: number(source.opacity, 1, 0, 1),
    fit: ['fill', 'contain', 'cover', 'width', 'height'].includes(source.fit ?? '') ? source.fit! : 'cover',
    anchorX: number(source.anchorX, 0.5, 0, 1),
    anchorY: number(source.anchorY, 0.5, 0, 1),
    scale: number(source.scale, 1, 0.25, 4),
    framed: source.framed === true,
    ring: {
      enabled: source.ring?.enabled === true,
      color: /^#[0-9a-f]{6}$/i.test(source.ring?.color ?? '') ? source.ring!.color : '#9cb8cb',
      background: /^#[0-9a-f]{6}$/i.test(source.ring?.background ?? '') ? source.ring!.background : '#153345',
      subject: tokenImage(source.ring?.subject),
      subjectScale: number(source.ring?.subjectScale, 1, 0.25, 4),
      pulse: source.ring?.pulse === true,
      gradient: source.ring?.gradient === true,
      wave: source.ring?.wave === true,
      spectral: source.ring?.spectral === true,
    },
    visionAngle: number(source.visionAngle, 360, 1, 360),
    visionMode: ['Basic Vision', 'Darkvision', 'Monochromatic', 'Tremorsense', 'Light Amplification'].includes(
      source.visionMode ?? '',
    )
      ? source.visionMode!
      : 'Basic Vision',
    displayBars: tokenDisplayModes.includes(source.displayBars as never) ? source.displayBars! : hoverMode,
    bar1: ['none', 'health', 'mana'].includes(source.bar1 ?? '') ? source.bar1! : 'health',
    bar2: ['none', 'health', 'mana'].includes(source.bar2 ?? '')
      ? source.bar2!
      : kind === 'crawler' || kind === 'pet'
        ? 'mana'
        : 'none',
    lightAngle: number(source.lightAngle, 360, 1, 360),
    lightProperties: normalizeLightProperties(source.lightProperties),
    image: tokenImage(source.image),
    width: number(source.width, 1, 0.25, 20),
    height: number(source.height, 1, 0.25, 20),
    rotation: ((number(source.rotation, 0, -36000, 36000) % 360) + 360) % 360,
    visionEnabled: source.visionEnabled !== false,
    visionRangeFeet: number(source.visionRangeFeet, 60, 0, 100000),
    light: {
      enabled: light.enabled === true,
      brightFeet,
      dimFeet: Math.max(brightFeet, number(light.dimFeet, 0, 0, 100000)),
      color: typeof light.color === 'string' && /^#[0-9a-f]{6}$/i.test(light.color) ? light.color : '#fff2c2',
      opacity: number(light.opacity, 0.35, 0, 1),
    },
  }
}

export function creatureTokenSize(size: unknown): number {
  const names = ['tiny', 'small', 'petite', 'medium', 'large', 'huge', 'colossal', 'gargantuan']
  const index =
    typeof size === 'string' && names.includes(size.toLowerCase())
      ? names.indexOf(size.toLowerCase())
      : Number(size) - 1
  return [0.5, 0.7, 0.9, 1, 2, 3, 4, 5][index] ?? 1
}
export function actorTokenDefaults(data: Record<string, any>) {
  const prototype = normalizeTokenPrototype(
    data.tokenPrototype,
    data.kind === 'crawler' ? 'crawler' : data.kind === 'boss' ? 'boss' : data.kind === 'pet' ? 'pet' : 'mob',
  )
  const size = creatureTokenSize(data.character?.size ?? data.size ?? data.stats?.size)
  // Preserve deliberately customized dimensions; replace the former universal 1×1 default.
  const automatic = prototype.width === 1 && prototype.height === 1
  return {
    ...prototype,
    ...(automatic ? { width: size, height: size } : {}),
    image: prototype.image ?? tokenImage(data.portrait) ?? defaultActorTokenImage,
  }
}
export const crawlerTokenDefaults = (data: Record<string, any>) => actorTokenDefaults({ ...data, kind: 'crawler' })

/** Scene overrides win; older tokens inherit only missing vision settings. */
export function resolveTokenVision(
  token: Partial<TokenPrototype>,
  characterPrototype: unknown,
  sceneRangeFeet: number,
) {
  const prototype = normalizeTokenPrototype(characterPrototype)
  const source =
    characterPrototype && typeof characterPrototype === 'object' ? (characterPrototype as Partial<TokenPrototype>) : {}
  return {
    visionEnabled: token.visionEnabled ?? prototype.visionEnabled,
    visionRangeFeet:
      token.visionRangeFeet ?? (source.visionRangeFeet != null ? prototype.visionRangeFeet : sceneRangeFeet),
  }
}
