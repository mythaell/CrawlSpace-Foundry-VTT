import { cooldownFor, cooldownLabel } from '../effects/cooldowns'
import { CHECK_TYPES, DAMAGE_TYPES, GEAR_SLOTS, STATS, STAT_KEYS } from '../config'
import { DEBUFFS } from '../rules/debuffs'
import { penaltyModifiers, rollAttack, rollCheck, rollDamage } from '../dice/rolls'
import { levelUp, openUpkeep } from '../apps/upkeep'
import { pendingStatPoints } from '../rules/upkeep'
import { attackRows, attackWithRow, damageWithRow, displayFormula, findAttackRow, resolveAttack, UNARMED_ID, unarmedRow } from '../actors/attacks'
import { castInherent, inherentSpellRows } from '../actors/inherent'
import { CrawlRowConfig, type RowKind } from '../apps/row-config'
import { fillActorDamage } from '../import/fill-damage'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets
const TextEditor = () => foundry.applications.ux.TextEditor.implementation

const STAT_CODES = STAT_KEYS.map((key) => STATS[key].code)

/** Inventory categories and their subtypes, as CrawlSpace's inventory filter groups them. */
const INVENTORY_CATEGORIES = [
  { id: 'weapon', types: ['weapon'], subtypes: ['melee', 'ranged'] },
  { id: 'equipment', types: ['equipment'], subtypes: Object.keys(GEAR_SLOTS) },
  { id: 'consumable', types: ['consumable'], subtypes: ['potion', 'scroll', 'ammunition', 'explosives', 'other'] },
  { id: 'tattoo', types: ['tattoo'], subtypes: [] },
  { id: 'other', types: ['loot', 'lootBox'], subtypes: [] },
]
const INVENTORY_TYPES = INVENTORY_CATEGORIES.flatMap((category) => category.types)

function inventorySubtype(item: any) {
  switch (item.type) {
    case 'weapon':
      return ['ranged', 'thrown', 'ammunition'].includes(item.system.weaponType) ? 'ranged' : 'melee'
    case 'equipment':
      return item.system.slot
    case 'consumable': {
      const kind = String(item.system.consumableType ?? '').toLowerCase()
      if (kind.includes('potion')) return 'potion'
      if (kind.includes('scroll')) return 'scroll'
      if (kind.includes('ammo') || kind.includes('ammunition')) return 'ammunition'
      if (kind.includes('explos') || kind.includes('bomb') || kind.includes('grenade')) return 'explosives'
      return 'other'
    }
    default:
      return ''
  }
}

const subtypeLabel = (category: string, subtype: string) =>
  category === 'equipment' ? GEAR_SLOTS[subtype as keyof typeof GEAR_SLOTS] : game.i18n.localize(`CRAWLSPACE.Filter.${subtype}`)

