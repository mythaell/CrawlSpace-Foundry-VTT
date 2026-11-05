import * as config from './config'
import { CrawlerData, MobData, NpcData } from './data/actors'
import * as items from './data/items'
import { createEffectDataModel } from './data/effect'
import { CHANGE_TYPE_HANDLERS } from './effects/change-types'
import { CrawlActor } from './documents/actor'
import { CrawlItem } from './documents/item'
import { CrawlCombat, promptDeclaration } from './combat/combat'
import { createCombatTracker } from './combat/tracker'
import { CrawlerSheet, MobSheet, NpcSheet } from './sheets/actor-sheets'
import { CrawlItemSheet } from './sheets/item-sheet'
import { CrawlEffectSheet } from './sheets/effect-sheet'
import { DEBUFFS } from './rules/debuffs'
import { registerSocket } from './socket'
import { registerChatHandlers } from './chat/cards'
import { characterToActor } from './import/convert'
import { fillActorDamage, fillDamageData } from './import/fill-damage'
import { openUpkeep } from './apps/upkeep'

const TEMPLATES = [
  'actor/crawler-sidebar',
  'actor/crawler-header',
  'actor/crawler-tabs',
  'actor/crawler-character',
  'actor/crawler-actions',
  'actor/crawler-skills',
  'actor/crawler-spells',
  'actor/crawler-inventory',
  'actor/crawler-abilities',
  'actor/crawler-biography',
  'actor/effects',
  'actor/item-row',
  'actor/filter-bar',
  'actor/mob-sidebar',
  'actor/mob-header',
  'actor/mob-main',
  'actor/mob-description',
  'actor/npc-sidebar',
  'actor/npc-header',
  'actor/npc',
  'actor/npc-notes',
  'sheets/pf-tabs',
  'sheets/ids',
  'effects/rules',
  'effects/effect-sheet',
  'dialogs/row-config',
  'item/header',
  'item/summary',
  'item/description',
  'item/details',
  'item/effects',
  'chat/check',
  'chat/attack',
  'chat/damage',
  'chat/declaration',
  'chat/health-change',
  'chat/item',
  'dialogs/roll-check',
  'dialogs/declare',
  'combat/phases',
].map((path) => `systems/crawlspace/templates/${path}.hbs`)

Hooks.once('init', () => {
  console.log('CrawlSpace | Initializing')
  CONFIG.CRAWLSPACE = config
  // A CrawlSpace round is 10 seconds of game time (regen effects count in it).
  CONFIG.time.roundTime = 10

  // Documents and data models.
  CONFIG.Actor.documentClass = CrawlActor
  CONFIG.Item.documentClass = CrawlItem
  CONFIG.Combat.documentClass = CrawlCombat
  Object.assign(CONFIG.Actor.dataModels, { crawler: CrawlerData, mob: MobData, npc: NpcData })
  Object.assign(CONFIG.Item.dataModels, {
    skill: items.SkillData,
    spell: items.SpellData,
    weapon: items.WeaponData,
    equipment: items.EquipmentData,
    consumable: items.ConsumableData,
    tattoo: items.TattooData,
    loot: items.LootData,
    lootBox: items.LootBoxData,
    ability: items.AbilityData,
    race: items.RaceData,
    class: items.ClassData,
    background: items.BackgroundData,
    achievement: items.AchievementData,
    trap: items.TrapData,
  })
  Object.assign(CONFIG.Actor.trackableAttributes, {
    crawler: { bar: ['healthBar', 'mana'], value: ['evade.total', 'dr.total'] },
    mob: { bar: ['healthBar'], value: ['evade.total', 'dr.total'] },
  })

  // ActiveEffects: CrawlSpace condition fields on every effect, plus the crawlspace.* change types.
  CONFIG.ActiveEffect.dataModels.base = createEffectDataModel()
  Object.assign(CONFIG.ActiveEffect.changeTypes, CHANGE_TYPE_HANDLERS)
  CONFIG.ActiveEffect.expiryEvents.cleanUp = 'CRAWLSPACE.Combat.CleanUpExpiry'

  // The 27 standard debuffs replace core's status list; "dead" stays for defeated tokens.
  const dead = CONFIG.statusEffects.find((status: any) => status.id === 'dead')
  CONFIG.statusEffects.length = 0
  for (const debuff of DEBUFFS) {
    CONFIG.statusEffects.push({
      id: debuff.id,
      name: debuff.name,
      img: `systems/crawlspace/assets/debuffs/${debuff.id}.png`,
      description: `<p>${debuff.effect}</p><p><em>${debuff.duration}</em></p>`,
      duration: debuff.durationSeconds ? { value: debuff.durationSeconds, units: 'seconds' } : undefined,
      system: {
        conditionType: 'debuff',
        stacks: 1,
        cleanup: debuff.cleanup ?? { formula: '', types: [] },
        durationText: debuff.duration,
      },
    })
  }
  if (dead) CONFIG.statusEffects.push(dead)

  // UI.
  CONFIG.ui.combat = createCombatTracker()
  const sheets = foundry.applications.apps.DocumentSheetConfig
  sheets.registerSheet(Actor, 'crawlspace', CrawlerSheet, { types: ['crawler'], makeDefault: true, label: 'CRAWLSPACE.Sheet.Crawler' })
  sheets.registerSheet(Actor, 'crawlspace', MobSheet, { types: ['mob'], makeDefault: true, label: 'CRAWLSPACE.Sheet.Mob' })
  sheets.registerSheet(Actor, 'crawlspace', NpcSheet, { types: ['npc'], makeDefault: true, label: 'CRAWLSPACE.Sheet.Npc' })
  sheets.registerSheet(Item, 'crawlspace', CrawlItemSheet, { makeDefault: true, label: 'CRAWLSPACE.Sheet.Item' })
  sheets.registerSheet(ActiveEffect, 'crawlspace', CrawlEffectSheet, { makeDefault: true, label: 'CRAWLSPACE.Sheet.Effect' })

  CONFIG.Combat.initiative = { formula: '1d20', decimals: 0 }

  game.settings.register('crawlspace', 'autoAdvancePhase', {
    name: 'CRAWLSPACE.Settings.AutoAdvance.Name',
    hint: 'CRAWLSPACE.Settings.AutoAdvance.Hint',
    scope: 'world',
    config: true,
    type: Boolean,
    default: true,
  })

  registerHandlebarsHelpers()
  foundry.applications.handlebars.loadTemplates(TEMPLATES)
  registerChatHandlers()

  game.crawlspace = { config, importCharacter, openUpkeep, fillActorDamage, declareAttack: () => game.combat && promptDeclaration(game.combat) }
})

