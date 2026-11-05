import { DAMAGE_TYPES, GEAR_SLOTS, STATS, STAT_KEYS } from '../config'
import { DEBUFFS } from '../rules/debuffs'
import { penaltyModifiers, rollAttack, rollCheck } from '../dice/rolls'
import { levelUp, openUpkeep } from '../apps/upkeep'
import { pendingStatPoints } from '../rules/upkeep'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ActorSheetV2 } = foundry.applications.sheets
const TextEditor = () => foundry.applications.ux.TextEditor.implementation

const ITEM_GROUPS = {
  inventory: ['weapon', 'equipment', 'consumable', 'tattoo', 'loot', 'lootBox'],
  abilities: ['race', 'class', 'background', 'ability', 'achievement'],
}

/** Shared behavior: item/effect rows, inline item edits, rolling stats. */
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
      editEffect: CrawlActorSheet.#onEditEffect,
      toggleEffect: CrawlActorSheet.#onToggleEffect,
      deleteEffect: CrawlActorSheet.#onDeleteEffect,
      createEffect: CrawlActorSheet.#onCreateEffect,
      addDebuff: CrawlActorSheet.#onAddDebuff,
      stackEffect: CrawlActorSheet.#onStackEffect,
      itemToChat: CrawlActorSheet.#onItemToChat,
    },
  }

  get actor() {
    return this.document
  }

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

  protected itemRow(item: any) {
    return {
      id: item.id,
      uuid: item.uuid,
      name: item.name,
      img: item.img,
      type: item.type,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      system: item.system,
    }
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    // Inline edits on embedded items (rank, quantity, mana...).
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

export class CrawlerSheet extends CrawlActorSheet {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawler'],
    position: { width: 1120, height: 720 },
    actions: {
      slot: CrawlerSheet.#onHealthSlot,
      shield: CrawlerSheet.#onShieldSlot,
      shieldPrompt: CrawlerSheet.#onShieldPrompt,
      upkeep: CrawlerSheet.#onUpkeep,
      levelUp: CrawlerSheet.#onLevelUp,
      attackUnarmed: CrawlerSheet.#onUnarmed,
      openEffects: CrawlerSheet.#onOpenEffects,
      editTraits: CrawlerSheet.#onEditTraits,
      removeImage: CrawlerSheet.#onRemoveImage,
      addClub: CrawlerSheet.#onAddClub,
      removeClub: CrawlerSheet.#onRemoveClub,
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
        context.drTooltip = `${game.i18n.localize('CRAWLSPACE.Stat.ArmorBase')} (${system.dr.armorTotal}) + ${game.i18n.localize('CRAWLSPACE.Stat.DrBuffs')} (${drBuffs}) = ${system.dr.total}`
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
        context.attacks = items
          .filter((i: any) => (i.type === 'weapon' && i.system.equipped) || ((i.type === 'skill' || i.type === 'spell') && i.system.isAttack))
          .map((i: any) => this.itemRow(i))
        context.hotlist = system.hotlist.items
          .map((id: string) => actor.items.get(id))
          .filter(Boolean)
          .map((i: any) => this.itemRow(i))
        break
      case 'skills':
        context.skills = items.filter((i: any) => i.type === 'skill').map((i: any) => this.itemRow(i))
        break
      case 'spells':
        context.spells = items.filter((i: any) => i.type === 'spell').map((i: any) => this.itemRow(i))
        break
      case 'inventory': {
        const rows = items.filter((i: any) => ITEM_GROUPS.inventory.includes(i.type)).map((i: any) => this.itemRow(i))
        context.inventoryGroups = ITEM_GROUPS.inventory.map((type) => ({
          type,
          label: game.i18n.localize(`TYPES.Item.${type}`),
          items: rows.filter((row: any) => row.type === type),
        }))
        context.paperDoll = Object.entries(GEAR_SLOTS).map(([slot, label]) => ({
          slot,
          label,
          items: rows.filter((row: any) => row.type === 'equipment' && row.system.equipped && row.system.slot === slot),
        }))
        context.gold = system.details.gold
        break
      }
      case 'abilities': {
        const rows = items.filter((i: any) => ITEM_GROUPS.abilities.includes(i.type)).map((i: any) => this.itemRow(i))
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

  static async #onLevelUp(this: CrawlerSheet) {
    return levelUp(this.actor)
  }

  static async #onOpenEffects(this: CrawlerSheet) {
    this.changeTab('effects', 'primary')
  }

  static async #onRemoveImage(this: CrawlerSheet) {
    await this.actor.update({ img: (this.actor.constructor as any).DEFAULT_ICON ?? 'icons/svg/mystery-man.svg' })
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

  static async #onUnarmed(this: CrawlerSheet, event: PointerEvent) {
    const actor = this.actor
    return rollAttack(
      actor,
      {
        label: game.i18n.localize('CRAWLSPACE.Attack.Unarmed'),
        modifiers: [{ label: 'Strength', value: actor.system.attributes.str.mod }, ...penaltyModifiers(actor)],
        sources: ['Unarmed'],
        damage: { formula: '1d4', types: ['Bludgeoning'] },
      },
      { fast: event.shiftKey },
    )
  }

  /** Dropping an item onto the hotlist strip pins it. */
  async _onDropItem(event: DragEvent, item: any) {
    const hotlist = (event.target as HTMLElement)?.closest?.('[data-hotlist]')
    if (hotlist && item.parent === this.actor) {
      const ids = [...new Set([...this.actor.system.hotlist.items, item.id])].slice(0, this.actor.system.hotlist.capacity)
      return this.actor.update({ 'system.hotlist.items': ids })
    }
    return super._onDropItem(event, item)
  }
}

