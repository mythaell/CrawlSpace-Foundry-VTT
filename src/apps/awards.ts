/**
 * Crawler Awards and the Loot Box generator (CrawlerAwardsPopup.tsx, LootBoxGenerator.tsx).
 *
 * Award mode gives one crawler AI Favor, Popularity, an achievement (custom or premade) and a sealed loot box:
 * generated here (previewed, or blind), a GM's prepared box, or a named box that rolls when it is opened.
 * Prepare mode fills a loot box item's contents ahead of time; awarding it later hands out exactly those.
 * Compendium "database picker" choices are drag and drop here: items onto the preview, achievements onto theirs.
 */
import { lootTiers, lootTypes, tierRules, type LootTier, type LootType } from '../crawlspace-shared/shared/lootData'
import { generateLoot, generateLootEntry, goldAllowed, rollLootGold, xValueLabel, type LootEntry, type LootSettings } from '../crawlspace-shared/shared/lootGenerator'
import { describeInventoryItem, finalizeLootItem } from '../crawlspace-shared/shared/inventoryItems'
import { normalizePreparedLoot } from '../crawlspace-shared/shared/preparedLootBoxes'
import { awardNumber, boxIdentity } from '../rules/crawler-awards'
import { contextFor, inventoryFromFoundry, rowKey, type DatabaseRow } from '../loot/database'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api

type Settings = Pick<LootSettings, 'tier' | 'type' | 'items' | 'consumables' | 'potions'>
type Preview = { settings: Settings; entries: LootEntry[]; gold: number; confirmGold: boolean; manual: boolean }

