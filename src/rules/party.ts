/**
 * Who is in the party. The GM adds and removes crawlers (flags.crawlspace.inParty). Until anyone has been
 * added, the party is guessed: the crawlers a player owns, or every crawler while no player owns one.
 * A crawler the GM removed stays out either way.
 */
type Member = { hasPlayerOwner?: boolean; flags?: { crawlspace?: { inParty?: boolean } } }

export const partyFlag = (actor: Member) => actor.flags?.crawlspace?.inParty

export function pickParty<T extends Member>(crawlers: T[]): T[] {
  if (crawlers.some((actor) => partyFlag(actor) === true)) return crawlers.filter((actor) => partyFlag(actor) === true)
  const candidates = crawlers.filter((actor) => partyFlag(actor) !== false)
  const owned = candidates.filter((actor) => actor.hasPlayerOwner)
  return owned.length ? owned : candidates
}
