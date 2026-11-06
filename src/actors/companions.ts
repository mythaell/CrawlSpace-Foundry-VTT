/**
 * Pets and mounts (CompanionsTab.tsx). CrawlSpace keeps one pet and one mount inline on the character; here each
 * is its own `companion` actor so it can have a token, take damage and join combat, linked back to its crawler.
 */

/** The companions that belong to this crawler, pets first. */
export const companionsOf = (crawler: any): any[] =>
  game.actors.contents
    .filter((actor: any) => actor.type === 'companion' && actor.system.companion.master === crawler.uuid)
    .sort((a: any, b: any) => Number(b.system.kind === 'pet') - Number(a.system.kind === 'pet') || a.name.localeCompare(b.name))

/** Give a companion to a crawler: it records the crawler, and the crawler's owners own it too. */
export async function linkCompanion(companion: any, crawler: any) {
  const owners = Object.fromEntries(
    Object.entries(crawler.ownership ?? {}).filter(([id, level]) => id !== 'default' && Number(level) >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER),
  )
  return companion.update({ 'system.companion.master': crawler.uuid, ownership: { ...companion.ownership, ...owners } })
}

/** A new companion for a crawler, ready to edit. */
export async function createCompanion(crawler: any, kind: 'pet' | 'mount' | 'vehicle') {
  const companion = await Actor.implementation.create({
    name: game.i18n.format('CRAWLSPACE.Companion.NewName', { name: crawler.name, kind: game.i18n.localize(`CRAWLSPACE.Companion.${kind}`) }),
    type: 'companion',
    system: { kind },
    prototypeToken: { actorLink: true, disposition: CONST.TOKEN_DISPOSITIONS.FRIENDLY },
    folder: crawler.folder?.id ?? null,
  })
  if (!companion) return
  await linkCompanion(companion, crawler)
  companion.sheet.render(true)
  return companion
}

/** A crawler's open sheet follows its companions' names and Health. */
export function registerCompanions() {
  const refresh = (actor: any) => {
    if (actor.type !== 'companion') return
    const masters = new Set([actor.system.companion.master, actor._previousMaster].filter(Boolean))
    for (const uuid of masters) fromUuidSync(uuid)?.sheet?.rendered && fromUuidSync(uuid).sheet.render({ parts: ['sidebar'] })
  }
  // Remember the old crawler so unlinking also refreshes it.
  Hooks.on('preUpdateActor', (actor: any) => {
    if (actor.type === 'companion') actor._previousMaster = actor.system.companion.master
  })
  Hooks.on('createActor', (actor: any) => refresh(actor))
  Hooks.on('updateActor', (actor: any) => refresh(actor))
  Hooks.on('deleteActor', (actor: any) => refresh(actor))
}