export class MobSheet extends CrawlActorSheet {
  static DEFAULT_OPTIONS: any = {
    classes: ['mob'],
    position: { width: 680, height: 720 },
    actions: {
      mobAttack: MobSheet.#onMobAttack,
      addAttack: MobSheet.#onAddAttack,
      deleteAttack: MobSheet.#onDeleteAttack,
      slotLost: MobSheet.#onSlot,
    },
  }

  static PARTS = {
    header: { template: 'systems/crawlspace/templates/actor/mob-header.hbs' },
    tabs: { template: 'templates/generic/tab-navigation.hbs' },
    stats: { template: 'systems/crawlspace/templates/actor/mob-stats.hbs', scrollable: [''] },
    effects: { template: 'systems/crawlspace/templates/actor/effects.hbs', scrollable: [''] },
    description: { template: 'systems/crawlspace/templates/actor/mob-description.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: [
        { id: 'stats', icon: 'fa-solid fa-skull' },
        { id: 'effects', icon: 'fa-solid fa-bolt' },
        { id: 'description', icon: 'fa-solid fa-book' },
      ],
      initial: 'stats',
      labelPrefix: 'CRAWLSPACE.Tab',
    },
  }

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    if (context.tabs?.[partId]) context.tab = context.tabs[partId]
    const system = this.actor.system
    if (partId === 'stats') {
      context.attacks = system.attacks.map((attack: any, index: number) => ({ ...attack, index, types: attack.damageTypes.join(', ') }))
      context.slots = Array.from({ length: system.health.max }, (_, index) => ({ index, filled: index < system.health.value }))
      context.items = this.actor.items.map((item: any) => this.itemRow(item))
      context.abilities = system.abilities
    }
    if (partId === 'header') {
      context.kindChoices = { mob: 'CRAWLSPACE.Mob.KindMob', boss: 'CRAWLSPACE.Mob.KindBoss' }
      context.bossTierChoices = Object.fromEntries(Object.keys(CONFIG.CRAWLSPACE.BOSS_TIERS).map((tier) => [tier, tier]))
    }
    if (partId === 'description') {
      context.enriched = { description: await this.enrich(system.description), notes: await this.enrich(system.notes) }
    }
    return context
  }

  static async #onMobAttack(this: MobSheet, event: PointerEvent, target: HTMLElement) {
    const actor = this.actor
    const attack = actor.system.attacks[Number(target.closest<HTMLElement>('[data-attack-index]')?.dataset.attackIndex)]
    if (!attack) return
    // Mobs roll d20 + (to hit − 10) against a target's Evade (mobRules.ts mobAttackModifier).
    return rollAttack(
      actor,
      {
        label: attack.name,
        modifiers: [{ label: game.i18n.localize('CRAWLSPACE.Mob.ToHit'), value: (attack.toHit ?? 10) - 10 }, ...penaltyModifiers(actor)],
        sources: [attack.name],
        ranged: attack.ranged,
        damage: { formula: attack.damage, types: attack.damageTypes, armorPiercing: attack.armorPiercing, magic: attack.magic },
      },
      { fast: event.shiftKey },
    )
  }

  static async #onAddAttack(this: MobSheet) {
    const attacks = this.actor.system.toObject().attacks
    attacks.push({ id: foundry.utils.randomID(), name: game.i18n.localize('CRAWLSPACE.Mob.NewAttack'), stat: 'STR', damage: '1d6', damageTypes: [] })
    await this.actor.update({ 'system.attacks': attacks })
  }

  static async #onDeleteAttack(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    const index = Number(target.closest<HTMLElement>('[data-attack-index]')?.dataset.attackIndex)
    const attacks = this.actor.system.toObject().attacks
    attacks.splice(index, 1)
    await this.actor.update({ 'system.attacks': attacks })
  }

  static async #onSlot(this: MobSheet, _event: PointerEvent, target: HTMLElement) {
    const index = Number(target.dataset.index)
    const max = this.actor.system.health.max
    const remaining = this.actor.system.health.value
    const nextRemaining = index + 1 === remaining ? index : index + 1
    await this.actor.update({ 'system.slotsLost': Math.max(0, max - nextRemaining) })
  }

  /** Attack rows edit an array; turn their flat form fields back into the array. */
  _processFormData(event: any, form: any, formData: any) {
    const data = super._processFormData(event, form, formData)
    const attacks = data.system?.attacks
    if (attacks && !Array.isArray(attacks)) {
      const current = this.actor.system.toObject().attacks
      for (const [index, changes] of Object.entries(attacks) as [string, any][]) {
        if (typeof changes.damageTypes === 'string')
          changes.damageTypes = changes.damageTypes.split(',').map((type: string) => type.trim()).filter(Boolean)
        current[Number(index)] = foundry.utils.mergeObject(current[Number(index)] ?? {}, changes)
      }
      data.system.attacks = current
    }
    return data
  }
}

export class NpcSheet extends CrawlActorSheet {
  static DEFAULT_OPTIONS: any = {
    classes: ['npc'],
    position: { width: 600, height: 640 },
    actions: { openStatBlock: NpcSheet.#onOpenStatBlock },
  }

  static PARTS = {
    body: { template: 'systems/crawlspace/templates/actor/npc.hbs', scrollable: [''] },
  }

  async _preparePartContext(partId: string, context: any, options: any) {
    context = await super._preparePartContext(partId, context, options)
    context.enriched = { description: await this.enrich(this.actor.system.description), notes: await this.enrich(this.actor.system.notes) }
    context.statBlock = this.actor.system.statBlock ? fromUuidSync(this.actor.system.statBlock) : null
    return context
  }

  static async #onOpenStatBlock(this: NpcSheet) {
    const mob = await fromUuid(this.actor.system.statBlock)
    mob?.sheet.render(true)
  }

  /** Drop a Mob onto the NPC to use it as the stat block. */
  async _onDropActor(_event: DragEvent, actor: any) {
    if (actor.type !== 'mob') return
    return this.actor.update({ 'system.statBlock': actor.uuid })
  }
}
