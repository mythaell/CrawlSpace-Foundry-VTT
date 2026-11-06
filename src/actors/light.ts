/**
 * Light orbs (effectValues.ts conditionAtRank lightOrb, PartySceneCanvas orbs). CrawlSpace places a separate
 * orb that follows its caster; Foundry already lights tokens, so while an actor has an active Light condition
 * its tokens shine with the orb's bright and dim radii. The token's own light is saved and comes back when the
 * condition ends. The active GM's client makes the change, since players can't always update every token.
 */
import { CUSTOM_CHANGE_TYPES } from '../effects/mapping'

type Orb = { bright: number; dim: number }

const ORB_LIGHT = { color: '#fff2c2', alpha: 0.35, animation: { type: 'torch', speed: 2, intensity: 2 } }

const parse = (value: unknown) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : (value ?? {})
  } catch {
    return {}
  }
}

/** The brightest active light on the actor, or null. Doubled orbs double their bright radius. */
export function actorOrb(actor: any): Orb | null {
  let best: Orb | null = null
  for (const effect of actor.appliedEffects ?? [])
    for (const change of effect.system?.changes ?? effect.changes ?? []) {
      if (change.type !== CUSTOM_CHANGE_TYPES.special || change.key !== 'lightOrb') continue
      const data = parse(change.value)
      const bright = Math.max(0, Math.floor(Number(data.target) || 0)) * (data.doubled ? 2 : 1)
      const dim = Math.max(bright, Math.floor(Number(data.dimFeet) || 0))
      if (dim > 0 && (!best || dim > best.dim || (dim === best.dim && bright > best.bright))) best = { bright, dim }
    }
  return best
}

/** Every placed token showing this actor: its own synthetic token, or every linked token in every scene. */
const tokensOf = (actor: any): any[] =>
  actor.isToken ? [actor.token].filter(Boolean) : game.scenes.contents.flatMap((scene: any) => scene.tokens.filter((token: any) => token.actorLink && token.actorId === actor.id))

/** Match a token's light to its actor's orb: light it, change it, or put back the light it had. */
async function refreshToken(token: any, orb: Orb | null) {
  const saved = token.flags?.crawlspace?.light
  if (orb) {
    const current = token.light
    if (saved && current.bright === orb.bright && current.dim === orb.dim) return
    await token.update({
      light: { ...ORB_LIGHT, bright: orb.bright, dim: orb.dim },
      ...(saved ? {} : { 'flags.crawlspace.light': token.light.toObject() }),
    })
  } else if (saved) await token.update({ light: saved, 'flags.crawlspace.-=light': null })
}

export async function refreshLight(actor: any) {
  const orb = actorOrb(actor)
  for (const token of tokensOf(actor)) await refreshToken(token, orb)
}

export function registerLight() {
  const fromEffect = (effect: any) => {
    const parent = effect.parent
    const actor = parent?.documentName === 'Actor' ? parent : parent?.parent
    if (!game.user.isActiveGM || actor?.documentName !== 'Actor') return
    refreshLight(actor).catch((error: any) => console.error('CrawlSpace | light', error))
  }
  Hooks.on('createActiveEffect', fromEffect)
  Hooks.on('updateActiveEffect', fromEffect)
  Hooks.on('deleteActiveEffect', fromEffect)
  // A token placed while its actor already carries a light shines at once.
  Hooks.on('createToken', (token: any) => {
    if (!game.user.isActiveGM || !token.actor) return
    const orb = actorOrb(token.actor)
    if (orb) refreshToken(token, orb).catch((error: any) => console.error('CrawlSpace | light', error))
  })
}
