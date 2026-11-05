import { CHECK_TYPES, DAMAGE_TYPES, GEAR_SLOTS, STATS } from '../config'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

/** One sheet for every item type; the details part switches on type. */
export class CrawlItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'item'],
    position: { width: 560, height: 620 },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      createEffect: CrawlItemSheet.#onCreateEffect,
      editEffect: CrawlItemSheet.#onEditEffect,
      deleteEffect: CrawlItemSheet.#onDeleteEffect,
      toggleEffect: CrawlItemSheet.#onToggleEffect,
      addBenefit: CrawlItemSheet.#onAddBenefit,
      deleteBenefit: CrawlItemSheet.#onDeleteBenefit,
    },
  }

  static PARTS = {
    header: { template: 'systems/crawlspace/templates/item/header.hbs' },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    description: { template: 'systems/crawlspace/templates/item/description.hbs', scrollable: [''] },
    details: { template: 'systems/crawlspace/templates/item/details.hbs', scrollable: [''] },
    effects: { template: 'systems/crawlspace/templates/item/effects.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: [
        { id: 'description', icon: 'fa-solid fa-book' },
        { id: 'details', icon: 'fa-solid fa-sliders' },
        { id: 'effects', icon: 'fa-solid fa-bolt' },
      ],
      initial: 'description',
      labelPrefix: 'CRAWLSPACE.Tab',
    },
  }

  get item() {
    return this.document
  }

  async _prepareContext(options: any) {
    const context = await super._prepareContext(options)
    const item = this.item
    Object.assign(context, {
      item,
      system: item.system,
      systemSource: item._source.system,
      systemFields: item.system.schema.fields,
      type: item.type,
      isRanked: item.type === 'skill' || item.type === 'spell',
      isPhysical: ['weapon', 'equipment', 'consumable', 'tattoo', 'loot'].includes(item.type),
      hasDamage: ['skill', 'spell', 'weapon', 'consumable', 'trap'].includes(item.type),
      hasBenefits: item.type === 'race' || item.type === 'class',
      statChoices: Object.fromEntries(Object.values(STATS).map((stat) => [stat.code, stat.label])),
      checkTypes: Object.fromEntries(CHECK_TYPES.map((type) => [type, type])),
      slotChoices: GEAR_SLOTS,
      damageTypeList: DAMAGE_TYPES.join(', '),
      damageTypesText: (item.system.damage?.types ?? []).join(', '),
      usageChoices: { learned: 'CRAWLSPACE.Usage.learned', inherent: 'CRAWLSPACE.Usage.inherent', scroll: 'CRAWLSPACE.Usage.scroll', tome: 'CRAWLSPACE.Usage.tome' },
      weaponTypeChoices: Object.fromEntries(['melee', 'ranged', 'thrown', 'ammunition', 'other'].map((t) => [t, `CRAWLSPACE.WeaponType.${t}`])),
      abilityCategories: Object.fromEntries(['racial', 'class', 'other'].map((c) => [c, `CRAWLSPACE.Ability.${c}`])),
      stageChoices: Object.fromEntries(['childhood', 'adolescence', 'career', 'hobby'].map((s) => [s, `CRAWLSPACE.Crawler.${s[0].toUpperCase()}${s.slice(1)}`])),
      upgradeRows: ['rank5', 'rank10', 'rank15'].map((key) => ({
        key,
        label: game.i18n.format('CRAWLSPACE.Effect.AtRank', { rank: key.slice(4) }),
        text: item._source.system.upgrades?.[key] ?? '',
        damage: item._source.system.upgrades?.[`${key}Damage`] ?? '',
      })),
      benefitLists: ['benefits', 'detriments'].map((key) => ({
        key,
        label: game.i18n.localize(`CRAWLSPACE.Item.${key}`),
        entries: item._source.system[key] ?? [],
      })),
    })
    return context
  }

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    if (context.tabs?.[partId]) context.tab = context.tabs[partId]
    if (partId === 'description') {
      context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.item.system.description ?? '', {
        relativeTo: this.item,
        secrets: this.item.isOwner,
      })
    }
    if (partId === 'effects') {
      context.effects = this.item.effects.map((effect: any) => ({
        id: effect.id,
        name: effect.name,
        img: effect.img,
        disabled: effect.disabled,
        transfer: effect.transfer,
        requiredRank: effect.system?.requiredRank,
        changes: (effect.system?.changes ?? []).map((change: any) => `${change.key} ${change.type} ${change.value}`),
      }))
    }
    return context
  }

  /** Comma-separated damage types become an array. */
  _processFormData(event: any, form: any, formData: any) {
    const data = super._processFormData(event, form, formData)
    const types = data.system?.damage?.typesText
    if (typeof types === 'string') {
      data.system.damage.types = types.split(',').map((type: string) => type.trim()).filter(Boolean)
      delete data.system.damage.typesText
    }
    for (const key of ['benefits', 'detriments']) {
      const list = data.system?.[key]
      if (list && !Array.isArray(list)) {
        const current = this.item.system.toObject()[key]
        for (const [index, changes] of Object.entries(list)) current[Number(index)] = { ...(current[Number(index)] ?? {}), ...(changes as object) }
        data.system[key] = current
      }
    }
    return data
  }

  static async #onCreateEffect(this: CrawlItemSheet) {
    const [effect] = await this.item.createEmbeddedDocuments('ActiveEffect', [
      { name: this.item.name, img: this.item.img, transfer: true },
    ])
    effect?.sheet.render(true)
  }
  static #effect(sheet: CrawlItemSheet, target: HTMLElement) {
    return sheet.item.effects.get(target.closest<HTMLElement>('[data-effect-id]')?.dataset.effectId)
  }
  static async #onEditEffect(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    return CrawlItemSheet.#effect(this, target)?.sheet.render(true)
  }
  static async #onDeleteEffect(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    return CrawlItemSheet.#effect(this, target)?.delete()
  }
  static async #onToggleEffect(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const effect = CrawlItemSheet.#effect(this, target)
    if (effect) await effect.update({ disabled: !effect.disabled })
  }
  static async #onAddBenefit(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.list as 'benefits' | 'detriments'
    const list = this.item.system.toObject()[key]
    list.push({ name: '', tier: '', description: '' })
    await this.item.update({ [`system.${key}`]: list })
  }
  static async #onDeleteBenefit(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.list as 'benefits' | 'detriments'
    const list = this.item.system.toObject()[key]
    list.splice(Number(target.dataset.index), 1)
    await this.item.update({ [`system.${key}`]: list })
  }
}
