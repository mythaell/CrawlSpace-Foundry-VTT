/**
 * Party membership. The GM adds or removes a crawler from the Actors list's right-click menu; members get a
 * small party mark in the list. The crawler frames and the auto-loot timer use this party.
 */
import { partyFlag, pickParty } from '../rules/party'

/** The party's crawlers, by name. */
export function partyCrawlers(): any[] {
  const crawlers = game.actors.contents.filter((actor: any) => actor.type === 'crawler' && actor.visible)
  return pickParty(crawlers).sort((a: any, b: any) => a.name.localeCompare(b.name))
}

export const inParty = (actor: any) => actor?.type === 'crawler' && partyCrawlers().includes(actor)

const t = (key: string) => game.i18n.localize(`CRAWLSPACE.Party.${key}`)

export function registerParty() {
  Hooks.on('getActorContextOptions', (_app: any, options: any[]) => {
    const actorOf = (li: HTMLElement) => game.actors.get(li.closest<HTMLElement>('[data-entry-id]')?.dataset.entryId)
    const crawler = (li: HTMLElement) => game.user.isGM && actorOf(li)?.type === 'crawler'
    options.push(
      {
        label: 'CRAWLSPACE.Party.Add',
        icon: 'fa-solid fa-user-plus',
        visible: (li: HTMLElement) => crawler(li) && partyFlag(actorOf(li)) !== true,
        onClick: (_event: Event, li: HTMLElement) => actorOf(li).setFlag('crawlspace', 'inParty', true),
      },
      {
        label: 'CRAWLSPACE.Party.Remove',
        icon: 'fa-solid fa-user-minus',
        visible: (li: HTMLElement) => crawler(li) && inParty(actorOf(li)),
        onClick: (_event: Event, li: HTMLElement) => actorOf(li).setFlag('crawlspace', 'inParty', false),
      },
    )
  })
  // Redraw the list when membership changes, so the marks follow.
  Hooks.on('updateActor', (actor: any, changes: any) => {
    if (actor.type === 'crawler' && foundry.utils.hasProperty(changes, 'flags.crawlspace.inParty')) ui.actors?.render()
  })
}

/** Mark the party's crawlers in the Actors list. */
export function markPartyInDirectory(root: HTMLElement) {
  const members = new Set(partyCrawlers().map((actor) => actor.id))
  for (const li of root.querySelectorAll<HTMLElement>('li.directory-item[data-entry-id]')) {
    li.querySelector('.crawl-party-mark')?.remove()
    if (!members.has(li.dataset.entryId)) continue
    const mark = document.createElement('i')
    mark.className = 'crawl-party-mark fa-solid fa-users'
    mark.dataset.tooltip = t('Member')
    li.querySelector('.entry-name, .document-name')?.append(mark)
  }
}