const t = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(`CRAWLSPACE.Awards.${key}`, data) : game.i18n.localize(`CRAWLSPACE.Awards.${key}`))
const tierDefaults = (tier: LootTier) => ({ items: tierRules[tier].items, consumables: tierRules[tier].consumables, potions: tierRules[tier].potions })
const plain = (html: unknown) => String(html ?? '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()
const sentence = (text: unknown) => String(text ?? '').trim().replace(/[.!?]+$/, '')

export class CrawlerAwards extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS: any = {
    tag: 'form',
    classes: ['crawlspace', 'crawler-awards'],
    position: { width: 640, height: 'auto' },
    window: { resizable: true, icon: 'fa-solid fa-trophy' },
    form: { submitOnChange: true, closeOnSubmit: false, handler: CrawlerAwards.#onChange },
    actions: {
      tier: CrawlerAwards.#onTier,
      resetQuantities: CrawlerAwards.#onResetQuantities,
      generate: CrawlerAwards.#onGenerate,
      blind: CrawlerAwards.#onBlind,
      manual: CrawlerAwards.#onManual,
      rerollAll: CrawlerAwards.#onRerollAll,
      reroll: CrawlerAwards.#onReroll,
      removeEntry: CrawlerAwards.#onRemoveEntry,
      expand: CrawlerAwards.#onExpand,
      clearPremade: CrawlerAwards.#onClearPremade,
      award: CrawlerAwards.#onAward,
      saveBox: CrawlerAwards.#onSaveBox,
    },
  }

  static PARTS = {
    form: { template: 'systems/crawlspace/templates/apps/awards.hbs', scrollable: [''] },
  }

  /** The crawler being awarded (award mode), or the loot box item being filled (prepare mode). Kept off the options, which ApplicationV2 deep-merges. */
  actor: any
  box: any
  rows: DatabaseRow[] = []
  context: any = null
  loading = true
  busy = false
  error = ''
  favor = ''
  popularity = ''
  achievement = { on: false, premade: '', name: '', description: '', reward: '', link: false }
  loot = { on: false, source: 'generate', prepared: '', name: 'Bronze Adventurer Box', quantity: '1', notes: '' }
  settings: Settings = { tier: 'Bronze', type: 'Adventurer', ...tierDefaults('Bronze') }
  floor = 1
  preview: Preview | null = null
  expanded = new Set<string>()
  prepared: { uuid: string; name: string; summary: string; awarded: boolean }[] = []

  constructor(target: { actor?: any; box?: any }) {
    super({ id: `crawl-awards-${(target.actor ?? target.box).uuid.replace(/\./g, '-')}` } as any)
    this.actor = target.actor ?? null
    this.box = target.box ?? null
    if (this.actor) this.floor = Number(this.actor.system.details?.floor) || 1
    if (this.box) {
      const loot = normalizePreparedLoot(this.box.system.loot)
      const tier = (lootTiers.includes(this.box.system.tier) ? this.box.system.tier : 'Bronze') as LootTier
      this.settings = { tier, type: (lootTypes.includes(this.box.system.boxType) ? this.box.system.boxType : 'Adventurer') as LootType, ...tierDefaults(tier) }
      if (loot) {
        this.floor = loot.floor
        this.settings = { ...this.settings, tier: loot.tier, type: loot.type }
        this.preview = { settings: { ...this.settings }, entries: loot.items.map((item) => ({ item, kind: 'database', checked: true, index: 0, rolls: [] })), gold: loot.gold, confirmGold: true, manual: true }
      }
    }
  }

  get title() {
    return this.actor ? t('TitleFor', { name: this.actor.name }) : game.i18n.format('CRAWLSPACE.Loot.PrepareTitle', { name: this.box.name })
  }

  get boxName() {
    if (this.loot.source === 'named') return boxIdentity(this.loot.name, lootTypes).name
    if (this.loot.source === 'prepared') return this.prepared.find((box) => box.uuid === this.loot.prepared)?.name ?? ''
    return `${this.settings.tier} ${this.settings.type} Box`
  }

  async _preFirstRender(context: any, options: any) {
    await super._preFirstRender(context, options)
    try {
      const { rows, context: lootContext } = await contextFor(this.actor, this.floor)
      this.rows = rows
      this.context = lootContext
      this.prepared = await preparedBoxes()
    } catch (error: any) {
      this.error = error.message
    }
    this.loading = false
  }

  async _prepareContext() {
    const floor = this.context?.floor ?? this.floor
    const { tier, type } = this.settings
    const preview = this.preview
    const achievements = this.rows.filter((row) => row.content_type === 'achievement').sort((a, b) => a.name.localeCompare(b.name))
    return {
      awardMode: !!this.actor,
      actorName: this.actor?.name ?? '',
      favorNow: this.actor?.system.details.aiFavor ?? 0,
      popularityNow: this.actor?.system.details.popularity ?? 0,
      favor: this.favor,
      popularity: this.popularity,
      achievement: this.achievement,
      premadeChoices: achievements.map((row) => ({ value: row.uuid, label: row.source === 'homebrew' ? row.name : `${row.name} (${game.i18n.localize('CRAWLSPACE.Awards.Game')})` })),
      loot: this.loot,
      sourceChoices: { generate: t('SourceGenerate'), prepared: t('SourcePrepared'), named: t('SourceNamed') },
      preparedChoices: this.prepared.filter((box) => !box.awarded || box.uuid === this.loot.prepared).map((box) => ({ value: box.uuid, label: box.name })),
      preparedSummary: this.prepared.find((box) => box.uuid === this.loot.prepared)?.summary ?? '',
      generating: !this.actor || (this.loot.on && this.loot.source === 'generate'),
      loading: this.loading,
      busy: this.busy,
      error: this.error,
      floor,
      tiers: lootTiers.map((value) => ({ value, active: value === tier })),
      types: Object.fromEntries(lootTypes.filter((value) => value !== 'Earth' || tier === 'Silver').map((value) => [value, value])),
      settings: this.settings,
      earth: type === 'Earth',
      gold: goldAllowed(tier, floor, type) ? tierRules[tier].gold : tier === 'Celestial' ? t('NoGold') : t('NoGoldFloor'),
      propertyRolls: tierRules[tier].rolls || t('Mundane'),
      xValues: tier === 'Bronze' ? '—' : t('XValues', { stat: xValueLabel(tier, false, floor), skill: xValueLabel(tier, true, floor), passive: Math.min(15, floor) }),
      preview: preview && {
        title: `${preview.settings.tier} ${preview.settings.type} Box`,
        manual: preview.manual,
        count: preview.manual ? t('Chosen', { count: preview.entries.length }) : t('Selected', { checked: preview.entries.filter((entry) => entry.checked).length, count: preview.entries.length }),
        gold: preview.gold,
        confirmGold: preview.confirmGold,
        goldAllowed: goldAllowed(preview.settings.tier, floor, preview.settings.type),
        entries: preview.entries.map((entry, index) => ({
          index,
          name: entry.item.name || t('Unnamed'),
          quantity: entry.item.quantity,
          checked: entry.checked,
          rerollable: entry.kind !== 'database' && !preview.manual,
          tags: entry.item.tags ?? [],
          description: describeInventoryItem(entry.item),
          expanded: this.expanded.has(entry.item.id),
        })),
      },
    }
  }

  _onRender(context: any, options: any) {
    super._onRender(context, options)
    // Compendium and sidebar items drop into the preview; achievements onto the achievement fields.
    this.element.addEventListener('dragover', (event: DragEvent) => event.preventDefault())
    this.element.addEventListener('drop', (event: DragEvent) => this.#onDrop(event))
  }

  async #onDrop(event: DragEvent) {
    const data = foundry.applications.ux.TextEditor.implementation.getDragEventData(event)
    if (data?.type !== 'Item') return
    const item = await fromUuid(data.uuid)
    if (!item) return
    if (item.type === 'achievement') {
      if (!this.actor) return
      this.achievement.on = true
      return this.#choosePremade(item)
    }
    if (item.type === 'lootBox' && this.actor) {
      if (!normalizePreparedLoot(item.system.loot)) return ui.notifications.warn(t('NotPrepared', { name: item.name }))
      if (!this.prepared.some((box) => box.uuid === item.uuid)) this.prepared.push(preparedEntry(item))
      Object.assign(this.loot, { on: true, source: 'prepared', prepared: item.uuid })
      return this.render()
    }
    if (!['weapon', 'equipment', 'consumable', 'tattoo', 'loot'].includes(item.type)) return
    this.preview ??= { settings: { ...this.settings }, entries: [], gold: 0, confirmGold: true, manual: true }
    this.preview.entries.push({ item: inventoryFromFoundry(item), kind: 'database', checked: true, index: 0, rolls: [] })
    if (this.actor) this.loot.on = true
    this.render()
  }

  async #choosePremade(item: any) {
    const record = item.flags?.crawlspace?.data ?? {}
    // A premade achievement's linked box (a sourceId key) is awarded with it when it has prepared contents.
    const linked = record.lootBoxId ? this.rows.find((row) => row.content_type === 'loot_box' && rowKey(row) === record.lootBoxId) : null
    Object.assign(this.achievement, { premade: item.uuid, name: item.name, description: plain(record.description ?? item.system.description), reward: linked?.name ?? String(record.reward ?? item.system.reward ?? '') })
    if (linked && normalizePreparedLoot(linked.data.prepared)) {
      if (!this.prepared.some((box) => box.uuid === linked.uuid)) this.prepared.push({ uuid: linked.uuid, name: linked.name, summary: '', awarded: false })
      Object.assign(this.loot, { on: true, source: 'prepared', prepared: linked.uuid })
      this.achievement.link = true
    }
    this.render()
  }

  static async #onChange(this: CrawlerAwards, _event: Event, _form: HTMLFormElement, formData: any) {
    const data = foundry.utils.expandObject(formData.object)
    if (this.actor) {
      this.favor = String(data.favor ?? '')
      this.popularity = String(data.popularity ?? '')
      const premade = String(data.achievement?.premade ?? '')
      Object.assign(this.achievement, { ...data.achievement, on: !!data.achievement?.on, link: !!data.achievement?.link })
      Object.assign(this.loot, { ...data.loot, on: !!data.loot?.on })
      if (!this.loot.on) this.achievement.link = false
      if (this.achievement.link) this.loot.on = true
      if (premade && premade !== this.#lastPremade) {
        this.#lastPremade = premade
        const item = await fromUuid(premade)
        if (item) return this.#choosePremade(item)
      }
      this.#lastPremade = premade
    }
    if (data.settings) {
      const type = data.settings.type as LootType
      this.settings.type = type === 'Earth' && this.settings.tier !== 'Silver' ? 'Adventurer' : type
      for (const key of ['items', 'consumables', 'potions'] as const) this.settings[key] = Math.max(0, Math.min(50, Math.floor(Number(data.settings[key]) || 0)))
    }
    if (data.floor !== undefined && !this.actor) {
      this.floor = Math.max(1, Math.min(18, Math.floor(Number(data.floor)) || 1))
      if (this.context) this.context.floor = this.floor
    }
    if (this.preview) {
      if (data.gold !== undefined) this.preview.gold = Math.max(0, Math.floor(Number(data.gold) || 0))
      if ('confirmGold' in data) this.preview.confirmGold = !!data.confirmGold
      for (const [index, entry] of this.preview.entries.entries()) if (data.entry?.[index] !== undefined) entry.checked = !!data.entry[index].checked
    }
    this.render()
  }

  #lastPremade = ''

  #run(fn: () => void | Promise<void>) {
    this.error = ''
    return Promise.resolve()
      .then(fn)
      .catch((error: any) => {
        this.error = game.i18n.localize(error.message)
      })
      .finally(() => this.render())
  }

  static #onTier(this: CrawlerAwards, _event: Event, target: HTMLElement) {
    const tier = target.dataset.tier as LootTier
    this.settings = { tier, type: this.settings.type === 'Earth' && tier !== 'Silver' ? 'Adventurer' : this.settings.type, ...tierDefaults(tier) }
    this.render()
  }

  static #onResetQuantities(this: CrawlerAwards) {
    Object.assign(this.settings, tierDefaults(this.settings.tier))
    this.render()
  }

  #roll() {
    if (!this.context) throw new Error('CRAWLSPACE.Awards.Loading')
    const settings: LootSettings = { ...this.settings, mode: 'Random', choices: [] }
    const entries = generateLoot(settings, this.context)
    return { settings: { ...this.settings }, entries, gold: rollLootGold(settings.tier, this.context.floor, settings.type), confirmGold: true, manual: false }
  }

  static #onGenerate(this: CrawlerAwards) {
    return this.#run(() => {
      this.preview = this.#roll()
      this.expanded.clear()
    })
  }

  /** Roll and award at once: nobody sees the contents until the box is opened. */
  static #onBlind(this: CrawlerAwards) {
    return this.#run(async () => {
      const preview = this.#roll()
      await this.#award(preview)
    })
  }

  static #onManual(this: CrawlerAwards) {
    this.preview = { settings: { ...this.settings }, entries: [], gold: 0, confirmGold: true, manual: true }
    this.render()
  }

  static #onRerollAll(this: CrawlerAwards) {
    return this.#run(() => {
      const preview = this.preview
      if (!preview || !this.context) return
      const settings: LootSettings = { ...preview.settings, mode: 'Random', choices: [] }
      preview.entries = preview.entries.map((entry) => (entry.kind === 'database' ? entry : { ...generateLootEntry(settings, this.context, entry.kind, entry.index), checked: entry.checked }))
      preview.gold = rollLootGold(preview.settings.tier, this.context.floor, preview.settings.type)
    })
  }

  static #onReroll(this: CrawlerAwards, _event: Event, target: HTMLElement) {
    return this.#run(() => {
      const preview = this.preview
      const index = Number(target.closest<HTMLElement>('[data-index]')?.dataset.index)
      const entry = preview?.entries[index]
      if (!preview || !entry || entry.kind === 'database' || !this.context) return
      const settings: LootSettings = { ...preview.settings, mode: 'Random', choices: [] }
      preview.entries[index] = { ...generateLootEntry(settings, this.context, entry.kind, entry.index), checked: entry.checked }
    })
  }

  static #onRemoveEntry(this: CrawlerAwards, _event: Event, target: HTMLElement) {
    const index = Number(target.closest<HTMLElement>('[data-index]')?.dataset.index)
    this.preview?.entries.splice(index, 1)
    this.render()
  }

  static #onExpand(this: CrawlerAwards, _event: Event, target: HTMLElement) {
    const entry = this.preview?.entries[Number(target.closest<HTMLElement>('[data-index]')?.dataset.index)]
    if (!entry) return
    if (this.expanded.has(entry.item.id)) this.expanded.delete(entry.item.id)
    else this.expanded.add(entry.item.id)
    this.render()
  }

  static #onClearPremade(this: CrawlerAwards) {
    Object.assign(this.achievement, { premade: '', name: '', description: '', reward: '', link: false })
    this.#lastPremade = ''
    this.render()
  }

  static #onAward(this: CrawlerAwards) {
    return this.#run(() => this.#award(this.loot.on && this.loot.source === 'generate' ? this.preview : null))
  }

  /** Prepare mode: the box keeps exactly these contents until it is awarded and opened. */
  static #onSaveBox(this: CrawlerAwards) {
    return this.#run(async () => {
      const preview = this.preview
      if (!preview) throw new Error('CRAWLSPACE.Awards.GenerateFirst')
      const gold = preview.confirmGold && goldAllowed(preview.settings.tier, this.floor, preview.settings.type) ? preview.gold : 0
      const items = preview.entries.filter((entry) => entry.checked).map((entry) => finalizeLootItem(entry.item))
      await this.box.update({
        'system.tier': preview.settings.tier,
        'system.boxType': preview.settings.type,
        'system.loot': { tier: preview.settings.tier, type: preview.settings.type, floor: this.floor, gold, items },
      })
      ui.notifications.info(game.i18n.format('CRAWLSPACE.Loot.Saved', { name: this.box.name }))
      await this.close()
    })
  }

  async #award(generated: Preview | null) {
    if (this.busy) return
    const actor = this.actor
    const floor = this.context?.floor ?? this.floor
    if (this.achievement.on && !this.achievement.name.trim()) throw new Error('CRAWLSPACE.Awards.NeedName')
    if (this.loot.on && this.loot.source === 'generate' && !generated) throw new Error('CRAWLSPACE.Awards.GenerateFirst')
    const before = { favor: Number(actor.system.details.aiFavor) || 0, popularity: Number(actor.system.details.popularity) || 0 }
    const after = { favor: awardNumber(this.favor, before.favor), popularity: awardNumber(this.popularity, before.popularity) }
    const items: any[] = []
    let box: any = null
    let preparedSource: any = null
    if (this.loot.on) {
      box = { _id: foundry.utils.randomID(), type: 'lootBox', img: 'icons/svg/chest.svg', system: { sealed: true, quantity: 1, notes: '' } }
      if (this.loot.source === 'generate') {
        const preview = generated!
        const gold = preview.confirmGold && goldAllowed(preview.settings.tier, floor, preview.settings.type) ? preview.gold : 0
        Object.assign(box, { name: `${preview.settings.tier} ${preview.settings.type} Box` })
        Object.assign(box.system, { tier: preview.settings.tier, boxType: preview.settings.type, loot: { gold, items: preview.entries.filter((entry) => entry.checked).map((entry) => finalizeLootItem(entry.item)) } })
      } else if (this.loot.source === 'prepared') {
        preparedSource = this.loot.prepared ? await fromUuid(this.loot.prepared) : null
        const loot = normalizePreparedLoot(preparedSource?.system.loot)
        if (!loot) throw new Error('CRAWLSPACE.Awards.ChoosePrepared')
        let gold = loot.gold
        if (gold && !goldAllowed(loot.tier, floor, loot.type)) {
          const ok = await foundry.applications.api.DialogV2.confirm({ window: { title: t('Title') }, content: `<p>${t('GoldNotAllowed', { gold })}</p>`, rejectClose: false })
          if (!ok) return
          gold = 0
        }
        // Fresh ids, so the same prepared box can be handed out again.
        Object.assign(box, { name: preparedSource.name, img: preparedSource.img })
        Object.assign(box.system, { tier: loot.tier, boxType: loot.type, description: preparedSource.system.description ?? '', loot: { gold, items: loot.items.map((item) => ({ ...item, id: foundry.utils.randomID() })) } })
      } else {
        const quantity = Number(this.loot.quantity)
        if (!this.loot.name.trim() || !Number.isInteger(quantity) || quantity < 1 || quantity > 9999) throw new Error('CRAWLSPACE.Awards.InvalidQuantity')
        const identity = boxIdentity(this.loot.name, lootTypes)
        Object.assign(box, { name: identity.name })
        Object.assign(box.system, { tier: identity.tier, boxType: identity.boxType, quantity, notes: this.loot.notes, loot: null })
      }
      items.push(box)
    }
    let notification = ''
    if (this.achievement.on) {
      const premade = this.achievement.premade ? await fromUuid(this.achievement.premade) : null
      const data = premade ? premade.toObject() : { name: '', type: 'achievement', img: 'icons/svg/trophy.svg', system: {} }
      delete data._id
      const linked = this.achievement.link && box
      const reward = linked ? box.name : this.achievement.reward
      foundry.utils.mergeObject(data, {
        name: this.achievement.name.trim(),
        system: { description: premade && this.achievement.description === plain(premade.system.description) ? premade.system.description : `<p>${foundry.utils.escapeHTML(this.achievement.description)}</p>`, reward },
        flags: { crawlspace: { lootBoxId: linked ? box._id : null } },
      })
      items.push(data)
      notification = t('Notification', { name: sentence(data.name), description: sentence(this.achievement.description), reward: reward || t('None') })
    }
    this.busy = true
    try {
      const created = items.length ? await actor.createEmbeddedDocuments('Item', items, { keepId: true }) : []
      await actor.update({ 'system.details.aiFavor': after.favor, 'system.details.popularity': after.popularity })
      // A world prepared box is marked awarded, like the app's planning marker; compendium copies stay as they are.
      if (preparedSource && !preparedSource.pack && preparedSource.isOwner) await preparedSource.setFlag('crawlspace', 'awardedTo', actor.name)
      await awardMessage(actor, { notification, before, after, box, itemIds: created.map((item: any) => item.id) })
    } finally {
      this.busy = false
    }
    await this.close()
  }
}