Hooks.once('ready', () => {
  registerSocket()
})

/**
 * Game time passing (combat rounds or the GM's clock) ticks mana and health regeneration. The active GM's
 * client does it once, for world actors and the unlinked tokens on the viewed scene.
 */
Hooks.on('updateWorldTime', async (_worldTime: number, delta: number) => {
  if (!game.user.isActiveGM || !(delta > 0)) return
  const actors = new Set<any>(game.actors)
  for (const token of canvas?.scene?.tokens ?? []) if (!token.actorLink && token.actor) actors.add(token.actor)
  for (const actor of actors) await actor.regenerate?.(delta).catch?.((error: unknown) => console.error('CrawlSpace | regen', error))
})

/** Dragging an owned item to the hotbar makes a macro that uses it. */
Hooks.on('hotbarDrop', (_bar: any, data: any, slot: number) => {
  if (data.type !== 'Item') return
  createItemMacro(data, slot)
  return false
})

async function createItemMacro(data: any, slot: number) {
  const item = await fromUuid(data.uuid)
  if (!item?.actor) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.MacroOwned'))
  const command = `const item = await fromUuid(${JSON.stringify(item.uuid)});\nif (item) item.use({ fast: event?.shiftKey });`
  let macro = game.macros.find((entry: any) => entry.name === item.name && entry.command === command)
  macro ??= await foundry.documents.Macro.implementation.create({ name: item.name, type: 'script', img: item.img, command, flags: { crawlspace: { itemMacro: true } } })
  game.user.assignHotbarMacro(macro, slot)
}

/** Actors directory gets an "Import CrawlSpace character" button. */
Hooks.on('renderActorDirectory', (_app: any, html: HTMLElement) => {
  if (!game.user.can('ACTOR_CREATE') || html.querySelector('.crawlspace-import')) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'crawlspace-import'
  button.innerHTML = `<i class="fa-solid fa-file-import"></i> ${game.i18n.localize('CRAWLSPACE.Import.Character')}`
  button.addEventListener('click', () => pickCharacterFile())
  html.querySelector('.header-actions')?.append(button)
})

function pickCharacterFile() {
  const input = document.createElement('input')
  input.type = 'file'
  input.accept = '.json,application/json'
  input.addEventListener('change', async () => {
    const file = input.files?.[0]
    if (!file) return
    try {
      await importCharacter(JSON.parse(await file.text()))
    } catch (error: any) {
      ui.notifications.error(game.i18n.format('CRAWLSPACE.Import.Failed', { error: error.message }))
    }
  })
  input.click()
}

/** Import a CrawlSpace character backup (one character, or the export wrapper with several). */
export async function importCharacter(json: any) {
  const entries = Array.isArray(json?.characters) ? json.characters : Array.isArray(json) ? json : [json]
  const created: any[] = []
  for (const entry of entries) {
    const data = characterToActor(entry)
    await fillDamageData(data.items ?? [])
    const actor = await Actor.implementation.create(data, { keepEmbeddedIds: true })
    if (actor) created.push(actor)
  }
  ui.notifications.info(game.i18n.format('CRAWLSPACE.Import.Done', { count: created.length }))
  if (created.length === 1) created[0].sheet.render(true)
  return created
}

function registerHandlebarsHelpers() {
  Handlebars.registerHelper('crawlSigned', (value: unknown) => {
    const number = Number(value) || 0
    return number >= 0 ? `+${number}` : `${number}`
  })
  Handlebars.registerHelper('crawlEq', (a: unknown, b: unknown) => a === b)
  Handlebars.registerHelper('crawlJoin', (value: unknown, separator: unknown) =>
    Array.isArray(value) || value instanceof Set ? [...(value as any)].join(typeof separator === 'string' ? separator : ', ') : '',
  )
  Handlebars.registerHelper('crawlLower', (value: unknown) => String(value ?? '').toLowerCase())
  Handlebars.registerHelper('crawlNumberOrBlank', (value: unknown) => (value === null || value === undefined ? '' : value))
}
