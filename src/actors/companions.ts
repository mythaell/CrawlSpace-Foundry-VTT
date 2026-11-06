/**
 * A crawler's followers: pets, mounts and vehicles (CompanionsTab.tsx), hired minions, and mobs raised as
 * minions. Each is its own actor with `system.master` pointing at the crawler, and the crawler's players own it,
 * so they can move it, roll for it and (except for raised minions) edit it.
 */

const OWNER = () => CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER

/** The players who own a crawler, as ownership entries. */
export const ownersOf = (crawler: any): Record<string, number> =>
  Object.fromEntries(Object.entries<number>(crawler?.ownership ?? {}).filter(([id, level]) => id !== 'default' && Number(level) >= OWNER()))

const ORDER: Record<string, number> = { pet: 0, mount: 1, vehicle: 2, minion: 3, raised: 4 }

/** What a follower is, for sorting and its label: pet, mount, vehicle, minion or raised. */
export const followerKind = (actor: any) =>
  actor.system.minion?.temporary ? 'raised' : actor.type === 'companion' ? actor.system.kind : 'minion'

/**
 * The actors following this crawler, pets first and raised minions last. Raised mobs are usually unlinked tokens,
 * so the viewed scene's tokens are searched as well as the world's actors.
 */
export function followersOf(crawler: any): any[] {
  const found = new Map<string, any>()
  for (const actor of game.actors) if (actor.system?.master === crawler.uuid) found.set(actor.uuid, actor)
  for (const token of canvas?.scene?.tokens ?? []) {
    const actor = token.actor
    if (actor?.system?.master === crawler.uuid) found.set(actor.uuid, actor)
  }
  return [...found.values()].sort((a, b) => ORDER[followerKind(a)] - ORDER[followerKind(b)] || a.name.localeCompare(b.name))
}

/**
 * Where an actor sits in a crawler-first list: each crawler (by name) followed by its pets, mounts and minions,
 * then everything else by name. Followers of a crawler that isn't in the list still sort with the crawlers.
 */
export function partyOrder(actor: any): { group: number; key: string; follower: boolean; kind: number } {
  if (actor?.type === 'crawler') return { group: 0, key: actor.name.toLowerCase(), follower: false, kind: -1 }
  const master = actor?.system?.master ? fromUuidSync(actor.system.master) : null
  if (master?.type === 'crawler') return { group: 0, key: master.name.toLowerCase(), follower: true, kind: ORDER[followerKind(actor)] ?? 9 }
  return { group: 1, key: String(actor?.name ?? '').toLowerCase(), follower: false, kind: -1 }
}

/** Compare two actors (or anything with a name) in crawler-first order. */
export function comparePartyOrder(a: any, b: any, nameA = a?.name ?? '', nameB = b?.name ?? '') {
  const x = partyOrder(a)
  const y = partyOrder(b)
  return x.group - y.group || x.key.localeCompare(y.key) || Number(x.follower) - Number(y.follower) || x.kind - y.kind || String(nameA).localeCompare(String(nameB))
}

/** Make a pet, mount or minion follow a crawler: it records the crawler, and the crawler's owners own it too. */
export async function linkFollower(actor: any, crawler: any) {
  if (crawler?.type !== 'crawler' || !('master' in (actor.system ?? {}))) return
  const ownership = { ...releasedOwnership(actor), ...ownersOf(crawler) }
  return actor.update({ 'system.master': crawler.uuid, ownership })
}

/** Ownership with the current master's players taken back out (GMs and anyone else stay). */
function releasedOwnership(actor: any) {
  const ownership = { ...(actor.ownership ?? {}) }
  const master = actor.system?.master ? fromUuidSync(actor.system.master) : null
  for (const id of Object.keys(ownersOf(master))) if (!game.users.get(id)?.isGM) ownership[id] = CONST.DOCUMENT_OWNERSHIP_LEVELS.INHERIT
  return ownership
}

