/**
 * The hotlist and the Actions / Interrupt Actions tables: their configure popups (drop items from the sheet's
 * other tabs, or actions from the Actions packs), and what using an action does.
 */
import { hotlistActions, hotlistSlots, placeInSlot } from '../rules/hotlist'
import { penaltyModifiers, rollCheck } from '../dice/rolls'
import { markForAdvancement } from '../documents/item'
import { STATS, STAT_KEYS } from '../config'

const { HandlebarsApplicationMixin, ApplicationV2, DialogV2 } = foundry.applications.api
const TextEditor = () => foundry.applications.ux.TextEditor.implementation
const t = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(`CRAWLSPACE.${key}`, data) : game.i18n.localize(`CRAWLSPACE.${key}`))

export const ACTION_PACKS: Record<string, string> = { action: 'crawlspace.actions', interrupt: 'crawlspace.interrupt-actions' }

/** The crawler's hotlist as slots, ids only. */
export const hotlistOf = (actor: any) => hotlistSlots(actor._source.system.hotlist?.items ?? [], actor.system.hotlist?.capacity ?? 10)

/** Put an owned item on the hotlist: in `index`, or the first empty slot. */
export async function addToHotlist(actor: any, item: any, index?: number) {
  if (item?.parent !== actor) return ui.notifications.warn(t('Hotlist.OwnedOnly'))
  const slots = hotlistOf(actor)
  const target = index ?? (slots.includes(item.id) ? slots.indexOf(item.id) : slots.indexOf(''))
  if (target < 0) return ui.notifications.warn(t('Warn.HotlistFull', { capacity: slots.length }))
  return actor.update({ 'system.hotlist.items': placeInSlot(slots, slots.length, target, item.id) })
}

/** Add a dropped item to the Actions (or Interrupt Actions) table: an owned item it uses, or a pack action. */
export async function addActionRow(actor: any, item: any, kind: 'action' | 'interrupt') {
  if (!item) return
  const base = { id: foundry.utils.randomID(), kind, name: item.name, img: item.img, sourceId: '', skillId: '', formula: '', notes: '', behavior: '', skills: '' }
  let row
  if (item.type === 'action')
    row = { ...base, notes: item.system.description ?? '', behavior: item.system.behavior ?? '', skills: item.system.skills ?? '', formula: item.system.formula ?? '' }
  else if (item.parent === actor) row = { ...base, sourceId: item.id }
  else return ui.notifications.warn(t('Actions.OwnedOnly'))
  return actor.update({ 'system.sheetActions': [...(actor._source.system.sheetActions ?? []), row] })
}

/** Saved rows of one kind, plus the ones the hotlist adds (its non-attack spells). */
export function actionRowsOf(actor: any) {
  const saved = (actor.system.sheetActions ?? []).map((action: any, index: number) => ({ ...action, kind: action.kind || 'action', index, auto: false }))
  const auto = hotlistActions([...actor.items], hotlistOf(actor)).map((row) => ({ ...row, index: -1 }))
  return [...saved, ...auto]
}

const isHealing = (item: any) => !!(String(item.system?.healing?.formula ?? '').trim() || String(item.system?.healing?.atRank ?? '').trim())

