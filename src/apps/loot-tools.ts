/**
 * The GM's loot tools from Party Upkeep: Auto-loot (autoLoot.ts) and the standalone item generator
 * (lootItemGenerator.ts, LootItemGeneratorDialog.tsx).
 *
 * Auto-loot is a button rather than a session timer: each chosen crawler rolls the GM's chance, and a crawler who
 * gets a box gets a sealed box of a weighted tier and a random type, with its contents rolled by the Awards
 * popup's rules. Slots the catalog can't fill are left out rather than losing the box.
 */
import { lootTiers, lootTypes, tierRules, type LootTier, type LootType } from '../crawlspace-shared/shared/lootData'
import { generateLootEntry, goldAllowed, rollLootGold, eligibleConsumables, eligibleSpells, consumableKey } from '../crawlspace-shared/shared/lootGenerator'
import { gearObjects, generateLootItem, isGearKind, lootItemKinds, potionSubtypes, type LootItemKind } from '../crawlspace-shared/shared/lootItemGenerator'
import { consumableFamily } from '../crawlspace-shared/shared/lootPotions'
import { consumableSpellKind } from '../crawlspace-shared/shared/lootSpells'
import { finalizeLootItem, type InventoryItem } from '../crawlspace-shared/shared/inventoryItems'
import { boxSummary, contextFor, foundryItemData } from '../loot/database'

const t = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(`CRAWLSPACE.AutoLoot.${key}`, data) : game.i18n.localize(`CRAWLSPACE.AutoLoot.${key}`))
const esc = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ''))

/** Box types a random box can take: Earth needs Silver, and Custom, Boss, Quest and the like are the GM's. */
export const AUTO_LOOT_TYPES = lootTypes.filter((type) => !['Earth', 'Custom', 'Benefactor', 'Boss', 'Bounty', 'Quest'].includes(type))

export type AutoLootSettings = { chancePercent: number; weights: Record<LootTier, number>; types: LootType[] }
const DEFAULTS: AutoLootSettings = {
  chancePercent: 10,
  weights: { Bronze: 60, Silver: 25, Gold: 10, Platinum: 4, Legendary: 1, Celestial: 0 },
  types: [...AUTO_LOOT_TYPES],
}

/** A weighted tier (autoLoot.ts pickAutoLootTier). */
export function pickTier(weights: Record<LootTier, number>, rng = Math.random): LootTier | undefined {
  const total = lootTiers.reduce((sum, tier) => sum + Math.max(0, weights[tier] || 0), 0)
  if (total <= 0) return undefined
  let roll = rng() * total
  return lootTiers.find((tier) => (roll -= Math.max(0, weights[tier] || 0)) < 0) ?? lootTiers.at(-1)
}

/** One sealed box's data, its contents already rolled. */
async function autoLootBox(actor: any, tier: LootTier, type: LootType) {
  const rule = tierRules[tier]
  const { context } = await contextFor(actor)
  const settings = { tier, type, mode: 'Random' as const, items: rule.items, consumables: rule.consumables, potions: rule.potions, choices: [] }
  const items: InventoryItem[] = (['item', 'consumable', 'potion'] as const).flatMap((kind) => {
    const count = settings[kind === 'item' ? 'items' : kind === 'consumable' ? 'consumables' : 'potions']
    return Array.from({ length: count }, (_, index) => {
      try {
        return [finalizeLootItem(generateLootEntry(settings, context, kind, index).item)]
      } catch {
        return []
      }
    }).flat()
  })
  const gold = goldAllowed(tier, context.floor, type) ? rollLootGold(tier, context.floor, type) : 0
  return {
    name: `${tier} ${type} Box`,
    type: 'lootBox',
    img: 'icons/svg/chest.svg',
    system: { sealed: true, quantity: 1, tier, boxType: type, notes: t('Notes'), loot: { gold, items } },
  }
}