/** Shared behavior: item/effect rows, inline item edits, rolling stats, pinning, expanding and filtering rows. */
class CrawlActorSheet extends HandlebarsApplicationMixin(ActorSheetV2) {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'actor'],
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: {
      rollStat: CrawlActorSheet.#onRollStat,
      useItem: CrawlActorSheet.#onUseItem,
      editItem: CrawlActorSheet.#onEditItem,
      deleteItem: CrawlActorSheet.#onDeleteItem,
      createItem: CrawlActorSheet.#onCreateItem,
      toggleEquip: CrawlActorSheet.#onToggleEquip,
      adjustQuantity: CrawlActorSheet.#onAdjustQuantity,
      editEffect: CrawlActorSheet.#onEditEffect,
      toggleEffect: CrawlActorSheet.#onToggleEffect,
      deleteEffect: CrawlActorSheet.#onDeleteEffect,
      createEffect: CrawlActorSheet.#onCreateEffect,
      addDebuff: CrawlActorSheet.#onAddDebuff,
      stackEffect: CrawlActorSheet.#onStackEffect,
      itemToChat: CrawlActorSheet.#onItemToChat,
      togglePin: CrawlActorSheet.#onTogglePin,
      toggleExpand: CrawlActorSheet.#onToggleExpand,
      setFilter: CrawlActorSheet.#onSetFilter,
      openPack: CrawlActorSheet.#onOpenPack,
    },
  }

  get actor() {
    return this.document
  }

  /** Rows the user has opened (name click), kept across re-renders. */
  protected expanded = new Set<string>()
  /** Filter state per table: { search, stat, check, category, subtype }. */
  protected filters = new Map<string, Record<string, string>>()

  async _prepareContext(options: any) {
    const context = await super._prepareContext(options)
    const actor = this.actor
    const system = actor.system
    context.system = system
    context.systemSource = actor._source.system
    context.systemFields = actor.system.schema.fields
    context.stats = STAT_KEYS.map((key) => ({
      key,
      ...STATS[key],
      ...system.attributes[key],
      source: actor._source.system.attributes[key],
    }))
    context.statChoices = Object.fromEntries(STAT_CODES.map((code) => [code, code]))
    context.checkChoices = Object.fromEntries(CHECK_TYPES.map((type) => [type, type]))
    context.damageTypes = DAMAGE_TYPES
    context.debuffChoices = DEBUFFS.map((debuff) => ({ id: debuff.id, name: debuff.name }))
    context.effects = this.#prepareEffects()
    context.isGM = game.user.isGM
    return context
  }

  #prepareEffects() {
    const rows = (effect: any, owner: any = null) => ({
      id: effect.id,
      uuid: effect.uuid,
      name: effect.name,
      img: effect.img,
      disabled: effect.disabled,
      suppressed: effect.isSuppressed,
      stacks: effect.system?.stacks ?? 1,
      stackable: effect.statuses.size ? DEBUFFS.find((debuff) => effect.statuses.has(debuff.id))?.stackable : !!effect.system?.maxStacks,
      kind: effect.system?.conditionType || (effect.statuses.size ? 'debuff' : ''),
      duration: effect.duration?.label ?? effect.system?.durationText ?? '',
      source: owner?.name ?? '',
      itemId: owner?.id ?? '',
      changes: (effect.system?.changes ?? []).length,
    })
    const actorEffects = this.actor.effects.map((effect: any) => rows(effect))
    const itemEffects = [...this.actor.items].flatMap((item: any) => item.effects.filter((e: any) => e.transfer).map((effect: any) => rows(effect, item)))
    return {
      conditions: actorEffects.filter((e: any) => e.kind === 'debuff'),
      buffs: actorEffects.filter((e: any) => e.kind !== 'debuff'),
      fromItems: itemEffects,
    }
  }

  /** Read-only facts shown when a row is expanded. */
  protected detailTags(item: any) {
    const system = item.system
    const tags: string[] = []
    const add = (label: string, value: unknown) => {
      if (value !== undefined && value !== null && String(value).trim() !== '') tags.push(`${game.i18n.localize(label)}: ${value}`)
    }
    if (item.type === 'skill' || item.type === 'spell') {
      add('CRAWLSPACE.Item.CheckType', system.checkType)
      add('CRAWLSPACE.Item.Cooldown', system.cooldown)
      if (item.type === 'spell') {
        add('CRAWLSPACE.Stat.Mana', system.mana)
        add('CRAWLSPACE.Item.Range', system.range)
        add('CRAWLSPACE.Item.Duration', system.duration)
      }
    }
    const damage = system.damage?.atRank || system.damage?.formula
    if (damage) add(item.type === 'weapon' ? 'CRAWLSPACE.Item.DamageBonus' : 'CRAWLSPACE.Item.Damage', `${damage} ${(system.damage.types ?? []).join(', ')}`)
    add('CRAWLSPACE.Item.Healing', system.healing?.atRank || system.healing?.formula || '')
    if (item.type === 'consumable') add('CRAWLSPACE.Item.ManaRestore', system.manaRestore)
    if (item.type === 'equipment') add('CRAWLSPACE.Item.ArmorDr', system.armorDr || '')
    if (item.type === 'weapon') {
      add('CRAWLSPACE.Item.Skill', system.skill)
      add('CRAWLSPACE.Item.Ammunition', system.ammunition)
    }
    return tags
  }

  protected async itemRow(item: any) {
    const pinned = (this.actor.system.hotlist?.items ?? []).includes(item.id)
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      system: item.system,
      pinned,
      canPin: !!this.actor.system.hotlist,
      equippable: ['weapon', 'equipment', 'tattoo'].includes(item.type),
      hasQuantity: item.system.quantity !== undefined,
      expanded: this.expanded.has(item.id),
      tags: this.detailTags(item),
      upgrades: ['rank5', 'rank10', 'rank15']
        .filter((key) => item.system.upgrades?.[key])
        .map((key) => ({ label: game.i18n.localize(`CRAWLSPACE.Item.Upgrade${key.slice(4)}`), text: item.system.upgrades[key] })),
      details: await this.enrich(item.system.description ?? ''),
    }
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    // Inline edits on embedded items (rank, quantity, stat...).
    for (const input of this.element.querySelectorAll('[data-item-field]')) {
      input.addEventListener('change', async (event: Event) => {
        event.stopPropagation()
        const target = event.currentTarget as HTMLInputElement
        const item = this.actor.items.get(target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)
        if (!item) return
        const value = target.type === 'checkbox' ? target.checked : target.type === 'number' ? (target.value === '' ? null : Number(target.value)) : target.value
        await item.update({ [target.dataset.itemField as string]: value })
      })
    }
    // Search boxes filter as you type.
    for (const input of (this.element as HTMLElement).querySelectorAll<HTMLInputElement>('[data-filter-search]')) {
      const table = input.closest<HTMLElement>('[data-filter-table]')?.dataset.filterTable as string
      input.value = this.filters.get(table)?.search ?? ''
      input.addEventListener('input', () => {
        this.#filter(table).search = input.value
        this.applyFilters(table)
      })
      input.addEventListener('change', (event) => event.stopPropagation())
    }
    for (const bar of (this.element as HTMLElement).querySelectorAll<HTMLElement>('[data-filter-table]')) this.applyFilters(bar.dataset.filterTable as string)
  }

  #filter(table: string) {
    if (!this.filters.has(table)) this.filters.set(table, {})
    return this.filters.get(table) as Record<string, string>
  }

  /** Show only the rows of a table that match its filters; done in the DOM so typing never re-renders. */
  protected applyFilters(table: string) {
    const filter = this.filters.get(table) ?? {}
    const bar = (this.element as HTMLElement).querySelector<HTMLElement>(`[data-filter-table="${table}"]`)
    for (const button of bar?.querySelectorAll<HTMLElement>('[data-filter-key]') ?? []) {
      button.classList.toggle('active', (filter[button.dataset.filterKey as string] ?? '') === (button.dataset.filterValue ?? ''))
    }
    for (const group of bar?.querySelectorAll<HTMLElement>('[data-subtype-group]') ?? []) group.hidden = group.dataset.subtypeGroup !== filter.category
    const search = (filter.search ?? '').trim().toLowerCase()
    for (const row of (this.element as HTMLElement).querySelectorAll<HTMLElement>(`[data-filter-scope="${table}"] [data-filter-row]`)) {
      const data = row.dataset
      const visible =
        (!search || (data.fName ?? '').includes(search)) &&
        (!filter.stat || data.fStat === filter.stat) &&
        (!filter.check || data.fCheck === filter.check) &&
        (!filter.category || data.fCategory === filter.category) &&
        (!filter.subtype || data.fSubtype === filter.subtype)
      row.hidden = !visible
    }
    for (const section of (this.element as HTMLElement).querySelectorAll<HTMLElement>(`[data-filter-scope="${table}"] [data-filter-section]`)) {
      const filtered = !!(search || filter.category || filter.subtype || filter.stat || filter.check)
      section.hidden = filtered && !section.querySelector('[data-filter-row]:not([hidden])')
    }
  }

  static async #onSetFilter(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const table = target.closest<HTMLElement>('[data-filter-table]')?.dataset.filterTable as string
    const key = target.dataset.filterKey as string
    const value = target.dataset.filterValue ?? ''
    const filter = this.#filter(table)
    filter[key] = filter[key] === value ? '' : value
    if (key === 'category') filter.subtype = ''
    this.applyFilters(table)
  }

  static async #onToggleExpand(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const row = target.closest<HTMLElement>('[data-expand-key]')
    const key = row?.dataset.expandKey
    if (!row || !key) return
    if (this.expanded.has(key)) this.expanded.delete(key)
    else this.expanded.add(key)
    row.classList.toggle('expanded', this.expanded.has(key))
  }

  /** Open the first compendium in the list that exists (CrawlSpace's "Add from Database"). */
  static async #onOpenPack(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const ids = (target.dataset.packs ?? '').split(',').map((id) => id.trim())
    const pack = ids.map((id) => game.packs.get(id)).find(Boolean)
    if (!pack) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NoPack'))
    return pack.render(true)
  }

  static async #onTogglePin(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.itemFrom(target)
    if (item) await this.pin(item)
  }

  /** Pin an item to the hotlist, or unpin it. */
  protected async pin(item: any, force?: boolean) {
    const hotlist = this.actor.system.hotlist
    if (!hotlist) return
    const ids: string[] = [...hotlist.items]
    const pinned = ids.includes(item.id)
    if (pinned && force !== true) return this.actor.update({ 'system.hotlist.items': ids.filter((id) => id !== item.id) })
    if (pinned) return
    if (ids.length >= hotlist.capacity) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.HotlistFull', { capacity: hotlist.capacity }))
    return this.actor.update({ 'system.hotlist.items': [...ids, item.id] })
  }

  static async #onRollStat(this: CrawlActorSheet, event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.stat as keyof typeof STATS
    const actor = this.actor
    if (key === ('evade' as any)) {
      return rollCheck(actor, {
        label: game.i18n.localize('CRAWLSPACE.Stat.Evade'),
        kind: 'evade',
        modifiers: [{ label: game.i18n.localize('CRAWLSPACE.Stat.Evade'), value: Number(actor.system.evade.total) || 0 }, ...penaltyModifiers(actor)],
        fast: event.shiftKey,
      })
    }
    return rollCheck(actor, {
      label: game.i18n.format('CRAWLSPACE.Roll.StatCheck', { stat: STATS[key].label }),
      kind: 'check',
      modifiers: [{ label: STATS[key].label, value: actor.system.attributes[key].mod }, ...penaltyModifiers(actor)],
      sources: [STATS[key].code, STATS[key].label],
      fast: event.shiftKey,
    })
  }

  protected itemFrom(target: HTMLElement) {
    return this.actor.items.get(target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId)
  }

  protected effectFrom(target: HTMLElement) {
    const row = target.closest<HTMLElement>('[data-effect-id]')
    if (!row) return null
    const item = row.dataset.itemId ? this.actor.items.get(row.dataset.itemId) : null
    return (item ?? this.actor).effects.get(row.dataset.effectId)
  }

  static async #onUseItem(this: CrawlActorSheet, event: PointerEvent, target: HTMLElement) {
    return this.itemFrom(target)?.use({ fast: event.shiftKey })
  }
  static async #onItemToChat(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    return this.itemFrom(target)?.toMessage()
  }
  static async #onEditItem(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    return this.itemFrom(target)?.sheet.render(true)
  }
  static async #onDeleteItem(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    return this.itemFrom(target)?.deleteDialog()
  }
  static async #onCreateItem(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const type = target.dataset.type ?? 'loot'
    const data: any = { name: game.i18n.format('DOCUMENT.New', { type: game.i18n.localize(`TYPES.Item.${type}`) }), type }
    if (target.dataset.slot) data.system = { slot: target.dataset.slot }
    if (target.dataset.category) data.system = { category: target.dataset.category }
    const [item] = await this.actor.createEmbeddedDocuments('Item', [data])
    item?.sheet.render(true)
  }
  static async #onToggleEquip(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.itemFrom(target)
    if (item) await item.update({ 'system.equipped': !item.system.equipped })
  }
  static async #onAdjustQuantity(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const item = this.itemFrom(target)
    if (!item) return
    const next = Math.max(0, (Number(item.system.quantity) || 0) + Number(target.dataset.delta ?? 1))
    await item.update({ 'system.quantity': next })
  }
  static async #onEditEffect(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    return this.effectFrom(target)?.sheet.render(true)
  }
  static async #onToggleEffect(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const effect = this.effectFrom(target)
    if (effect) await effect.update({ disabled: !effect.disabled })
  }
  static async #onDeleteEffect(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    return this.effectFrom(target)?.delete()
  }
  static async #onStackEffect(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const effect = this.effectFrom(target)
    if (!effect) return
    const next = (Number(effect.system.stacks) || 1) + Number(target.dataset.delta ?? 1)
    if (next < 1) return effect.delete()
    return effect.update({ 'system.stacks': next })
  }
  static async #onCreateEffect(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const kind = target.dataset.kind ?? 'buff'
    const [effect] = await this.actor.createEmbeddedDocuments('ActiveEffect', [
      { name: game.i18n.localize(kind === 'debuff' ? 'CRAWLSPACE.Effect.NewDebuff' : 'CRAWLSPACE.Effect.NewBuff'), img: 'icons/svg/aura.svg', system: { conditionType: kind } },
    ])
    effect?.sheet.render(true)
  }
  static async #onAddDebuff(this: CrawlActorSheet, _event: PointerEvent, target: HTMLElement) {
    const select = this.element.querySelector('[data-debuff-select]') as HTMLSelectElement | null
    if (select?.value) await this.actor.addDebuff(select.value)
  }

  /** Enrich an HTML field for display. */
  protected enrich(htmlText: string) {
    return TextEditor().enrichHTML(htmlText ?? '', { relativeTo: this.actor, secrets: this.actor.isOwner, rollData: this.actor.getRollData() })
  }

  /** Open the popup editor for one row of an array field. */
  protected openRow(kind: RowKind, index: number) {
    return CrawlRowConfig.open(this.actor, kind, index)
  }

  /** Append a row to an array field and open it for editing. */
  protected async addRow(kind: RowKind, path: string, row: Record<string, unknown>) {
    const rows = [...(foundry.utils.getProperty(this.actor._source, path) ?? []), { id: foundry.utils.randomID(), ...row }]
    await this.actor.update({ [path]: rows })
    return this.openRow(kind, rows.length - 1)
  }

  protected async deleteRow(path: string, index: number) {
    const rows = [...(foundry.utils.getProperty(this.actor._source, path) ?? [])]
    rows.splice(index, 1)
    await this.actor.update({ [path]: rows })
  }
}