/** Use an action: its item, its behavior (check, Evade, hotlist item, move), its skill, its formula, or post it. */
export async function runAction(actor: any, action: any, options: { fast?: boolean } = {}) {
  const source = action.sourceId ? actor.items.get(action.sourceId) : null
  if (source) return source.use({ fast: options.fast })
  switch (action.behavior) {
    case 'evade':
      return rollCheck(actor, {
        label: `${action.name}`,
        kind: 'evade',
        modifiers: [{ label: game.i18n.localize('CRAWLSPACE.Stat.Evade'), value: Number(actor.system.evade?.total) || 0 }, ...penaltyModifiers(actor)],
        fast: options.fast,
      })
    case 'check':
      return checkAction(actor, action, options)
    case 'hotlist':
    case 'hotlistHealing':
      return useFromHotlist(actor, action.behavior === 'hotlistHealing', options)
    case 'move': {
      const move = Number(actor.system.move?.total ?? actor.system.move?.value) || 0
      const step = Number(actor.system.step?.total ?? actor.system.step?.value) || 0
      return postAction(actor, action, `<p>${t('Actions.MoveCard', { move, step, total: move + step })}</p>`)
    }
  }
  const skill = action.skillId ? actor.items.get(action.skillId) : null
  if (skill) return rollCheck(actor, { label: `${action.name} (${skill.name})`, kind: 'check', modifiers: skill.checkModifiers(), sources: [skill.name], fast: options.fast })
  if (action.formula) {
    const roll = await Roll.create(action.formula, actor.getRollData()).evaluate()
    return roll.toMessage({ speaker: ChatMessage.implementation.getSpeaker({ actor }), flavor: action.name })
  }
  return postAction(actor, action)
}

export function postAction(actor: any, action: any, extra = '') {
  const kind = game.i18n.localize(`CRAWLSPACE.Actions.${action.kind || 'action'}`)
  const content = `<h3>${foundry.utils.escapeHTML(action.name)} <small>(${kind})</small></h3>${action.notes ?? ''}${extra}`
  return ChatMessage.implementation.create({ speaker: ChatMessage.implementation.getSpeaker({ actor }), content })
}

/** A check: the action's preferred skill if the crawler has exactly one of them, else a pick of skills and stats. */
async function checkAction(actor: any, action: any, options: { fast?: boolean }) {
  const preferred = String(action.skills ?? '')
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .filter(Boolean)
  const skills = actor.items.filter((item: any) => item.type === 'skill').sort((a: any, b: any) => a.name.localeCompare(b.name))
  const matches = skills.filter((skill: any) => preferred.includes(skill.name.toLowerCase()))
  let choice = matches.length === 1 ? `skill:${matches[0].id}` : ''
  if (!choice) {
    const option = (value: string, label: string) => `<option value="${value}">${foundry.utils.escapeHTML(label)}</option>`
    const ordered = [...matches, ...skills.filter((skill: any) => !matches.includes(skill))]
    const content = `<label class="crawl-dialog-field"><span>${t('Actions.CheckWith')}</span><select name="check">
      <optgroup label="${t('Tab.skills')}">${ordered.map((skill: any) => option(`skill:${skill.id}`, `${skill.name} (${skill.system.checkBonus >= 0 ? '+' : ''}${skill.system.checkBonus})`)).join('')}</optgroup>
      <optgroup label="${t('Actions.Stats')}">${STAT_KEYS.map((key) => option(`stat:${key}`, STATS[key].label)).join('')}</optgroup>
    </select></label>`
    choice = await DialogV2.prompt({
      window: { title: action.name },
      content,
      ok: { label: t('Roll.Roll'), callback: (_event: Event, button: any) => button.form.querySelector('select[name=check]')?.value ?? '' },
      rejectClose: false,
    })
    if (!choice) return null
  }
  const [type, id] = choice.split(':')
  if (type === 'stat') {
    const key = id as keyof typeof STATS
    return rollCheck(actor, {
      label: `${action.name} (${STATS[key].label})`,
      kind: 'check',
      modifiers: [{ label: STATS[key].label, value: actor.system.attributes[key].mod }, ...penaltyModifiers(actor)],
      sources: [STATS[key].code, STATS[key].label],
      fast: options.fast,
    })
  }
  const skill = actor.items.get(id)
  if (!skill) return null
  const result = await rollCheck(actor, { label: `${action.name} (${skill.name})`, kind: 'check', modifiers: skill.checkModifiers(), sources: [skill.name], fast: options.fast })
  if (result) await markForAdvancement([skill])
  return result
}

