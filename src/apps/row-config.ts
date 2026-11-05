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
  /** The row's id when it has one (attacks, actions), else its index (mob abilities). */
  key: string | number

  /**
   * The actor is kept on the instance, not in the application options: ApplicationV2 deep-merges its options,
   * which must never walk a Document.
   */
  constructor(actor: any, kind: RowKind, key: string | number) {
    super({ id: CrawlRowConfig.idFor(actor, kind, key) } as any)
    this.actor = actor
    this.kind = kind
    this.key = key
  }

  /** Token actors share their base actor's id, so key by UUID. */
  static idFor(actor: any, kind: RowKind, key: string | number) {
    return `crawl-row-${actor.uuid.replace(/\./g, '-')}-${kind}-${key}`
  }

  /** Open (or bring forward) the editor for the row at `index`. */
  static open(actor: any, kind: RowKind, index: number) {
    const row = foundry.utils.getProperty(actor._source, PATHS[kind])?.[index]
    const key = row?.id || index
    const existing = foundry.applications.instances.get(CrawlRowConfig.idFor(actor, kind, key))
    if (existing) return existing.render({ force: true })
    return new CrawlRowConfig(actor, kind, key).render({ force: true })
  }

  get title() {
    return `${game.i18n.localize(`CRAWLSPACE.RowConfig.${this.kind}`)}: ${this.row?.name ?? ''}`
  }

  /** Rows are read from the source data, which an update changes at once (token actors re-prepare later). */
  get rows(): any[] {
    return foundry.utils.getProperty(this.actor._source, PATHS[this.kind]) ?? []
  }

  get rowIndex() {
    return typeof this.key === 'number' ? this.key : this.rows.findIndex((row) => row.id === this.key)
  }

  get row() {
    return this.rows[this.rowIndex]
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
    // The row was deleted: say so instead of closing mid-render.
    if (!row) return { missing: true }
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
    const rows = foundry.utils.deepClone(this.rows)
    const index = this.rowIndex
    if (!rows[index]) return
    const changes = foundry.utils.expandObject(formData.object)
    if (typeof changes.damageTypes === 'string')
      changes.damageTypes = changes.damageTypes.split(',').map((type: string) => type.trim()).filter(Boolean)
    if ('hitBonus' in changes) changes.hitBonus = Number(changes.hitBonus) || 0
    rows[index] = foundry.utils.mergeObject(rows[index], changes, { inplace: false })
    await this.actor.update({ [path]: rows })
  }
}
