import { CHECK_TYPES, DAMAGE_TYPES, GEAR_SLOTS, STATS } from '../config'
import { prepareLootBox } from '../apps/awards'
import { boxSummary } from '../loot/database'
import { bindRulesEditor, rulesContext, ruleTypeChoices } from '../effects/rules'
import { documentIds } from './ids'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

const PHYSICAL = ['weapon', 'equipment', 'consumable', 'tattoo', 'loot']

/**
 * One sheet for every item type, laid out like PF2e's item sheet: a header with the name, type and tag chips,
 * a summary column on the left, and Description / Details / Rules tabs. Rules shows each ActiveEffect as a
 * block with its changes edited through the shared rules editor.
 */
export class CrawlItemSheet extends HandlebarsApplicationMixin(ItemSheetV2) {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'item', 'pf-sheet'],
    position: { width: 640, height: 640 },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      createEffect: CrawlItemSheet.#onCreateEffect,
      editEffect: CrawlItemSheet.#onEditEffect,
      deleteEffect: CrawlItemSheet.#onDeleteEffect,
      toggleEffect: CrawlItemSheet.#onToggleEffect,
      toggleTransfer: CrawlItemSheet.#onToggleTransfer,
      addBenefit: CrawlItemSheet.#onAddBenefit,
      deleteBenefit: CrawlItemSheet.#onDeleteBenefit,
      copyId: CrawlItemSheet.#onCopyId,
      prepareLoot: CrawlItemSheet.#onPrepareLoot,
      openBox: CrawlItemSheet.#onOpenBox,
    },
  }

  static PARTS = {
    header: { template: 'systems/crawlspace/templates/item/header.hbs' },
    tabs: { template: 'systems/crawlspace/templates/sheets/pf-tabs.hbs' },
    summary: { template: 'systems/crawlspace/templates/item/summary.hbs' },
    description: { template: 'systems/crawlspace/templates/item/description.hbs', scrollable: [''] },
    details: { template: 'systems/crawlspace/templates/item/details.hbs', scrollable: [''] },
    rules: { template: 'systems/crawlspace/templates/item/effects.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: [{ id: 'description' }, { id: 'details' }, { id: 'rules' }],
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
    const system = item.system
    const actorItems = item.actor ? [...item.actor.items].sort((a: any, b: any) => a.name.localeCompare(b.name)) : []
    Object.assign(context, {
      item,
      system,
      isGM: game.user.isGM,
      lootSummary: item.type === 'lootBox' && system.loot ? boxSummary(system.loot) : [],
      systemSource: item._source.system,
      systemFields: system.schema.fields,
      type: item.type,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      isRanked: item.type === 'skill' || item.type === 'spell',
      isPhysical: PHYSICAL.includes(item.type),
      hasDamage: ['skill', 'spell', 'weapon', 'consumable', 'trap'].includes(item.type),
      damageLegend: item.type === 'weapon' ? 'CRAWLSPACE.Item.DamageBonus' : 'CRAWLSPACE.Item.Damage',
      hasBenefits: item.type === 'race' || item.type === 'class',
      statChoices: Object.fromEntries(Object.values(STATS).map((stat) => [stat.code, stat.label])),
      checkTypes: Object.fromEntries(CHECK_TYPES.map((type) => [type, type])),
      slotChoices: GEAR_SLOTS,
      damageTypeList: DAMAGE_TYPES.join(', '),
      damageTypesText: (system.damage?.types ?? []).join(', '),
      usageChoices: { learned: 'CRAWLSPACE.Usage.learned', inherent: 'CRAWLSPACE.Usage.inherent', scroll: 'CRAWLSPACE.Usage.scroll', tome: 'CRAWLSPACE.Usage.tome' },
      weaponTypeChoices: Object.fromEntries(['melee', 'ranged', 'thrown', 'ammunition', 'other'].map((t) => [t, `CRAWLSPACE.WeaponType.${t}`])),
      abilityCategories: Object.fromEntries(['racial', 'class', 'other'].map((c) => [c, `CRAWLSPACE.Ability.${c}`])),
      stageChoices: Object.fromEntries(['childhood', 'adolescence', 'career', 'hobby'].map((s) => [s, `CRAWLSPACE.Crawler.${s[0].toUpperCase()}${s.slice(1)}`])),
      // Weapon Skill / Ammunition: free text, with the owner's skills and items offered as suggestions.
      skillSuggestions: actorItems.filter((i: any) => i.type === 'skill').map((i: any) => i.name),
      ammoSuggestions: actorItems.filter((i: any) => i.type === 'consumable' || (i.type === 'weapon' && i.system.weaponType === 'ammunition')).map((i: any) => i.name),
      tags: this.#tags(),
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

  /** Chips under the name, like PF2e's traits. */
  #tags() {
    const item = this.item
    const system = item.system
    const tags: string[] = []
    const add = (value: unknown) => {
      const text = String(value ?? '').trim()
      if (text) tags.push(text)
    }
    if (item.type === 'weapon') {
      add(game.i18n.localize(`CRAWLSPACE.WeaponType.${system.weaponType}`))
      if (system.twoHanded) add(game.i18n.localize('CRAWLSPACE.Item.TwoHanded'))
    }
    if (item.type === 'equipment') {
      add(GEAR_SLOTS[system.slot as keyof typeof GEAR_SLOTS])
      if (system.isShield) add(game.i18n.localize('CRAWLSPACE.Item.IsShield'))
    }
    if (item.type === 'consumable') add(system.consumableType)
    if (item.type === 'spell') add(game.i18n.localize(`CRAWLSPACE.Usage.${system.usage}`))
    if (item.type === 'skill' || item.type === 'spell') {
      add(system.checkType)
      if (system.isAttack) add(game.i18n.localize('CRAWLSPACE.Item.IsAttack'))
    }
    if (item.type === 'ability') add(game.i18n.localize(`CRAWLSPACE.Ability.${system.category}`))
    for (const type of system.damage?.types ?? []) add(type)
    if (system.damage?.magic) add(game.i18n.localize('CRAWLSPACE.Item.Magic'))
    if (system.damage?.armorPiercing) add(game.i18n.localize('CRAWLSPACE.Item.ArmorPiercing'))
    for (const tag of system.tags ?? []) add(tag)
    return [...new Set(tags)]
  }

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    if (context.tabs?.[partId]) context.tab = context.tabs[partId]
    const item = this.item
    switch (partId) {
      case 'tabs':
        context.tabList = Object.values(context.tabs ?? {})
        break
      case 'summary': {
        const system = item.system
        const rows: { label: string; value: unknown }[] = []
        const row = (label: string, value: unknown) => {
          if (value !== undefined && value !== null && value !== '') rows.push({ label: game.i18n.localize(label), value })
        }
        if (context.isRanked) {
          row('CRAWLSPACE.Item.Rank', system.rank.total)
          row('CRAWLSPACE.Item.Stat', system.stat)
          if (item.actor) row('CRAWLSPACE.Item.Check', Handlebars.helpers.crawlSigned(system.checkBonus))
          row('CRAWLSPACE.Item.Cooldown', system.cooldown)
          if (item.type === 'spell') {
            row('CRAWLSPACE.Stat.Mana', system.mana)
            row('CRAWLSPACE.Item.Range', system.range)
            row('CRAWLSPACE.Item.Duration', system.duration)
          }
        }
        if (system.damage?.formula || system.damage?.atRank) row(context.damageLegend, system.damage.atRank || system.damage.formula)
        if (context.isRanked) row('CRAWLSPACE.Item.Healing', system.healing?.atRank)
        if (item.type === 'consumable') {
          row('CRAWLSPACE.Item.Healing', system.healing?.formula)
          row('CRAWLSPACE.Item.ManaRestore', system.manaRestore)
        }
        if (item.type === 'equipment') row('CRAWLSPACE.Item.ArmorDr', system.armorDr)
        if (item.type === 'weapon') {
          row('CRAWLSPACE.Item.Skill', system.skill)
          row('CRAWLSPACE.Item.Ammunition', system.ammunition)
        }
        if (item.type === 'ability') row('CRAWLSPACE.Item.Cooldown', system.cooldown)
        if (item.type === 'lootBox') row('CRAWLSPACE.Item.Tier', system.tier)
        context.summaryRows = rows
        break
      }
      case 'description':
        context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description ?? '', {
          relativeTo: item,
          secrets: item.isOwner,
        })
        break
      case 'rules':
        context.ids = documentIds(item)
        context.ruleTypes = ruleTypeChoices()
        context.effects = item.effects.map((effect: any) => ({
          id: effect.id,
          name: effect.name,
          img: effect.img,
          disabled: effect.disabled,
          transfer: effect.transfer,
          requiredRank: effect.system?.requiredRank,
          rules: rulesContext(effect),
        }))
        break
    }
    return context
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    bindRulesEditor(this.element, (id) => this.item.effects.get(id), this.isEditable)
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
    await this.item.createEmbeddedDocuments('ActiveEffect', [{ name: this.item.name, img: this.item.img, transfer: true }])
  }
  static #effect(sheet: CrawlItemSheet, target: HTMLElement) {
    return sheet.item.effects.get(target.closest<HTMLElement>('[data-effect-id]')?.dataset.effectId)
  }
  static async #onEditEffect(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    return CrawlItemSheet.#effect(this, target)?.sheet.render(true)
  }
  static async #onDeleteEffect(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    return CrawlItemSheet.#effect(this, target)?.deleteDialog()
  }
  static async #onToggleEffect(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const effect = CrawlItemSheet.#effect(this, target)
    if (effect) await effect.update({ disabled: !effect.disabled })
  }
  static async #onToggleTransfer(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const effect = CrawlItemSheet.#effect(this, target)
    if (effect) await effect.update({ transfer: !effect.transfer })
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
  static async #onCopyId(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    game.clipboard.copyPlainText(target.dataset.value ?? '')
    ui.notifications.info(game.i18n.format('CRAWLSPACE.Ids.Copied', { value: target.dataset.value }))
  }

  static #onPrepareLoot(this: CrawlItemSheet) {
    return prepareLootBox(this.item)
  }

  static #onOpenBox(this: CrawlItemSheet) {
    return this.item.use()
  }
}