/** Use an item on the hotlist (healing ones only for the Interrupt): one choice uses it, several ask. */
async function useFromHotlist(actor: any, healingOnly: boolean, options: { fast?: boolean }) {
  const items = hotlistOf(actor)
    .map((id) => (id ? actor.items.get(id) : null))
    .filter((item: any) => item && !item.system?.broken && (!healingOnly || isHealing(item)))
  if (!items.length) return ui.notifications.warn(t(healingOnly ? 'Hotlist.NoHealing' : 'Hotlist.Nothing'))
  if (items.length === 1) return items[0].use({ fast: options.fast })
  const picked = await DialogV2.wait({
    window: { title: t('Hotlist.UseTitle') },
    content: `<p>${t('Hotlist.UseHint')}</p>`,
    buttons: items.map((item: any, index: number) => ({ action: item.id, label: item.name, icon: '', default: index === 0 })),
    rejectClose: false,
  })
  const item = picked ? actor.items.get(picked) : null
  return item?.use({ fast: options.fast })
}

/** Drop data from an event, as the item it names. */
async function droppedItem(event: DragEvent) {
  const data = TextEditor().getDragEventData(event)
  if (data?.type !== 'Item') return { data, item: null }
  return { data, item: await (Item.implementation as any).fromDropData(data) }
}

/** Shared by both popups: kept on the actor's apps so it re-renders with the actor. */
abstract class ActorPopup extends HandlebarsApplicationMixin(ApplicationV2) {
  actor: any
  constructor(actor: any, options: any = {}) {
    super(options)
    this.actor = actor
  }

  _onFirstRender(context: any, options: any) {
    super._onFirstRender(context, options)
    this.actor.apps[this.id] = this
  }

  _onClose(options: any) {
    super._onClose(options)
    delete this.actor.apps[this.id]
  }

  get editable() {
    return this.actor.isOwner
  }

  /** Native drag and drop: each zone takes drops, the list's rows can be dragged. */
  protected dropZones(selector: string, onDrop: (event: DragEvent, zone: HTMLElement) => unknown) {
    if (!this.editable) return
    for (const zone of (this.element as HTMLElement).querySelectorAll<HTMLElement>(selector)) {
      zone.addEventListener('dragover', (event) => {
        event.preventDefault()
        zone.classList.add('drop-hover')
      })
      zone.addEventListener('dragleave', () => zone.classList.remove('drop-hover'))
      zone.addEventListener('drop', (event) => {
        event.preventDefault()
        event.stopPropagation()
        zone.classList.remove('drop-hover')
        onDrop(event, zone)
      })
    }
  }
}

export class HotlistConfig extends ActorPopup {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'slot-config', 'hotlist-config'],
    position: { width: 380, height: 'auto' },
    window: { resizable: true, icon: 'fa-solid fa-bolt' },
    actions: {
      clearSlot: HotlistConfig.#onClear,
      openItem: HotlistConfig.#onOpen,
    },
  }

  static PARTS = { main: { template: 'systems/crawlspace/templates/apps/hotlist-config.hbs', scrollable: [''] } }

  static open(actor: any) {
    const id = `crawl-hotlist-${actor.uuid.replace(/\./g, '-')}`
    const existing = foundry.applications.instances.get(id)
    if (existing) return existing.render({ force: true })
    return new HotlistConfig(actor, { id }).render({ force: true })
  }

  get title() {
    return `${t('Section.Hotlist')}: ${this.actor.name}`
  }

  async _prepareContext() {
    const slots = hotlistOf(this.actor).map((id, index) => {
      const item = id ? this.actor.items.get(id) : null
      return {
        index,
        number: index + 1,
        item: item
          ? { id: item.id, uuid: item.uuid, name: item.name, img: item.img, type: game.i18n.localize(`TYPES.Item.${item.type}`), quantity: item.system.quantity, broken: !!item.system.broken }
          : null,
      }
    })
    return { slots, editable: this.editable, filled: slots.filter((slot) => slot.item).length }
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    for (const row of (this.element as HTMLElement).querySelectorAll<HTMLElement>('[data-slot][data-uuid]')) {
      row.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'Item', uuid: row.dataset.uuid })))
    }
    this.dropZones('[data-slot]', async (event, zone) => {
      const { item } = await droppedItem(event)
      if (item) await addToHotlist(this.actor, item, Number(zone.dataset.slot))
    })
  }

  static async #onClear(this: HotlistConfig, _event: Event, target: HTMLElement) {
    const slots = hotlistOf(this.actor)
    slots[Number(target.closest<HTMLElement>('[data-slot]')?.dataset.slot)] = ''
    await this.actor.update({ 'system.hotlist.items': slots })
  }

  static #onOpen(this: HotlistConfig, _event: Event, target: HTMLElement) {
    fromUuidSync(target.closest<HTMLElement>('[data-uuid]')?.dataset.uuid ?? '')?.sheet.render(true)
  }
}