/** Tab icons from CrawlSpace's sheet (AlternateCharacterSheet.tsx), drawn inside a 24×24 stroke SVG. */
const TAB_ICONS: Record<string, string> = {
  character: '<circle cx="12" cy="7" r="3"/><path d="M5 21v-3a7 7 0 0 1 14 0v3"/>',
  actions: '<path d="m4 20 13-13 3-4-4 3L3 19m9-9 3 3M5 15l4 4"/>',
  inventory: '<path d="M5 8h14v13H5zM8 8V5h8v3M5 13h14M10 12v3h4v-3"/>',
  skills: '<path d="m4 20 13-13M15 4l1-3m4 8 3-1M5 5l1-3m3 8 3-1M16 16l1-3"/><path d="m5 15 4 4"/>',
  spells: '<path d="m12 2 2.5 7.5L22 12l-7.5 2.5L12 22l-2.5-7.5L2 12l7.5-2.5Z"/>',
  abilities: '<path d="m12 2 7 4v6c0 5-7 10-7 10S5 17 5 12V6zM8 12l3 3 5-6"/>',
  effects: '<path d="M9 2h6M10 2v7L4 19q-1 3 3 3h10q4 0 3-3L14 9V2M7 15h10"/>',
  biography: '<path d="M12 6C8 3 3 4 3 4v16s5-1 9 2c4-3 9-2 9-2V4s-5-1-9 2Zm0 0v16"/>',
}

const TRAIT_SECTIONS = ['immunities', 'vulnerabilities', 'resistances'] as const