/** Loot box items with prepared contents, in the world and in compendia. */
async function preparedBoxes() {
  const boxes: { uuid: string; name: string; summary: string; awarded: boolean }[] = []
  for (const item of game.items) if (item.type === 'lootBox' && normalizePreparedLoot(item.system.loot)) boxes.push(preparedEntry(item))
  for (const pack of game.packs.filter((pack: any) => pack.documentName === 'Item')) {
    const index = await pack.getIndex({ fields: ['type', 'system.loot'] })
    for (const entry of index) if (entry.type === 'lootBox' && normalizePreparedLoot(entry.system?.loot)) boxes.push(preparedEntry({ ...entry, uuid: entry.uuid ?? `Compendium.${pack.collection}.Item.${entry._id}` }))
  }
  return boxes.sort((a, b) => a.name.localeCompare(b.name))
}

function preparedEntry(item: any) {
  const loot = normalizePreparedLoot(item.system.loot)!
  const summary = [`${loot.tier} ${loot.type} (${game.i18n.format('CRAWLSPACE.Loot.FloorN', { floor: loot.floor })})`, loot.gold ? `${loot.gold} ${game.i18n.localize('CRAWLSPACE.Crawler.Gold')}` : '', loot.items.map((entry) => `${entry.name} ×${entry.quantity ?? 1}`).join(', ')]
  return { uuid: item.uuid, name: item.name, summary: summary.filter(Boolean).join(' · '), awarded: !!item.flags?.crawlspace?.awardedTo }
}