export class ActionsConfig extends ActorPopup {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'slot-config', 'actions-config'],
    position: { width: 440, height: 'auto' },
    window: { resizable: true, icon: 'fa-solid fa-person-running' },
    actions: {
      removeAction: ActionsConfig.#onRemove,
      openActionPack: ActionsConfig.#onOpenPack,
    },
  }

  static PARTS = { main: { template: 'systems/crawlspace/templates/apps/actions-config.hbs', scrollable: [''] } }

  static open(actor: any) {
    const id = `crawl-actions-${actor.uuid.replace(/\./g, '-')}`
    const existing = foundry.applications.instances.get(id)
    if (existing) return existing.render({ force: true })
    return new ActionsConfig(actor, { id }).render({ force: true })
  }

  get title() {
    return `${t('Actions.Configure')}: ${this.actor.name}`
  }

  async _prepareContext() {
    const rows = actionRowsOf(this.actor).map((row: any) => {
      const source = row.sourceId ? this.actor.items.get(row.sourceId) : null
      return { ...row, img: row.img || source?.img || 'icons/svg/clockwork.svg', sourceType: source ? game.i18n.localize(`TYPES.Item.${source.type}`) : '' }
    })
    return {
      editable: this.editable,
      groups: ['action', 'interrupt'].map((kind) => ({
        kind,
        label: t(`Actions.${kind}Plural`),
        rows: rows.filter((row: any) => row.kind === kind),
      })),
    }
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    for (const row of (this.element as HTMLElement).querySelectorAll<HTMLElement>('[data-action-index]')) {
      row.addEventListener('dragstart', (event) => event.dataTransfer?.setData('text/plain', JSON.stringify({ type: 'CrawlActionRow', index: Number(row.dataset.actionIndex) })))
    }
    this.dropZones('[data-drop-kind]', async (event, zone) => {
      const kind = zone.dataset.dropKind as 'action' | 'interrupt'
      const data = TextEditor().getDragEventData(event) as any
      // A row dragged from the other table changes tables.
      if (data?.type === 'CrawlActionRow') {
        const rows = foundry.utils.deepClone(this.actor._source.system.sheetActions ?? [])
        if (!rows[data.index] || rows[data.index].kind === kind) return
        rows[data.index].kind = kind
        return this.actor.update({ 'system.sheetActions': rows })
      }
      const { item } = await droppedItem(event)
      return addActionRow(this.actor, item, kind)
    })
  }

  static async #onRemove(this: ActionsConfig, _event: Event, target: HTMLElement) {
    const index = Number(target.closest<HTMLElement>('[data-action-index]')?.dataset.actionIndex)
    const rows = [...(this.actor._source.system.sheetActions ?? [])]
    if (!(index >= 0) || !rows[index]) return
    rows.splice(index, 1)
    await this.actor.update({ 'system.sheetActions': rows })
  }

  static #onOpenPack(this: ActionsConfig, _event: Event, target: HTMLElement) {
    return openActionPack(target.dataset.kind ?? 'action')
  }
}

export function openActionPack(kind: string) {
  const pack = game.packs.get(ACTION_PACKS[kind] ?? ACTION_PACKS.action)
  if (!pack) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NoPack'))
  return pack.render(true)
}