/** Stop following: the old crawler's players lose ownership. */
export async function unlinkFollower(actor: any) {
  return actor.update({ 'system.master': '', ownership: releasedOwnership(actor) })
}

/** A new pet, mount or hired minion for a crawler, ready to edit. */
export async function createFollower(crawler: any, kind: 'pet' | 'mount' | 'vehicle' | 'minion') {
  const label = game.i18n.localize(kind === 'minion' ? 'CRAWLSPACE.Minion.Label' : `CRAWLSPACE.Companion.${kind}`)
  const actor = await Actor.implementation.create({
    name: game.i18n.format('CRAWLSPACE.Companion.NewName', { name: crawler.name, kind: label }),
    type: kind === 'minion' ? 'minion' : 'companion',
    system: kind === 'minion' ? {} : { kind },
    prototypeToken: { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY },
    folder: crawler.folder?.id ?? null,
  })
  if (!actor) return
  await linkFollower(actor, crawler)
  actor.sheet.render(true)
  return actor
}

/**
 * A crawler's open sheet follows its followers' names and Health, and a crawler's new players get its
 * followers too (the active GM makes that change, since players can't edit ownership).
 */
export function registerCompanions() {
  const refresh = (actor: any) => {
    if (!actor?.system || !('master' in actor.system)) return
    const masters = new Set([actor.system.master, actor._previousMaster].filter(Boolean))
    for (const uuid of masters) {
      const crawler = fromUuidSync(uuid)
      if (crawler?.sheet?.rendered) crawler.sheet.render({ parts: ['sidebar'] })
    }
  }
  // Remember the old crawler so unlinking also refreshes it.
  Hooks.on('preUpdateActor', (actor: any) => {
    if (actor.system && 'master' in actor.system) actor._previousMaster = actor.system.master
  })
  Hooks.on('createActor', refresh)
  Hooks.on('updateActor', (actor: any, changes: any) => {
    refresh(actor)
    // The Actors sidebar regroups when something starts or stops following a crawler.
    if (changes.system && 'master' in changes.system) ui.actors?.render()
    if (actor.type !== 'crawler' || !changes.ownership || !game.user.isActiveGM) return
    for (const follower of followersOf(actor)) {
      const missing = Object.entries(ownersOf(actor)).filter(([id, level]) => Number(follower.ownership[id] ?? -1) < level)
      if (missing.length) follower.update({ ownership: { ...follower.ownership, ...Object.fromEntries(missing) } })
    }
  })
  Hooks.on('deleteActor', refresh)
}

/**
 * The Actors sidebar in crawler-first order: crawlers on top, each followed by its pets, mounts and minions
 * (indented, even if they sit in another folder), then everything else. Folders keep their place.
 */
export function groupActorDirectory(root: HTMLElement) {
  const entries = [...root.querySelectorAll<HTMLElement>('li.directory-item[data-entry-id]')]
  const actorOf = (li: HTMLElement) => game.actors.get(li.dataset.entryId)
  for (const list of new Set(entries.map((li) => li.parentElement).filter(Boolean)) as Set<HTMLElement>) {
    const own = [...list.children].filter((child): child is HTMLElement => entries.includes(child as HTMLElement))
    own.sort((a, b) => comparePartyOrder(actorOf(a), actorOf(b))).forEach((li) => list.append(li))
  }
  const byId = new Map(entries.map((li) => [li.dataset.entryId, li]))
  const followers = entries.filter((li) => partyOrder(actorOf(li)).follower).sort((a, b) => comparePartyOrder(actorOf(a), actorOf(b)))
  for (const li of entries) li.classList.toggle('crawl-follower', followers.includes(li))
  for (const li of followers) {
    let anchor = byId.get(fromUuidSync(actorOf(li).system.master)?.id)
    if (!anchor) continue
    while (anchor.nextElementSibling?.classList.contains('crawl-follower') && anchor.nextElementSibling !== li) anchor = anchor.nextElementSibling as HTMLElement
    if (anchor !== li) anchor.after(li)
  }
}