/** Roll Auto-loot for these crawlers and hand out the boxes. */
export async function runAutoLoot(actors: any[], settings: AutoLootSettings) {
  if (!game.user.isGM) return
  const lines: string[] = []
  for (const actor of actors) {
    const roll = Math.floor(Math.random() * 100)
    if (roll >= settings.chancePercent || !settings.types.length) {
      lines.push(t('Nothing', { name: esc(actor.name) }))
      continue
    }
    const tier = pickTier(settings.weights)
    if (!tier) continue
    const type = settings.types[Math.floor(Math.random() * settings.types.length)]
    const box = await autoLootBox(actor, tier, type)
    await actor.createEmbeddedDocuments('Item', [box])
    lines.push(t('Got', { name: esc(actor.name), box: esc(box.name), contents: esc(boxSummary(box.system.loot).join(', ') || game.i18n.localize('CRAWLSPACE.Loot.Empty')) }))
  }
  await ChatMessage.create({
    content: `<div class="crawl-card auto-loot-card"><h4 class="card-title"><i class="fa-solid fa-gift"></i> ${t('Title')}</h4><p class="hint">${t('Chance', { chance: settings.chancePercent })}</p><ul>${lines.map((line) => `<li>${line}</li>`).join('')}</ul></div>`,
    speaker: { alias: game.i18n.localize('CRAWLSPACE.Awards.SystemAI') },
    whisper: game.users.filter((user: any) => user.isGM).map((user: any) => user.id),
  })
}

/** Ask the chance, tier weights and box types (remembered), then roll for the crawlers. */
export async function openAutoLoot(actors: any[]) {
  if (!game.user.isGM || !actors.length) return
  const saved = { ...DEFAULTS, ...(game.settings.get('crawlspace', 'autoLoot') ?? {}) } as AutoLootSettings
  const content = `<p class="hint">${t('Hint', { names: actors.map((actor) => esc(actor.name)).join(', ') })}</p>
    <section class="auto-loot-section">
      <h4>${t('ChanceLabel')}</h4>
      <div class="auto-loot-chance"><input type="range" name="chanceSlider" min="0" max="100" step="1" value="${saved.chancePercent}"><input type="number" name="chance" min="0" max="100" step="1" value="${saved.chancePercent}"><span>%</span></div>
    </section>
    <section class="auto-loot-section">
      <h4>${t('Weights')}</h4>
      <div class="auto-loot-weights">${lootTiers
        .map((tier) => `<label><span>${tier}</span><input type="number" name="weight-${tier}" min="0" step="1" value="${saved.weights[tier] ?? 0}"></label>`)
        .join('')}</div>
    </section>
    <section class="auto-loot-section">
      <h4>${t('Types')}<span class="auto-loot-all"><a data-auto-loot-all="1">${t('All')}</a> · <a data-auto-loot-all="0">${t('None')}</a></span></h4>
      <div class="auto-loot-types">${AUTO_LOOT_TYPES.map(
        (type) => `<label><input type="checkbox" name="type" value="${esc(type)}" ${saved.types.includes(type) ? 'checked' : ''}><span>${esc(type)}</span></label>`,
      ).join('')}</div>
    </section>`
  const settings = await foundry.applications.api.DialogV2.prompt({
    classes: ['crawlspace', 'auto-loot-dialog'],
    position: { width: 520 },
    window: { title: t('Title'), resizable: true },
    content,
    rejectClose: false,
    render: (_event: Event, dialog: any) => {
      const root = dialog.element as HTMLElement
      const slider = root.querySelector<HTMLInputElement>('[name=chanceSlider]')
      const number = root.querySelector<HTMLInputElement>('[name=chance]')
      slider?.addEventListener('input', () => number && (number.value = slider.value))
      number?.addEventListener('input', () => slider && (slider.value = number.value))
      for (const link of root.querySelectorAll<HTMLElement>('[data-auto-loot-all]'))
        link.addEventListener('click', () => {
          for (const box of root.querySelectorAll<HTMLInputElement>('[name=type]')) box.checked = link.dataset.autoLootAll === '1'
        })
    },
    ok: {
      label: t('Roll'),
      icon: 'fa-solid fa-dice',
      callback: (_event: Event, button: any) => {
        const form = button.form
        const number = (name: string) => Math.max(0, Math.floor(Number(form.elements[name]?.value) || 0))
        return {
          chancePercent: Math.min(100, number('chance')),
          weights: Object.fromEntries(lootTiers.map((tier) => [tier, number(`weight-${tier}`)])) as Record<LootTier, number>,
          types: [...form.querySelectorAll('[name=type]:checked')].map((input: any) => input.value as LootType),
        }
      },
    },
  })
  if (!settings) return
  await game.settings.set('crawlspace', 'autoLoot', settings)
  await runAutoLoot(actors, settings)
}