/** The award's chat card: the System AI's achievement line, what changed, and a GM Undo. */
async function awardMessage(actor: any, award: { notification: string; before: any; after: any; box: any; itemIds: string[] }) {
  const esc = foundry.utils.escapeHTML
  const lines = [
    award.before.favor !== award.after.favor ? `${t('aiFavor')}: ${award.before.favor} → ${award.after.favor}` : '',
    award.before.popularity !== award.after.popularity ? `${t('popularity')}: ${award.before.popularity} → ${award.after.popularity}` : '',
    award.box ? `${t('BoxAwarded', { name: award.box.name, quantity: award.box.system.quantity })}` : '',
  ].filter(Boolean)
  const content = `<div class="crawl-card award-card">
    <h4 class="card-title"><i class="fa-solid fa-trophy"></i> ${t('TitleFor', { name: esc(actor.name) })}</h4>
    ${award.notification ? `<p class="system-ai">${esc(award.notification)}</p>` : ''}
    <ul>${lines.map((line) => `<li>${esc(line)}</li>`).join('')}</ul>
    <div class="card-buttons"><button type="button" data-crawl-action="undo-award" data-tooltip="${t('UndoHint')}"><i class="fa-solid fa-rotate-left"></i> ${t('Undo')}</button></div>
  </div>`
  return ChatMessage.create({
    content,
    speaker: { alias: game.i18n.localize('CRAWLSPACE.Awards.SystemAI') },
    flags: { crawlspace: { kind: 'award', actorUuid: actor.uuid, before: award.before, after: award.after, itemIds: award.itemIds, boxId: award.box?._id ?? null } },
  })
}