const SKILL_PACKS = 'crawlspace-content.skills,crawlspace.homebrew-skills'
const SPELL_PACKS = 'crawlspace-content.spells,crawlspace.homebrew-spells'
const ITEM_PACKS = 'crawlspace-content.items,crawlspace.homebrew-items'

export class CrawlerSheet extends CrawlActorSheet {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawler'],
    position: { width: 1120, height: 720 },
    window: {
      controls: [{ icon: 'fa-solid fa-burst', label: 'CRAWLSPACE.Sheet.FillDamage', action: 'fillDamage', ownership: 'OWNER' }],
    },
    actions: {
      fillDamage: CrawlerSheet.#onFillDamage,
      slot: CrawlerSheet.#onHealthSlot,
      shield: CrawlerSheet.#onShieldSlot,
      shieldPrompt: CrawlerSheet.#onShieldPrompt,
      shieldDr: CrawlerSheet.#onShieldDr,
      upkeep: CrawlerSheet.#onUpkeep,
      levelUp: CrawlerSheet.#onLevelUp,
      openEffects: CrawlerSheet.#onOpenEffects,
      editTraits: CrawlerSheet.#onEditTraits,
      addClub: CrawlerSheet.#onAddClub,
      removeClub: CrawlerSheet.#onRemoveClub,
      attackRoll: CrawlerSheet.#onAttackRoll,
      attackDamage: CrawlerSheet.#onAttackDamage,
      addAttack: CrawlerSheet.#onAddAttack,
      editAttack: CrawlerSheet.#onEditAttack,
      deleteAttack: CrawlerSheet.#onDeleteAttack,
      attackToChat: CrawlerSheet.#onAttackToChat,
      addAction: CrawlerSheet.#onAddAction,
      editAction: CrawlerSheet.#onEditAction,
      deleteAction: CrawlerSheet.#onDeleteAction,
      useAction: CrawlerSheet.#onUseAction,
      actionToChat: CrawlerSheet.#onActionToChat,
      castInherent: CrawlerSheet.#onCastInherent,
    },
  }

  static PARTS = {
    sidebar: { template: 'systems/crawlspace/templates/actor/crawler-sidebar.hbs', scrollable: [''] },
    header: { template: 'systems/crawlspace/templates/actor/crawler-header.hbs' },
    tabs: { template: 'systems/crawlspace/templates/actor/crawler-tabs.hbs' },
    character: { template: 'systems/crawlspace/templates/actor/crawler-character.hbs', scrollable: [''] },
    actions: { template: 'systems/crawlspace/templates/actor/crawler-actions.hbs', scrollable: [''] },
    inventory: { template: 'systems/crawlspace/templates/actor/crawler-inventory.hbs', scrollable: [''] },
    skills: { template: 'systems/crawlspace/templates/actor/crawler-skills.hbs', scrollable: [''] },
    spells: { template: 'systems/crawlspace/templates/actor/crawler-spells.hbs', scrollable: [''] },
    abilities: { template: 'systems/crawlspace/templates/actor/crawler-abilities.hbs', scrollable: [''] },
    effects: { template: 'systems/crawlspace/templates/actor/effects.hbs', scrollable: [''] },
    biography: { template: 'systems/crawlspace/templates/actor/crawler-biography.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: ['character', 'actions', 'inventory', 'skills', 'spells', 'abilities', 'effects', 'biography'].map((id) => ({ id })),
      initial: 'character',
      labelPrefix: 'CRAWLSPACE.Tab',
    },
  }

  /** The Calculations drawer stays open across re-renders. */
  #calculationsOpen = false

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    if (context.tabs?.[partId]) context.tab = context.tabs[partId]
    const actor = this.actor
    const system = actor.system
    const items = [...actor.items].sort((a: any, b: any) => (a.sort || 0) - (b.sort || 0))
    switch (partId) {
      case 'sidebar': {
        const evadeBuffs = system.evade.buff + (system.evade.bonus ?? 0)
        const drBuffs = system.dr.buff + (system.dr.bonus ?? 0)
        context.evadeTooltip = `DEX MOD (${system.attributes.dex.mod}) + ${game.i18n.localize('CRAWLSPACE.Stat.EvadeBuffs')} (${evadeBuffs}) = ${system.evade.total}`
        context.drTooltip = `${game.i18n.localize('CRAWLSPACE.Stat.ArmorBase')} (${system.dr.armorTotal}) + ${game.i18n.localize('CRAWLSPACE.Stat.ShieldDr')} (${system.shieldDr.value}) + ${game.i18n.localize('CRAWLSPACE.Stat.DrBuffs')} (${drBuffs}) = ${system.dr.total}`
        context.hasShield = system.shieldDr.max > 0
        context.traitSections = TRAIT_SECTIONS.map((key) => ({
          key,
          label: game.i18n.localize(`CRAWLSPACE.Sheet.${key}`),
          values: [...(system.traits[key] ?? [])].sort(),
        }))
        break
      }
      case 'header':
        // Left to right: 10% … 100%, like CrawlSpace's health bar.
        context.healthBoxes = [...system.health.slots].reverse()
        context.shieldBoxes = system.shield.slots.map((on: boolean, index: number) => ({ on, index })).filter((slot: any) => slot.on)
        context.pendingStatPoints = pendingStatPoints(system.details.level, system.upkeep.allocatedThroughLevel)
        break
      case 'tabs': {
        for (const tab of Object.values(context.tabs ?? {}) as any[]) tab.svg = TAB_ICONS[tab.id] ?? ''
        const active = Object.values(context.tabs ?? {}).find((tab: any) => tab.active) as any
        context.activeTabLabel = active ? game.i18n.localize(active.label) : ''
        break
      }
      case 'character':
        context.clubs = system.clubs.map((value: string, index: number) => ({ value, index }))
        context.sponsors = Array.from({ length: Math.max(3, system.details.sponsors.length) }, (_, index) => ({
          index,
          number: index + 1,
          value: system.details.sponsors[index] ?? '',
        }))
        context.calculationsOpen = this.#calculationsOpen
        break
      case 'actions':
        context.hotlist = await Promise.all(
          system.hotlist.items
            .map((id: string) => actor.items.get(id))
            .filter(Boolean)
            .map((i: any) => this.itemRow(i)),
        )
        context.cooldowns = actor.effects.filter((effect: any) => {
          const key = effect.getFlag('crawlspace', 'cooldownKey')
          return key && cooldownFor(actor, key) === effect
        }).map((effect: any) => ({ id: effect.id, name: effect.name, remaining: cooldownLabel(effect) }))
        context.attacks = await this.#attackContext()
        context.actionGroups = await this.#actionContext()
        break
      case 'skills':
        context.filterStats = STAT_CODES
        context.filterChecks = CHECK_TYPES
        context.skills = await Promise.all(items.filter((i: any) => i.type === 'skill').map((i: any) => this.itemRow(i)))
        context.packs = SKILL_PACKS
        break
      case 'spells':
        context.filterStats = STAT_CODES
        context.filterChecks = CHECK_TYPES
        context.spells = await Promise.all(items.filter((i: any) => i.type === 'spell' && i.system.usage !== 'inherent').map((i: any) => this.itemRow(i)))
        context.inherent = await this.#inherentContext()
        context.packs = SPELL_PACKS
        break
      case 'inventory': {
        const filter = this.filters.get('inventory') ?? {}
        context.categories = INVENTORY_CATEGORIES.map((category) => ({
          id: category.id,
          label: game.i18n.localize(`CRAWLSPACE.Filter.${category.id}`),
          subtypes: category.subtypes.map((subtype) => ({ id: subtype, label: subtypeLabel(category.id, subtype) })),
        }))
        context.inventorySections = await Promise.all(
          INVENTORY_CATEGORIES.map(async (category) => ({
            ...category,
            label: game.i18n.localize(`CRAWLSPACE.Filter.${category.id}`),
            createType: category.types[0],
            items: await Promise.all(
              items
                .filter((i: any) => category.types.includes(i.type))
                .map(async (i: any) => ({ ...(await this.itemRow(i)), category: category.id, subtype: inventorySubtype(i) })),
            ),
          })),
        )
        context.inventoryCount = items.filter((i: any) => INVENTORY_TYPES.includes(i.type)).length
        context.filterCategory = filter.category ?? ''
        context.gold = system.details.gold
        context.packs = ITEM_PACKS
        break
      }
      case 'abilities': {
        const rows = await Promise.all(items.filter((i: any) => ['race', 'class', 'background', 'ability', 'achievement'].includes(i.type)).map((i: any) => this.itemRow(i)))
        context.identity = rows.filter((row: any) => ['race', 'class', 'background'].includes(row.type))
        context.abilityGroups = ['racial', 'class', 'other'].map((category) => ({
          category,
          label: game.i18n.localize(`CRAWLSPACE.Ability.${category}`),
          items: rows.filter((row: any) => row.type === 'ability' && row.system.category === category),
        }))
        context.achievements = rows.filter((row: any) => row.type === 'achievement')
        break
      }
      case 'biography':
        context.enriched = {
          biography: await this.enrich(system.biography),
          notes: await this.enrich(system.notes),
          pastTrauma: await this.enrich(system.journal.pastTrauma),
          looseEnds: await this.enrich(system.journal.looseEnds),
          regrets: await this.enrich(system.journal.regrets),
        }
        break
    }
    return context
  }

  async #attackContext() {
    const actor = this.actor
    const saved: any[] = actor.system.attacks ?? []
    return Promise.all(
      attackRows(actor).map(async (row) => {
        const attack = resolveAttack(actor, row)
        const index = saved.findIndex((entry) => entry.id === row.id)
        const key = `attack:${row.id}`
        return {
          id: row.id,
          name: row.name,
          img: attack.img,
          saved: index >= 0,
          toHit: Handlebars.helpers.crawlSigned(attack.toHit),
          modifiers: attack.modifiers.map((modifier) => `${modifier.label} ${Handlebars.helpers.crawlSigned(modifier.value)}`).join('<br>'),
          damage: displayFormula(actor, attack.damage.formula),
          types: attack.damage.types.join(', '),
          tags: [...attack.damage.types, ...(attack.ranged ? [game.i18n.localize('CRAWLSPACE.Item.Ranged')] : []), ...(attack.damage.magic ? [game.i18n.localize('CRAWLSPACE.Item.Magic')] : []), ...(attack.damage.armorPiercing ? [game.i18n.localize('CRAWLSPACE.Item.ArmorPiercing')] : [])],
          expanded: this.expanded.has(key),
          expandKey: key,
          notes: await this.enrich(row.notes ?? ''),
        }
      }),
    )
  }

  async #actionContext() {
    const actor = this.actor
    const rows = await Promise.all(
      (actor.system.sheetActions ?? []).map(async (action: any, index: number) => {
        const source = action.sourceId ? actor.items.get(action.sourceId) : null
        const key = `action:${action.id}`
        return {
          ...action,
          index,
          img: action.img || source?.img || 'icons/svg/clockwork.svg',
          sourceName: source?.name ?? '',
          expanded: this.expanded.has(key),
          expandKey: key,
          notesHtml: await this.enrich(action.notes || source?.system?.description || ''),
        }
      }),
    )
    return ['action', 'interrupt'].map((kind) => ({
      kind,
      label: game.i18n.localize(`CRAWLSPACE.Actions.${kind}Plural`),
      rows: rows.filter((row: any) => (row.kind || 'action') === kind),
    }))
  }

  async #inherentContext() {
    const rows = await inherentSpellRows(this.actor)
    return Promise.all(
      rows.map(async (row) => {
        const key = `inherent:${row.key}`
        const item = row.itemId ? this.actor.items.get(row.itemId) : null
        return {
          ...row,
          expanded: this.expanded.has(key),
          expandKey: key,
          details: item ? await this.enrich(item.system.description ?? '') : '',
          sourceLabel: row.source ? game.i18n.format('CRAWLSPACE.Spell.GrantedBy', { source: row.source }) : '',
        }
      }),
    )
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    this.element.querySelector('details.char-calculations')?.addEventListener('toggle', (event: Event) => {
      this.#calculationsOpen = (event.currentTarget as HTMLDetailsElement).open
    })
  }

  /** Keep the nav title in step with the selected tab without a re-render. */
  changeTab(tab: string, group: string, options?: any) {
    super.changeTab(tab, group, options)
    const title = this.element?.querySelector('.crawl-tab-title')
    const button = this.element?.querySelector(`.crawl-tab-icons [data-tab="${tab}"]`) as HTMLElement | null
    if (title && button?.dataset.label) title.textContent = button.dataset.label
  }

  /** Clubs and sponsors post as `system.clubs.0`…; turn them back into arrays. */
  _processFormData(event: any, form: any, formData: any) {
    const data = super._processFormData(event, form, formData)
    for (const path of ['system.clubs', 'system.details.sponsors']) {
      const value = foundry.utils.getProperty(data, path)
      if (!value || typeof value !== 'object' || Array.isArray(value)) continue
      const current = [...(foundry.utils.getProperty(this.actor._source, path) ?? [])]
      for (const [index, entry] of Object.entries(value)) current[Number(index)] = entry
      foundry.utils.setProperty(data, path, current)
    }
    return data
  }

  // ---- Attacks ----

  #attackFrom(target: HTMLElement) {
    const id = target.closest<HTMLElement>('[data-attack-id]')?.dataset.attackId
    return id ? findAttackRow(this.actor, id) : null
  }

  static async #onAttackRoll(this: CrawlerSheet, event: PointerEvent, target: HTMLElement) {
    const row = this.#attackFrom(target)
    if (row) return attackWithRow(this.actor, row, { fast: event.shiftKey })
  }

  static async #onAttackDamage(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const row = this.#attackFrom(target)
    if (row) return damageWithRow(this.actor, row, (target.dataset.tier as any) ?? 'normal')
  }

  static async #onAddAttack(this: CrawlerSheet) {
    return this.addRow('attack', 'system.attacks', { name: game.i18n.localize('CRAWLSPACE.Attack.New') })
  }

  /** Automatic rows (equipped weapons, attack skills, Unarmed) become saved rows the first time they are edited. */
  static async #onEditAttack(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const row = this.#attackFrom(target)
    if (!row) return
    const saved = this.actor._source.system.attacks ?? []
    const index = saved.findIndex((entry: any) => entry.id === row.id)
    if (index >= 0) return this.openRow('attack', index)
    const materialised = row.id === UNARMED_ID ? { ...unarmedRow(), id: UNARMED_ID } : { ...row, id: foundry.utils.randomID() }
    await this.actor.update({ 'system.attacks': [...saved, materialised] })
    return this.openRow('attack', saved.length)
  }

  static async #onDeleteAttack(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const row = this.#attackFrom(target)
    const index = (this.actor._source.system.attacks ?? []).findIndex((entry: any) => entry.id === row?.id)
    if (index >= 0) return this.deleteRow('system.attacks', index)
  }

  static async #onAttackToChat(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const row = this.#attackFrom(target)
    if (!row) return
    const source = row.sourceId ? this.actor.items.get(row.sourceId) : null
    if (source && !row.notes) return source.toMessage()
    const attack = resolveAttack(this.actor, row)
    const content = `<h3>${foundry.utils.escapeHTML(row.name)}</h3><p>${game.i18n.localize('CRAWLSPACE.Attack.ToHit')} ${Handlebars.helpers.crawlSigned(attack.toHit)} · ${displayFormula(this.actor, attack.damage.formula)} ${attack.damage.types.join(', ')}</p>${row.notes ?? ''}`
    return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }), content })
  }

  // ---- Actions and interrupt actions ----

  #actionIndex(target: HTMLElement) {
    return Number(target.closest<HTMLElement>('[data-action-index]')?.dataset.actionIndex)
  }

  static async #onAddAction(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const kind = target.dataset.kind ?? 'action'
    return this.addRow('action', 'system.sheetActions', { kind, name: game.i18n.localize(`CRAWLSPACE.Actions.new${kind === 'interrupt' ? 'Interrupt' : 'Action'}`) })
  }

  static async #onEditAction(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    return this.openRow('action', this.#actionIndex(target))
  }

  static async #onDeleteAction(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    return this.deleteRow('system.sheetActions', this.#actionIndex(target))
  }

  /** Use an action: its item, else a check with its skill, else roll its formula, else post it. */
  static async #onUseAction(this: CrawlerSheet, event: PointerEvent, target: HTMLElement) {
    const action = this.actor.system.sheetActions?.[this.#actionIndex(target)]
    if (!action) return
    const source = action.sourceId ? this.actor.items.get(action.sourceId) : null
    if (source) return source.use({ fast: event.shiftKey })
    const skill = action.skillId ? this.actor.items.get(action.skillId) : null
    if (skill) {
      return rollCheck(this.actor, { label: `${action.name} (${skill.name})`, kind: 'check', modifiers: skill.checkModifiers(), sources: [skill.name], fast: event.shiftKey })
    }
    if (action.formula) {
      const roll = await Roll.create(action.formula, this.actor.getRollData()).evaluate()
      return roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }), flavor: action.name })
    }
    return CrawlerSheet.#postAction(this.actor, action)
  }

  static async #onActionToChat(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const action = this.actor.system.sheetActions?.[this.#actionIndex(target)]
    if (action) return CrawlerSheet.#postAction(this.actor, action)
  }

  static #postAction(actor: any, action: any) {
    const kind = game.i18n.localize(`CRAWLSPACE.Actions.${action.kind || 'action'}`)
    const content = `<h3>${foundry.utils.escapeHTML(action.name)} <small>(${kind})</small></h3>${action.notes ?? ''}`
    return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content })
  }

  // ---- Inherent spells ----

  static async #onCastInherent(this: CrawlerSheet, event: PointerEvent, target: HTMLElement) {
    const row = target.closest<HTMLElement>('[data-inherent-name]')
    if (!row) return
    return castInherent(this.actor, row.dataset.inherentName as string, Number(row.dataset.inherentRank) || 1, {
      fast: event.shiftKey,
      key: row.dataset.inherentKey,
      toChat: target.dataset.chat === 'true',
    })
  }

  // ---- Sidebar ----

  static async #onShieldDr(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const { max, lost } = this.actor.system.shieldDr
    if (!max) return
    // + restores one point (less lost), − spends one.
    const next = Math.clamp(lost - Number(target.dataset.delta ?? 0), 0, max)
    await this.actor.update({ 'system.shieldDr.lost': next })
  }

  /** Fill skill and spell damage the CrawlSpace backup left out, from the compendium entries with the same name. */
  static async #onFillDamage(this: CrawlerSheet) {
    const count = await fillActorDamage(this.actor)
    ui.notifications.info(game.i18n.format('CRAWLSPACE.Sheet.FillDamageDone', { count }))
  }

  static async #onLevelUp(this: CrawlerSheet) {
    return levelUp(this.actor)
  }

  static async #onOpenEffects(this: CrawlerSheet) {
    this.changeTab('effects', 'primary')
  }

  static async #onAddClub(this: CrawlerSheet) {
    await this.actor.update({ 'system.clubs': [...this.actor._source.system.clubs, ''] })
  }

  static async #onRemoveClub(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const clubs = [...this.actor._source.system.clubs]
    clubs.splice(Number(target.dataset.index), 1)
    await this.actor.update({ 'system.clubs': clubs })
  }

  /** CrawlSpace's Shield popup: set how many shield slots the crawler has (each worth CON mod). */
  static async #onShieldPrompt(this: CrawlerSheet) {
    const current = this.actor.system.shield.slots.filter(Boolean).length
    const label = game.i18n.format('CRAWLSPACE.Sheet.ShieldSlots', { value: this.actor.system.shield.value })
    const count = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize('CRAWLSPACE.Section.Shield') },
      content: `<label class="crawl-dialog-field"><span>${label}</span><input type="number" name="slots" min="0" max="20" value="${current}" autofocus></label>`,
      ok: {
        label: game.i18n.localize('CRAWLSPACE.Sheet.Apply'),
        callback: (_event: Event, button: any) => Number(button.form.elements.slots.value) || 0,
      },
      rejectClose: false,
    })
    if (count === null || count === undefined) return
    await this.actor.update({ 'system.shield.slots': Array.from({ length: Math.clamp(count, 0, 20) }, () => true) })
  }

  /** Edit Immunities / Vulnerabilities / Resistances as damage-type checkboxes. */
  static async #onEditTraits(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.trait as (typeof TRAIT_SECTIONS)[number]
    const selected = new Set<string>(this.actor._source.system.traits[key] ?? [])
    const boxes = ['All', ...DAMAGE_TYPES]
      .map((type) => `<label class="check"><input type="checkbox" name="types" value="${type}" ${selected.has(type) ? 'checked' : ''}> ${type}</label>`)
      .join('')
    const result = await foundry.applications.api.DialogV2.prompt({
      window: { title: game.i18n.localize(`CRAWLSPACE.Sheet.${key}`) },
      content: `<div class="crawl-trait-grid">${boxes}</div>`,
      ok: {
        label: game.i18n.localize('CRAWLSPACE.Sheet.Apply'),
        callback: (_event: Event, button: any) =>
          [...button.form.querySelectorAll('input[name="types"]:checked')].map((input: any) => input.value),
      },
      rejectClose: false,
    })
    if (!result) return
    await this.actor.update({ [`system.traits.${key}`]: result })
  }

  /** Clicking a health slot sets health to that slot (CrawlSpace's slot click); clicking the top filled slot empties it. */
  static async #onHealthSlot(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const percentage = Number(target.dataset.percentage)
    const current = this.actor.system.health.value
    const next = current > percentage && current <= percentage + 10 ? percentage : percentage + 10
    await this.actor.update({ 'system.health.value': next })
  }

  static async #onShieldSlot(this: CrawlerSheet, _event: PointerEvent, target: HTMLElement) {
    const slots = [...this.actor.system.shield.slots]
    const index = Number(target.dataset.index)
    if (target.dataset.mode === 'add') slots.push(true)
    else if (target.dataset.mode === 'clear') slots.length = 0
    else slots[index] = !slots[index]
    await this.actor.update({ 'system.shield.slots': slots })
  }

  static async #onUpkeep(this: CrawlerSheet) {
    return openUpkeep(this.actor)
  }

  /**
   * Drops: onto the hotlist (or the Actions tab icon) pins the item; onto the Attacks table adds an attack
   * row for it. Anything else is the normal item drop.
   */
  async _onDropItem(event: DragEvent, item: any) {
    const target = event.target as HTMLElement
    const owned = item.parent === this.actor
    if (owned && target?.closest?.('[data-hotlist]')) return this.pin(item, true)
    if (owned && target?.closest?.('[data-attack-drop]')) {
      const saved = this.actor._source.system.attacks ?? []
      return this.actor.update({ 'system.attacks': [...saved, { id: foundry.utils.randomID(), name: item.name, img: item.img, sourceId: item.id }] })
    }
    return super._onDropItem(event, item)
  }
}

