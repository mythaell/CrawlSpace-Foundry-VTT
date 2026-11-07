import { areaEditorContext, bindAreaEditor } from '../effects/areas'
import { CHECK_TYPES, DAMAGE_TYPES, GEAR_SLOTS, STATS } from '../config'
import { prepareLootBox } from '../apps/awards'
import { boxSummary, databaseRows, rowKey } from '../loot/database'
import { linkSpec, type BuildLink, type LinkKind } from '../rules/build-links'
import { benefitTemplates, benefitTiers, createBuildEntry, detrimentTemplates, detrimentTiers, getRaceClassBuild } from '../crawlspace-shared/shared/raceClassRules'
import { bindRulesEditor, rulesContext, rulesDatalists, ruleTypeChoices } from '../effects/rules'
import { documentIds } from './ids'

const { HandlebarsApplicationMixin } = foundry.applications.api
const { ItemSheetV2 } = foundry.applications.sheets

const PHYSICAL = ['weapon', 'equipment', 'consumable', 'tattoo', 'loot']

/** Array fields edited row by row on the sheet; the form sends them as index-keyed objects. */
const ROW_LISTS = ['benefits', 'detriments', 'skillBonuses', 'spellBonuses', 'skillDetriments', 'statSkillDetriments', 'skills']

/** A new row for each build list. */
const NEW_ROWS: Record<string, () => Record<string, unknown>> = {
  skillBonuses: () => ({ name: '', ranks: 1, training: 'standard' }),
  spellBonuses: () => ({ name: '', ranks: 1, training: 'standard' }),
  skillDetriments: () => ({ name: '', currentRank: null, penalty: 1 }),
  statSkillDetriments: () => ({ stat: 'str', penalty: 1 }),
}

const isBuild = (item: any) => item.type === 'race' || item.type === 'class'

