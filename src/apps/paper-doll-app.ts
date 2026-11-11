/**
 * The paper doll in its own window (opened from the inventory tab): drop gear on a slot to wear it there, hover an
 * item for its details, click it to open it, or use the × to take it off.
 */
import { ActorPopup, droppedItem } from './actions-config'
import { paperDollContext } from '../sheets/paper-doll'
import { isHandItem } from '../rules/hands'

/** Wear a dropped item in the doll slot it landed on. Items from elsewhere are copied to the crawler first. */
export async function equipOnDoll(actor: any, dropped: any, zone: HTMLElement) {
  if (!dropped || !['weapon', 'equipment'].includes(dropped.type)) return
  const item = dropped.parent === actor ? dropped : (await actor.createEmbeddedDocuments('Item', [dropped.toObject()]))[0]
  if (!item) return
  const hand = zone.dataset.dollHand
  if (hand) {
    if (!isHandItem(item)) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Hands.NotHeld'))
    return item.update({ 'system.equipped': true, 'system.hand': item.system.isShield ? 'off' : hand })
  }
  // Weapons and shields are held, not worn.
  if (item.type !== 'equipment' || item.system.isShield) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Hands.HeldOnly'))
  const slot = zone.dataset.dollSlot
  if (!slot) return
  // One item per body slot: the one there is taken off.
  const worn = slot === 'accessory' ? [] : actor.items.filter((owned: any) => owned.id !== item.id && owned.type === 'equipment' && owned.system.equipped && !owned.system.isShield && owned.system.slot === slot)
  if (worn.length) await actor.updateEmbeddedDocuments('Item', worn.map((owned: any) => ({ _id: owned.id, 'system.equipped': false })))
  return item.update({ 'system.equipped': true, 'system.slot': slot })
}

export class PaperDollApp extends ActorPopup {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'paper-doll-app'],
    position: { width: 480, height: 'auto' },
    window: { resizable: true, icon: 'fa-solid fa-person' },
    actions: {
      editItem: PaperDollApp.#onOpen,
      toggleEquip: PaperDollApp.#onUnequip,
    },
  }

  static PARTS = { main: { template: 'systems/crawlspace/templates/apps/paper-doll.hbs' } }

  static open(actor: any) {
    const id = `crawl-doll-${actor.uuid.replace(/\./g, '-')}`
    const existing = foundry.applications.instances.get(id)
    if (existing) return existing.render({ force: true })
    return new PaperDollApp(actor, { id }).render({ force: true })
  }

  get title() {
    return `${game.i18n.localize('CRAWLSPACE.Doll.Title')}: ${this.actor.name}`
  }

  async _prepareContext() {
    return { doll: paperDollContext(this.actor), document: this.actor, editable: this.editable }
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    for (const slot of (this.element as HTMLElement).querySelectorAll<HTMLElement>('.doll-slot[data-item-id]')) {
      slot.setAttribute('draggable', 'true')
      slot.addEventListener('dragstart', (event) => {
        const item = this.actor.items.get(slot.dataset.itemId)
        if (item) event.dataTransfer?.setData('text/plain', JSON.stringify(item.toDragData()))
      })
    }
    this.dropZones('[data-doll-slot]', async (event, zone) => {
      const { item } = await droppedItem(event)
      await equipOnDoll(this.actor, item, zone)
    })
  }

  static #onOpen(this: PaperDollApp, _event: Event, target: HTMLElement) {
    this.actor.items.get(target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)?.sheet.render(true)
  }

  static async #onUnequip(this: PaperDollApp, _event: Event, target: HTMLElement) {
    const item = this.actor.items.get(target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)
    if (item) await item.update({ 'system.equipped': false })
  }
}
