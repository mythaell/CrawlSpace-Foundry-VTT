/**
 * Popup editor for one row of an actor's array field: crawler attacks and actions, mob attacks and abilities.
 * The row is found by index each render, so it always edits the current data.
 */
import { CHECK_TYPES, DAMAGE_TYPES } from '../config'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api

export type RowKind = 'attack' | 'action' | 'mobAttack' | 'mobAbility'

const PATHS: Record<RowKind, string> = {
  attack: 'system.attacks',
  action: 'system.sheetActions',
  mobAttack: 'system.attacks',
  mobAbility: 'system.abilities',
}

export class CrawlRowConfig extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS: any = {
    tag: 'form',
    classes: ['crawlspace', 'row-config'],
    position: { width: 520, height: 'auto' },
    window: { resizable: true },
    form: { submitOnChange: true, closeOnSubmit: false, handler: CrawlRowConfig.#onSubmit },
  }

  static PARTS = {
    form: { template: 'systems/crawlspace/templates/dialogs/row-config.hbs' },
  }

  actor: any
  kind: RowKind
  index: number

  constructor(options: { actor: any; kind: RowKind; index: number }) {
    super({ id: `crawl-row-${options.actor.id}-${options.kind}-${options.index}`, ...options } as any)
    this.actor = options.actor
    this.kind = options.kind
    this.index = options.index
  }

  /** Open (or bring forward) the editor for a row. */
  static open(actor: any, kind: RowKind, index: number) {
    const id = `crawl-row-${actor.id}-${kind}-${index}`
    const existing = foundry.applications.instances.get(id)
    if (existing) return existing.render({ force: true })
    return new CrawlRowConfig({ actor, kind, index }).render({ force: true })
  }

  get title() {
    return `${game.i18n.localize(`CRAWLSPACE.RowConfig.${this.kind}`)}: ${this.row?.name ?? ''}`
  }

  get row() {
    return foundry.utils.getProperty(this.actor, PATHS[this.kind])?.[this.index]
  }

  _onFirstRender(context: any, options: any) {
    super._onFirstRender(context, options)
    this.actor.apps[this.id] = this
  }

  _onClose(options: any) {
    super._onClose(options)
    delete this.actor.apps[this.id]
  }

  async _prepareContext() {
    const row = this.row
    if (!row) {
      this.close()
      return {}
    }
    const items = [...this.actor.items].sort((a: any, b: any) => a.name.localeCompare(b.name))
    const option = (item: any) => ({ id: item.id, name: `${item.name} (${game.i18n.localize(`TYPES.Item.${item.type}`)})` })
    return {
      kind: this.kind,
      row,
      isAttack: this.kind === 'attack',
      isAction: this.kind === 'action',
      isMobAttack: this.kind === 'mobAttack',
      isMobAbility: this.kind === 'mobAbility',
      damageTypesText: (row.damageTypes ?? []).join(', '),
      damageTypeList: DAMAGE_TYPES.join(', '),
      sources: items.filter((item: any) => ['weapon', 'skill', 'spell', 'consumable', 'ability', 'equipment', 'tattoo'].includes(item.type)).map(option),
      skills: items.filter((item: any) => item.type === 'skill' || item.type === 'spell').map(option),
      ammunition: items.filter((item: any) => item.type === 'consumable' || (item.type === 'weapon' && item.system.weaponType === 'ammunition')).map(option),
      kindChoices: { action: 'CRAWLSPACE.Actions.action', interrupt: 'CRAWLSPACE.Actions.interrupt' },
      checkTypes: CHECK_TYPES,
    }
  }

  static async #onSubmit(this: CrawlRowConfig, _event: Event, _form: HTMLFormElement, formData: any) {
    const path = PATHS[this.kind]
    const rows = foundry.utils.deepClone(foundry.utils.getProperty(this.actor._source, path) ?? [])
    if (!rows[this.index]) return
    const changes = foundry.utils.expandObject(formData.object)
    if (typeof changes.damageTypes === 'string')
      changes.damageTypes = changes.damageTypes.split(',').map((type: string) => type.trim()).filter(Boolean)
    if ('hitBonus' in changes) changes.hitBonus = Number(changes.hitBonus) || 0
    rows[this.index] = foundry.utils.mergeObject(rows[this.index], changes, { inplace: false })
    await this.actor.update({ [path]: rows })
  }
}