/** CrawlSpace's build totals for a race or class item (raceClassRules.ts). */
export const itemBuild = (item: any) => getRaceClassBuild(item.type === 'race' ? 'races' : 'classes', item._source.system)

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
      addBuildRow: CrawlItemSheet.#onAddBuildRow,
      deleteBuildRow: CrawlItemSheet.#onDeleteBuildRow,
      removeBuildLink: CrawlItemSheet.#onRemoveBuildLink,
      addDamageLink: CrawlItemSheet.#onAddDamageLink,
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
    build: { template: 'systems/crawlspace/templates/item/build.hbs', scrollable: [''] },
    rules: { template: 'systems/crawlspace/templates/item/effects.hbs', scrollable: [''] },
  }

  static TABS = {
    primary: {
      tabs: [{ id: 'description' }, { id: 'details' }, { id: 'build' }, { id: 'rules' }],
      initial: 'description',
      labelPrefix: 'CRAWLSPACE.Tab',
    },
  }

  get item() {
    return this.document
  }

  /** Only races and classes have a Build tab. */
  _configureRenderParts(options: any) {
    const parts = super._configureRenderParts(options)
    if (!isBuild(this.item)) delete parts.build
    return parts
  }

  _getTabsConfig(group: string) {
    const config = super._getTabsConfig(group)
    if (!config || isBuild(this.item)) return config
    return { ...config, tabs: config.tabs.filter((tab: any) => tab.id !== 'build') }
  }

  async _prepareContext(options: any) {
    const context = await super._prepareContext(options)
    const item = this.item
    const system = item.system
    const actorItems = item.actor ? [...item.actor.items].sort((a: any, b: any) => a.name.localeCompare(b.name)) : []
    // Skill and spell names from the compendiums, offered while typing a background's or build's skills.
    const rows = ['background', 'race', 'class'].includes(item.type) ? await databaseRows() : []
    const names = (type: string) => [...new Set(rows.filter((row) => row.content_type === type).map((row) => row.name))].sort()
    Object.assign(context, {
      item,
      system,
      isGM: game.user.isGM,
      skillNames: names('skill'),
      spellNames: names('spell'),
      lootSummary: item.type === 'lootBox' && system.loot ? boxSummary(system.loot) : [],
      systemSource: item._source.system,
      systemFields: system.schema.fields,
      type: item.type,
      typeLabel: game.i18n.localize(`TYPES.Item.${item.type}`),
      isRanked: item.type === 'skill' || item.type === 'spell',
      area: item.type === 'skill' || item.type === 'spell' ? areaEditorContext(item) : null,
      areaTypes: { circle: 'CRAWLSPACE.Area.Type.circle', cone: 'CRAWLSPACE.Area.Type.cone', rectangle: 'CRAWLSPACE.Area.Type.rectangle', ray: 'CRAWLSPACE.Area.Type.ray' },
      auraKinds: { '': 'CRAWLSPACE.Aura.Kind.none', aura: 'CRAWLSPACE.Aura.Kind.aura', dread: 'CRAWLSPACE.Aura.Kind.dread' },
      auraTargets: { allies: 'CRAWLSPACE.Aura.Targets.allies', enemies: 'CRAWLSPACE.Aura.Targets.enemies', everyone: 'CRAWLSPACE.Aura.Targets.everyone' },
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
      damageTypeChoices: Object.fromEntries(DAMAGE_TYPES.map((type) => [type, type])),
      statChoicesLower: Object.fromEntries(Object.values(STATS).map((stat) => [stat.code.toLowerCase(), stat.label])),
      originChoices: { Earth: 'CRAWLSPACE.Build.Earth', Alien: 'CRAWLSPACE.Build.Alien' },
      speciesChoices: { human: 'CRAWLSPACE.Builder.Human', animal: 'CRAWLSPACE.Builder.Animal' },
      backgroundSkills: [0, 1, 2].map((index) => ({ index, value: item._source.system.skills?.[index] ?? '' })),
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
    const tagList = typeof system.tags === 'string' ? system.tags.split(',') : (system.tags ?? [])
    for (const tag of tagList) add(tag)
    if (item.type === 'race') add(game.i18n.localize(`CRAWLSPACE.Build.${system.origin === 'Alien' ? 'Alien' : 'Earth'}`))
    if (item.type === 'class' && system.earthClass) add(game.i18n.localize('CRAWLSPACE.Build.EarthClass'))
    if (item.type === 'background') add(game.i18n.localize(`CRAWLSPACE.Builder.${system.species === 'animal' ? 'Animal' : 'Human'}`))
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
        // A shield shows the DR it has left after failed blocks.
        if (item.type === 'equipment')
          row('CRAWLSPACE.Item.ArmorDr', system.isShield && Number(system.drLost) > 0 ? `${Math.max(0, system.armorDr - system.drLost)} / ${system.armorDr}` : system.armorDr)
        if (item.type === 'weapon') {
          row('CRAWLSPACE.Item.Skill', system.skill)
          row('CRAWLSPACE.Item.Ammunition', system.ammunition)
        }
        if (item.type === 'ability') row('CRAWLSPACE.Item.Cooldown', system.cooldown)
        if (item.type === 'lootBox') row('CRAWLSPACE.Item.Tier', system.tier)
        if (isBuild(item)) {
          const build = itemBuild(item)
          row('CRAWLSPACE.Build.Remaining', `${build.remaining} / ${build.base + build.extra}`)
          row('CRAWLSPACE.Item.DrBonus', system.drBonus || '')
          for (const stat of Object.values(STATS)) row(stat.code, Number(system.statBonuses?.[stat.code.toLowerCase()]) ? Handlebars.helpers.crawlSigned(system.statBonuses[stat.code.toLowerCase()]) : '')
        }
        if (item.type === 'background') row('CRAWLSPACE.Item.Skills', (system.skills ?? []).filter(Boolean).join(', '))
        context.summaryRows = rows
        break
      }
      case 'description':
        context.enrichedDescription = await foundry.applications.ux.TextEditor.implementation.enrichHTML(item.system.description ?? '', {
          relativeTo: item,
          secrets: item.isOwner,
        })
        break
      case 'build':
        Object.assign(context, await this.#buildContext())
        break
      case 'rules':
        context.ids = documentIds(item)
        context.ruleTypes = ruleTypeChoices()
        context.datalists = rulesDatalists()
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
    bindAreaEditor(this.element as HTMLElement, this.item, this.isEditable)
    if (this.isEditable)
      for (const zone of this.element.querySelectorAll('[data-drop-list]')) {
        zone.addEventListener('dragover', (event) => event.preventDefault())
        zone.addEventListener('drop', (event) => this.#onBuildDrop(event, (zone as HTMLElement).dataset.dropList as string))
      }
    if (this.isEditable)
      for (const zone of this.element.querySelectorAll('[data-link-list]')) {
        const { linkList, index } = (zone as HTMLElement).dataset
        zone.addEventListener('dragover', (event) => event.preventDefault())
        zone.addEventListener('drop', (event) => this.#onLinkDrop(event as DragEvent, linkList as 'benefits' | 'detriments', Number(index)))
      }
  }

  /** Comma-separated damage types become an array. */
  _processFormData(event: any, form: any, formData: any) {
    const data = super._processFormData(event, form, formData)
    const types = data.system?.damage?.typesText
    if (typeof types === 'string') {
      data.system.damage.types = types.split(',').map((type: string) => type.trim()).filter(Boolean)
      delete data.system.damage.typesText
    }
    for (const key of ROW_LISTS) {
      const list = data.system?.[key]
      if (list && !Array.isArray(list)) {
        const current = this.item.system.toObject()[key]
        for (const [index, changes] of Object.entries(list))
          current[Number(index)] = changes && typeof changes === 'object' ? { ...(current[Number(index)] ?? {}), ...(changes as object) } : changes
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
  /** Everything the Build tab shows: the point budget, rule checks and each build list. */
  async #buildContext() {
    const item = this.item
    const source = item._source.system
    const build = itemBuild(item)
    const rows = await databaseRows()
    const link = (entry: any, type: string) =>
      entry.uuid || rows.find((row) => rowKey(row) === entry.ref && row.content_type === type)?.uuid || ''
    const localize = (key: string) => game.i18n.localize(`CRAWLSPACE.Build.${key}`)
    const training = (spell: boolean) =>
      Object.fromEntries(
        (spell ? ['standard', 'passive'] : ['standard', 'passive', 'unusual', 'unusualPassive']).map((key) => [
          key,
          `CRAWLSPACE.Build.Training.${key}`,
        ]),
      )
    const rankList = (key: string, type: 'skill' | 'spell', penalty = false) => ({
      key,
      type,
      penalty,
      label: localize(`List.${key}`),
      hint: localize(`Hint.${key}`),
      empty: localize(type === 'spell' ? 'DropSpell' : 'DropSkill'),
      nameLabel: game.i18n.localize(`TYPES.Item.${type}`),
      trainingChoices: training(type === 'spell'),
      entries: (source[key] ?? []).map((entry: any, index: number) => ({ ...entry, index, link: link(entry, type) })),
    })
    const groups = (templates: typeof benefitTemplates, tiers: readonly { value: string; label: string }[]) =>
      tiers.map((tier) => ({ label: tier.label, options: templates.filter((preset) => preset.tier === tier.value) }))
    const tierChoices = (tiers: readonly { value: string; label: string }[]) =>
      Object.fromEntries(tiers.map((tier) => [tier.value, tier.label]))
    const entries = (key: string) => (source[key] ?? []).map((entry: any, index: number) => ({ ...entry, index }))
    const linkIcons: Record<LinkKind, string> = {
      skill: 'fa-solid fa-book',
      spell: 'fa-solid fa-wand-sparkles',
      item: 'fa-solid fa-suitcase',
      effect: 'fa-solid fa-person-rays',
      actor: 'fa-solid fa-paw',
      damage: 'fa-solid fa-burst',
    }
    /** A benefit or detriment row, with what it can link and what its links do. */
    const linkedEntries = (key: 'benefits' | 'detriments') =>
      entries(key).map((entry: any) => {
        const spec = linkSpec(key, entry.templateId)
        const kinds = (spec?.accepts ?? []).filter((kind) => kind !== 'damage')
        const kindNames = kinds.map((kind) => game.i18n.localize(`CRAWLSPACE.Build.LinkKind.${kind}`))
        return {
          ...entry,
          canLink: !!spec?.accepts.length,
          acceptsDamage: !!spec?.accepts.includes('damage'),
          links: (entry.links ?? []).map((link: BuildLink, index: number) => ({
            ...link,
            index,
            uuid: link.uuid || rows.find((row) => rowKey(row) === link.ref)?.uuid || '',
            icon: linkIcons[link.kind] ?? 'fa-solid fa-link',
          })),
          dropHint: kindNames.length
            ? game.i18n.format(spec?.multiple ? 'CRAWLSPACE.Build.DropMany' : 'CRAWLSPACE.Build.DropOne', { kinds: kindNames.join(', ') })
            : '',
          mechanicHint: spec?.mechanic ? localize(`Mechanic.${spec.mechanic}`) : '',
        }
      })
    const typeChoices = (templates: typeof benefitTemplates, tiers: readonly { value: string; label: string }[]) =>
      tiers.flatMap((tier) => templates.filter((preset) => preset.tier === tier.value).map((preset) => ({ value: preset.id, label: preset.name, group: tier.label })))
    return {
      build: { ...build, isClass: item.type === 'class', over: build.remaining < 0, capped: build.earned > 5 },
      statRows: Object.values(STATS).map((stat) => ({
        key: stat.code.toLowerCase(),
        label: stat.code,
        value: source.statBonuses?.[stat.code.toLowerCase()] ?? 0,
      })),
      rankLists: [rankList('skillBonuses', 'skill'), rankList('spellBonuses', 'spell')],
      entryLists: [
        {
          key: 'benefits',
          label: localize('List.benefits'),
          hint: localize('Hint.benefits'),
          templateLabel: localize('BenefitTemplate'),
          addLabel: localize('AddBenefit'),
          tierLabel: localize('PointCost'),
          groups: groups(benefitTemplates, benefitTiers),
          tierChoices: tierChoices(benefitTiers),
          entries: linkedEntries('benefits'),
          typeChoices: typeChoices(benefitTemplates, benefitTiers),
          unlisted: localize('Unlisted'),
        },
        {
          key: 'detriments',
          isDetriments: true,
          label: localize('List.detriments'),
          hint: localize('Hint.detriments'),
          templateLabel: localize('DetrimentTemplate'),
          addLabel: localize('AddDetriment'),
          tierLabel: localize('PointsEarned'),
          groups: groups(detrimentTemplates, detrimentTiers),
          tierChoices: tierChoices(detrimentTiers),
          entries: linkedEntries('detriments'),
          typeChoices: typeChoices(detrimentTemplates, detrimentTiers),
          unlisted: localize('Unlisted'),
          skillPenalties: rankList('skillDetriments', 'skill', true),
          statPenalties: entries('statSkillDetriments'),
        },
      ],
    }
  }

  static async #onAddBuildRow(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.list as string
    const list = this.item.system.toObject()[key]
    if (!Array.isArray(list)) return
    if (key === 'benefits' || key === 'detriments') {
      const choice = (this.element.querySelector(`select[data-template-for="${key}"]`) as HTMLSelectElement | null)?.value
      const preset = (key === 'benefits' ? benefitTemplates : detrimentTemplates).find((entry) => entry.id === choice)
      if (!preset) return
      const { id: _id, ...entry } = createBuildEntry(preset)
      list.push({ ...entry, links: foundry.utils.deepClone(linkSpec(key, preset.id)?.preset ?? []) })
    } else list.push(NEW_ROWS[key]?.() ?? {})
    await this.item.update({ [`system.${key}`]: list })
  }

  /** Add a link to a benefit or detriment; an entry that takes one link swaps it. */
  async #addBuildLink(key: 'benefits' | 'detriments', index: number, link: BuildLink) {
    const list = this.item.system.toObject()[key]
    const entry = list[index]
    if (!entry) return
    const spec = linkSpec(key, entry.templateId)
    if (!spec?.accepts.includes(link.kind)) {
      const kinds = (spec?.accepts ?? []).map((kind) => game.i18n.localize(`CRAWLSPACE.Build.LinkKind.${kind}`)).join(', ')
      return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Build.WrongLink', { name: entry.name, kinds: kinds || '—' }))
    }
    const links: BuildLink[] = entry.links ?? []
    const same = (other: BuildLink) => (link.uuid && other.uuid === link.uuid) || (other.kind === link.kind && other.name.toLowerCase() === link.name.toLowerCase())
    if (links.some(same)) return ui.notifications.info(game.i18n.format('CRAWLSPACE.Build.AlreadyListed', { name: link.name }))
    entry.links = spec.multiple ? [...links, link] : [link]
    await this.item.update({ [`system.${key}`]: list })
  }

  /** Dropping an item, buff/condition or actor on a benefit or detriment links it. */
  async #onLinkDrop(event: DragEvent, key: 'benefits' | 'detriments', index: number) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
    if (!['Item', 'ActiveEffect', 'Actor'].includes(data?.type)) return
    event.preventDefault()
    event.stopPropagation()
    const dropped: any = await fromUuid(data.uuid)
    if (!dropped) return
    const kind: LinkKind =
      data.type === 'ActiveEffect' ? 'effect' : data.type === 'Actor' ? 'actor' : dropped.type === 'skill' || dropped.type === 'spell' ? dropped.type : 'item'
    return this.#addBuildLink(key, index, { kind, name: dropped.name, uuid: dropped.uuid, ref: String(dropped.flags?.crawlspace?.sourceId ?? '') })
  }

  static async #onAddDamageLink(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const { list, index } = target.dataset
    const type = (this.element.querySelector(`select[data-damage-for="${list}.${index}"]`) as HTMLSelectElement | null)?.value
    if (type) return this.#addBuildLink(list as 'benefits' | 'detriments', Number(index), { kind: 'damage', name: type, uuid: '', ref: '' })
  }

  static async #onRemoveBuildLink(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.list as string
    const list = this.item.system.toObject()[key]
    const entry = list?.[Number(target.dataset.index)]
    if (!entry?.links) return
    entry.links.splice(Number(target.dataset.link), 1)
    await this.item.update({ [`system.${key}`]: list })
  }

  static async #onDeleteBuildRow(this: CrawlItemSheet, _event: PointerEvent, target: HTMLElement) {
    const key = target.dataset.list as string
    const list = this.item.system.toObject()[key]
    if (!Array.isArray(list)) return
    list.splice(Number(target.dataset.index), 1)
    await this.item.update({ [`system.${key}`]: list })
  }

  /** Dropping a skill or spell item on a build list links it there. */
  async #onBuildDrop(event: DragEvent, key: string) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
    if (data?.type !== 'Item') return
    event.preventDefault()
    event.stopPropagation()
    const dropped: any = await fromUuid(data.uuid)
    const wanted = key === 'spellBonuses' ? 'spell' : 'skill'
    if (!dropped || dropped.type !== wanted)
      return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Build.WrongDrop', { type: game.i18n.localize(`TYPES.Item.${wanted}`) }))
    const list = this.item.system.toObject()[key]
    if (list.some((entry: any) => entry.uuid === dropped.uuid || entry.name.toLowerCase() === dropped.name.toLowerCase()))
      return ui.notifications.info(game.i18n.format('CRAWLSPACE.Build.AlreadyListed', { name: dropped.name }))
    const passive = /passive/i.test(String(dropped.system?.checkType ?? ''))
    const ref = String(dropped.flags?.crawlspace?.sourceId ?? '')
    list.push({
      ...NEW_ROWS[key](),
      name: dropped.name,
      uuid: dropped.uuid,
      ref,
      ...(key !== 'skillDetriments' && passive ? { training: 'passive' } : {}),
      ...(key === 'skillDetriments' ? { currentRank: dropped.system?.rank?.value ?? null } : {}),
    })
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