export class MobSheet extends CrawlActorSheet {
  static DEFAULT_OPTIONS: any = {
    classes: ['mob', 'pf-actor'],
    position: { width: 760, height: 760 },
    actions: {
      mobAttack: MobSheet.#onMobAttack,
      mobDamage: MobSheet.#onMobDamage,
      addAttack: MobSheet.#onAddAttack,
      editAttack: MobSheet.#onEditAttack,
      deleteAttack: MobSheet.#onDeleteAttack,
      addAbility: MobSheet.#onAddAbility,
      editAbility: MobSheet.#onEditAbility,
      deleteAbility: MobSheet.#onDeleteAbility,
      abilityToChat: MobSheet.#onAbilityToChat,
      slotLost: MobSheet.#onSlot,
    },
  }

  static PARTS = {
    sidebar: { template: 'systems/crawlspace/templates/actor/mob-sidebar.hbs', scrollable: [''] },
    header: { template: 'systems/crawlspace/templates/actor/mob-header.hbs' },
    tabs: { template: 'systems/crawlspace/templates/sheets/pf-tabs.hbs' },
    main: { template: 'systems/crawlspace/templates/actor/mob-main.hbs', scrollable: [''] },
    effects: { template: 'systems/crawlspace/templates/actor/effects.hbs', scrollable: [''] },
    notes: { template: 'systems/crawlspace/templates/actor/mob-description.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: [{ id: 'main' }, { id: 'effects' }, { id: 'notes' }],
      initial: 'main',
      labelPrefix: 'CRAWLSPACE.Tab',
    },
  }

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    if (context.tabs?.[partId]) context.tab = context.tabs[partId]
    const actor = this.actor
    const system = actor.system
    switch (partId) {
      case 'tabs':
        context.tabList = Object.values(context.tabs ?? {})
        break
      case 'sidebar':
        context.slots = Array.from({ length: system.health.max }, (_, index) => ({ index, filled: index < system.health.value }))
        context.traitSections = TRAIT_SECTIONS.map((key) => ({ key, label: game.i18n.localize(`CRAWLSPACE.Sheet.${key}`), values: [...(system.traits?.[key] ?? [])].sort() }))
        break
      case 'header':
        context.kindChoices = { mob: 'CRAWLSPACE.Mob.KindMob', boss: 'CRAWLSPACE.Mob.KindBoss' }
        context.bossTierChoices = Object.fromEntries(Object.keys(CONFIG.CRAWLSPACE.BOSS_TIERS).map((tier) => [tier, tier]))
        context.levelLabel = game.i18n.localize(system.kind === 'boss' ? 'CRAWLSPACE.Mob.KindBoss' : 'CRAWLSPACE.Mob.KindMob')
        context.tagList = String(system.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean)
        break
      case 'main':
        context.attacks = await Promise.all(
          system.attacks.map(async (attack: any, index: number) => {
            const key = `mobAttack:${attack.id || index}`
            return {
              ...attack,
              index,
              toHitSigned: Handlebars.helpers.crawlSigned((attack.toHit ?? 10) - 10),
              damageText: displayFormula(actor, attack.damage),
              types: attack.damageTypes.join(', '),
              tags: [
                ...attack.damageTypes,
                ...(attack.ranged ? [game.i18n.localize('CRAWLSPACE.Item.Ranged')] : []),
                ...(attack.range ? [attack.range] : []),
                ...(attack.aoeType ? [`${attack.aoeType}${attack.areaFeet ? ` ${attack.areaFeet}ft` : ''}`] : []),
                ...(attack.magic ? [game.i18n.localize('CRAWLSPACE.Item.Magic')] : []),
                ...(attack.armorPiercing ? [game.i18n.localize('CRAWLSPACE.Item.ArmorPiercing')] : []),
              ],
              expandKey: key,
              expanded: this.expanded.has(key),
              notesHtml: await this.enrich(attack.notes ?? ''),
            }
          }),
        )
        context.abilities = await Promise.all(
          system.abilities.map(async (ability: any, index: number) => {
            const key = `mobAbility:${index}`
            return { ...ability, index, expandKey: key, expanded: this.expanded.has(key), descriptionHtml: await this.enrich(ability.description ?? '') }
          }),
        )
        context.items = await Promise.all(actor.items.map((item: any) => this.itemRow(item)))
        break
      case 'notes':
        context.enriched = { description: await this.enrich(system.description), notes: await this.enrich(system.notes) }
        break
    }
    return context
  }

  #attackIndex(target: HTMLElement) {
    return Number(target.closest<HTMLElement>('[data-attack-index]')?.dataset.attackIndex)
  }

  #mobAttackSource(attack: any) {
    // Mobs roll d20 + (to hit − 10) against a target's Evade (mobRules.ts mobAttackModifier).
    return {
      label: attack.name,
      modifiers: [{ label: game.i18n.localize('CRAWLSPACE.Mob.ToHit'), value: (attack.toHit ?? 10) - 10 }, ...penaltyModifiers(this.actor)],
      sources: [attack.name],
      ranged: attack.ranged,
      damage: { formula: attack.damage, types: attack.damageTypes, armorPiercing: attack.armorPiercing, magic: attack.magic, area: !!(String(attack.areaFeet ?? '').trim() || String(attack.aoeType ?? '').trim()) },
    }
  }

  static async #onMobAttack(this: MobSheet, event: PointerEvent, target: HTMLElement) {
    const attack = this.actor.system.attacks[this.#attackIndex(target)]
    if (attack) return rollAttack(this.actor, this.#mobAttackSource(attack), { fast: event.shiftKey })
  }

  static async #onMobDamage(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    const attack = this.actor.system.attacks[this.#attackIndex(target)]
    if (!attack) return
    if (!attack.damage) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.NoDamage', { name: attack.name }))
    const targets = [...game.user.targets].map((token: any) => token.actor?.uuid).filter(Boolean)
    const source = this.#mobAttackSource(attack)
    return rollDamage(this.actor, source.damage, { label: attack.name, tier: (target.dataset.tier as any) ?? 'normal', targets })
  }

  static async #onAddAttack(this: MobSheet) {
    return this.addRow('mobAttack', 'system.attacks', { name: game.i18n.localize('CRAWLSPACE.Mob.NewAttack'), stat: 'STR', damage: '1d6', damageTypes: [] })
  }
  static async #onEditAttack(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    return this.openRow('mobAttack', this.#attackIndex(target))
  }
  static async #onDeleteAttack(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    return this.deleteRow('system.attacks', this.#attackIndex(target))
  }

  #abilityIndex(target: HTMLElement) {
    return Number(target.closest<HTMLElement>('[data-ability-index]')?.dataset.abilityIndex)
  }
  static async #onAddAbility(this: MobSheet) {
    const rows = [...(this.actor._source.system.abilities ?? []), { name: game.i18n.localize('CRAWLSPACE.Mob.NewAbility'), description: '' }]
    await this.actor.update({ 'system.abilities': rows })
    return this.openRow('mobAbility', rows.length - 1)
  }
  static async #onEditAbility(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    return this.openRow('mobAbility', this.#abilityIndex(target))
  }
  static async #onDeleteAbility(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    return this.deleteRow('system.abilities', this.#abilityIndex(target))
  }
  static async #onAbilityToChat(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    const ability = this.actor.system.abilities[this.#abilityIndex(target)]
    if (!ability) return
    const content = `<h3>${foundry.utils.escapeHTML(ability.name)}</h3><p>${foundry.utils.escapeHTML(ability.description ?? '')}</p>`
    return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor: this.actor }), content })
  }

  static async #onSlot(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    const index = Number(target.dataset.index)
    const max = this.actor.system.health.max
    const remaining = this.actor.system.health.value
    const nextRemaining = index + 1 === remaining ? index : index + 1
    await this.actor.update({ 'system.slotsLost': Math.max(0, max - nextRemaining) })
  }
}