/* -------------------------------------------- */
/*  Item generator                              */
/* -------------------------------------------- */

const { ApplicationV2 } = foundry.applications.api

/** One item rolled with a loot box slot's rules, for a crawler or the Items directory. */
export class ItemGenerator extends ApplicationV2 {
  [key: string]: any
  static DEFAULT_OPTIONS: any = {
    id: 'crawl-item-generator',
    classes: ['crawlspace', 'item-generator'],
    tag: 'form',
    window: { title: 'CRAWLSPACE.Generator.Title', icon: 'fa-solid fa-wand-sparkles', resizable: true },
    position: { width: 520, height: 'auto' },
    form: { submitOnChange: false, closeOnSubmit: false },
  }

  tier: LootTier = 'Silver'
  floor = 1
  kind: LootItemKind = lootItemKinds[0]
  subtype = ''
  item: InventoryItem | null = null
  rolls: string[] = []
  error = ''
  context: any = null

  async #context() {
    this.context = (await contextFor(null, this.floor)).context
    return this.context
  }

  #subtypes(context: any): { value: string; label: string }[] {
    const kind = this.kind
    if (isGearKind(kind)) return gearObjects(kind).map((object) => ({ value: object.name, label: object.name }))
    if (kind === 'Potion') return potionSubtypes
    if (kind === 'Skill Potion') return context.skills.map((skill: any) => ({ value: skill.name, label: skill.name }))
    if (kind === 'Scroll' || kind === 'Tome') return eligibleSpells(context, this.tier, kind === 'Scroll' ? 'scroll' : 'tome').map((spell: any) => ({ value: spell.name, label: spell.name }))
    return eligibleConsumables(context, this.tier)
      .filter((content: any) => !consumableSpellKind(content) && consumableFamily(content) === 'other')
      .map((content: any) => ({ value: consumableKey(content), label: content.name }))
  }

  async _renderHTML() {
    const context = await this.#context()
    const subtypes = this.#subtypes(context)
    const option = (value: string, label: string, selected: boolean) => `<option value="${esc(value)}" ${selected ? 'selected' : ''}>${esc(label)}</option>`
    const crawlers = game.actors.filter((actor: any) => actor.type === 'crawler')
    const item = this.item
    return `<div class="generator-rules">
        <label>${game.i18n.localize('CRAWLSPACE.Generator.Tier')}<select name="tier">${lootTiers.map((tier) => option(tier, tier, tier === this.tier)).join('')}</select></label>
        <label>${game.i18n.localize('CRAWLSPACE.Generator.Floor')}<input type="number" name="floor" min="1" step="1" value="${this.floor}"></label>
        <label>${game.i18n.localize('CRAWLSPACE.Generator.Kind')}<select name="kind">${lootItemKinds.map((kind) => option(kind, kind, kind === this.kind)).join('')}</select></label>
        <label>${game.i18n.localize('CRAWLSPACE.Generator.Subtype')}<select name="subtype">${option('', game.i18n.localize('CRAWLSPACE.Generator.Random'), !this.subtype)}${subtypes.map((entry) => option(entry.value, entry.label, entry.value === this.subtype)).join('')}</select></label>
      </div>
      <button type="button" data-action="generate"><i class="fa-solid fa-dice"></i> ${game.i18n.localize('CRAWLSPACE.Generator.Generate')}</button>
      ${this.error ? `<p class="notification error">${esc(this.error)}</p>` : ''}
      ${
        item
          ? `<section class="generator-result">
        <h3>${esc(item.name)}</h3>
        ${(item as any).notes ? `<p class="hint">${esc((item as any).notes)}</p>` : ''}
        ${(item as any).description ? `<p>${esc((item as any).description)}</p>` : ''}
        ${this.rolls.length ? `<details><summary>${game.i18n.localize('CRAWLSPACE.Generator.Rolls')}</summary><ul>${this.rolls.map((roll) => `<li>${esc(roll)}</li>`).join('')}</ul></details>` : ''}
        <div class="generator-give">
          <select name="recipient">${option('', game.i18n.localize('CRAWLSPACE.Generator.ToDirectory'), true)}${crawlers.map((actor: any) => option(actor.id, actor.name, false)).join('')}</select>
          <button type="button" data-action="create"><i class="fa-solid fa-plus"></i> ${game.i18n.localize('CRAWLSPACE.Generator.Create')}</button>
        </div>
      </section>`
          : ''
      }`
  }

  _replaceHTML(result: string, content: HTMLElement) {
    content.innerHTML = result
  }

  _onRender(context: any, options: any) {
    super._onRender(context, options)
    const root = this.element as HTMLElement
    root.querySelectorAll<HTMLInputElement>('[name=tier], [name=floor], [name=kind], [name=subtype]').forEach((input) =>
      input.addEventListener('change', () => {
        const value = input.value
        if (input.name === 'tier') this.tier = value as LootTier
        if (input.name === 'floor') this.floor = Math.max(1, Math.floor(Number(value) || 1))
        if (input.name === 'kind') {
          this.kind = value as LootItemKind
          this.subtype = ''
        }
        if (input.name === 'subtype') return void (this.subtype = value)
        this.render()
      }),
    )
    root.querySelector('[data-action=generate]')?.addEventListener('click', () => this.#generate())
    root.querySelector('[data-action=create]')?.addEventListener('click', () => this.#create())
  }

  async #generate() {
    try {
      const entry = generateLootItem({ tier: this.tier, kind: this.kind, subtype: this.subtype }, this.context ?? (await this.#context()))
      this.item = finalizeLootItem(entry.item)
      this.rolls = entry.rolls
      this.error = ''
    } catch (error: any) {
      this.item = null
      this.error = error?.message ?? String(error)
    }
    this.render()
  }

  async #create() {
    if (!this.item) return
    const recipient = (this.element as HTMLElement).querySelector<HTMLSelectElement>('[name=recipient]')?.value
    const data = foundryItemData({ ...foundry.utils.deepClone(this.item), id: foundry.utils.randomID() } as any)
    const actor = recipient ? game.actors.get(recipient) : null
    const [created] = actor ? await actor.createEmbeddedDocuments('Item', [data]) : await Item.implementation.createDocuments([data])
    ui.notifications.info(game.i18n.format('CRAWLSPACE.Generator.Created', { name: created?.name ?? data.name, where: actor?.name ?? game.i18n.localize('CRAWLSPACE.Generator.Directory') }))
  }
}

export function openItemGenerator() {
  if (!game.user.isGM) return
  const open = foundry.applications.instances.get('crawl-item-generator')
  if (open) return open.render({ force: true })
  return new ItemGenerator().render({ force: true })
}

export function registerLootTools() {
  game.settings.register('crawlspace', 'autoLoot', { scope: 'world', config: false, type: Object, default: DEFAULTS })
  // The generator also sits at the foot of the Items directory.
  Hooks.on('renderItemDirectory', (_app: any, html: HTMLElement) => {
    if (!game.user.isGM || html.querySelector('[data-crawl-generator]')) return
    const footer = html.querySelector('.directory-footer') ?? html
    const button = document.createElement('button')
    button.type = 'button'
    button.dataset.crawlGenerator = ''
    button.innerHTML = `<i class="fa-solid fa-wand-sparkles"></i> ${game.i18n.localize('CRAWLSPACE.Generator.Title')}`
    button.addEventListener('click', () => openItemGenerator())
    footer.append(button)
  })
}