/** Reverse one award (undoCrawlerAward): only while its box is still sealed and its achievement unchanged in name. */
export async function undoAward(message: any) {
  const flags = message.flags.crawlspace
  if (!game.user.isGM || flags.undone) return
  const actor = await fromUuid(flags.actorUuid)
  if (!actor) return
  const box = flags.boxId ? actor.items.get(flags.boxId) : null
  if (flags.boxId && (!box || !box.system.sealed)) return ui.notifications.warn(t('UndoOpened'))
  const details = actor.system.details
  // Unchanged values go back exactly; values changed since then lose only this award's change.
  const favor = Number(details.aiFavor) === flags.after.favor ? flags.before.favor : Number(details.aiFavor) - (flags.after.favor - flags.before.favor)
  const popularity = Number(details.popularity) === flags.after.popularity ? flags.before.popularity : Number(details.popularity) - (flags.after.popularity - flags.before.popularity)
  const ids = flags.itemIds.filter((id: string) => actor.items.has(id))
  if (ids.length) await actor.deleteEmbeddedDocuments('Item', ids)
  await actor.update({ 'system.details.aiFavor': favor, 'system.details.popularity': popularity })
  await message.update({ 'flags.crawlspace.undone': true })
}

/** Open the Awards window for each crawler. */
export async function openAwards(actors: any[]) {
  if (!game.user.isGM) return
  for (const actor of actors) {
    const id = `crawl-awards-${actor.uuid.replace(/\./g, '-')}`
    const open = foundry.applications.instances.get(id)
    if (open) open.render({ force: true })
    else new CrawlerAwards({ actor }).render({ force: true })
  }
}

/** Fill a loot box item's contents ahead of time. */
export function prepareLootBox(box: any) {
  const id = `crawl-awards-${box.uuid.replace(/\./g, '-')}`
  const open = foundry.applications.instances.get(id)
  if (open) return open.render({ force: true })
  return new CrawlerAwards({ box }).render({ force: true })
}