export class NpcSheet extends CrawlActorSheet {
  static DEFAULT_OPTIONS: any = {
    classes: ['npc', 'pf-actor'],
    position: { width: 720, height: 680 },
    actions: { openStatBlock: NpcSheet.#onOpenStatBlock, clearStatBlock: NpcSheet.#onClearStatBlock },
  }

  static PARTS = {
    sidebar: { template: 'systems/crawlspace/templates/actor/npc-sidebar.hbs', scrollable: [''] },
    header: { template: 'systems/crawlspace/templates/actor/npc-header.hbs' },
    tabs: { template: 'systems/crawlspace/templates/sheets/pf-tabs.hbs' },
    main: { template: 'systems/crawlspace/templates/actor/npc.hbs', scrollable: [''] },
    effects: { template: 'systems/crawlspace/templates/actor/effects.hbs', scrollable: [''] },
    notes: { template: 'systems/crawlspace/templates/actor/npc-notes.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: [{ id: 'main' }, { id: 'effects' }, { id: 'notes' }],
      initial: 'main',
      labelPrefix: 'CRAWLSPACE.Tab',
    },
  }

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    if (context.tabs?.[partId]) context.tab = context.tabs[partId]
    const system = this.actor.system
    switch (partId) {
      case 'tabs':
        context.tabList = Object.values(context.tabs ?? {})
        break
      case 'sidebar':
        context.traitSections = TRAIT_SECTIONS.map((key) => ({ key, label: game.i18n.localize(`CRAWLSPACE.Sheet.${key}`), values: [...(system.traits?.[key] ?? [])].sort() }))
        break
      case 'main': {
        const statBlock = system.statBlock ? fromUuidSync(system.statBlock) : null
        context.statBlock = statBlock
        context.statBlockAttacks = statBlock?.system?.attacks ?? []
        context.items = await Promise.all(this.actor.items.map((item: any) => this.itemRow(item)))
        context.enriched = { description: await this.enrich(system.description) }
        break
      }
      case 'notes':
        context.enriched = { notes: await this.enrich(system.notes) }
        break
    }
    return context
  }

  static async #onOpenStatBlock(this: NpcSheet) {
    const mob = await fromUuid(this.actor.system.statBlock)
    mob?.sheet.render(true)
  }

  static async #onClearStatBlock(this: NpcSheet) {
    await this.actor.update({ 'system.statBlock': '' })
  }

  /** Drop a Mob onto the NPC to use it as the stat block. */
  async _onDropActor(_event: DragEvent, actor: any) {
    if (actor.type !== 'mob') return
    return this.actor.update({ 'system.statBlock': actor.uuid })
  }
}
