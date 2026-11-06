import { registerLootTools } from './apps/loot-tools'
import { createAuraBehavior, registerAreas } from './effects/areas'
import { CrawlRoll } from './dice/crawl-roll'
import { openGrinding } from './apps/grinding'
import { openAwards } from './apps/awards'
import { registerImmunity } from './effects/immunity'
import { openTime, registerClock, registerTimePickers } from './apps/time'
import { registerFrames } from './apps/frames'
import { registerConditionDrops } from './effects/use-conditions'
import { createTokenHUD } from './effects/stacks'
import { advanceTime, settleTime, registerTime } from './time'
import * as config from './config'
import { CompanionData, CrawlerData, MinionData, MobData, NpcData } from './data/actors'
import { registerMinions } from './actors/minions'
import { registerLight } from './actors/light'
import { groupActorDirectory, registerCompanions } from './actors/companions'
import { openBuilder, registerBuilder } from './apps/builder'
import { registerDatabaseRows } from './loot/database'
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
import { registerUpkeep, openUpkeep, rest, performUpkeep } from './apps/upkeep'

const TEMPLATES = [
  'chat/card-footer',
  'dialogs/time',
  'dialogs/time-fields',
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
  CONFIG.time.turnTime = 0
  CONFIG.time.worldCalendarConfig = foundry.utils.deepClone(CONFIG.time.worldCalendarConfig)
  CONFIG.time.worldCalendarConfig.days.hoursPerDay = 30

  // Documents and data models.
  CONFIG.Actor.documentClass = CrawlActor
  CONFIG.Item.documentClass = CrawlItem
  CONFIG.Combat.documentClass = CrawlCombat
  Object.assign(CONFIG.Actor.dataModels, { crawler: CrawlerData, mob: MobData, minion: MinionData, companion: CompanionData, npc: NpcData })
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
  // Auras and dreads: a Region behavior handing conditions to the tokens inside.
  CONFIG.RegionBehavior.dataModels.aura = createAuraBehavior()
  CONFIG.RegionBehavior.typeLabels.aura = 'CRAWLSPACE.Aura.Label'
  CONFIG.RegionBehavior.typeIcons.aura = 'fa-solid fa-sun'
  Object.assign(CONFIG.Actor.trackableAttributes, {
    crawler: { bar: ['healthBar', 'mana'], value: ['evade.total', 'dr.total'] },
    mob: { bar: ['healthBar'], value: ['evade.total', 'dr.total'] },
    minion: { bar: ['healthBar'], value: ['evade.total', 'dr.total'] },
    companion: { bar: ['healthBar'], value: ['evade.total', 'dr.total'] },
  })

  // ActiveEffects: CrawlSpace condition fields on every effect, plus the crawlspace.* change types.
  CONFIG.ActiveEffect.dataModels.base = createEffectDataModel()
  Object.assign(CONFIG.ActiveEffect.changeTypes, CHANGE_TYPE_HANDLERS)
  CONFIG.ActiveEffect.expiryEvents.cleanUp = 'CRAWLSPACE.Combat.CleanUpExpiry'
  // A condition whose time runs out is removed (core only marks it expired).
  CONFIG.ActiveEffect.expiryAction = 'delete'
  for (const event of ['safeRoom', 'longRest', 'leaveFloor', 'healed']) CONFIG.ActiveEffect.expiryEvents[event] = `CRAWLSPACE.Time.Event.${event}`

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
  CONFIG.Token.hudClass = createTokenHUD()
  // The status palette shows stacks, so it redraws when they change.
  Hooks.on('updateActiveEffect', (effect: any) => {
    const hud = canvas?.hud?.token
    if (hud?.rendered && hud.actor && hud.actor === effect.parent) hud.render()
  })
  const sheets = foundry.applications.apps.DocumentSheetConfig
  sheets.registerSheet(Actor, 'crawlspace', CrawlerSheet, { types: ['crawler'], makeDefault: true, label: 'CRAWLSPACE.Sheet.Crawler' })
  sheets.registerSheet(Actor, 'crawlspace', MobSheet, { types: ['mob', 'minion', 'companion'], makeDefault: true, label: 'CRAWLSPACE.Sheet.Mob' })
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
  registerMinions()
  registerLight()
  registerCompanions()
  registerBuilder()
  registerDatabaseRows()
  registerChatHandlers()
  CONFIG.Dice.rolls.unshift(CrawlRoll)
  registerClock()
  registerTimePickers()
  registerFrames()
  registerConditionDrops()
  registerAreas()
  registerUpkeep()
  registerLootTools()

  game.crawlspace = { config, openGrinding, openAwards, openBuilder, performUpkeep, openTime, advanceTime, settleTime, rest, importCharacter, openUpkeep, fillActorDamage, declareAttack: () => game.combat && promptDeclaration(game.combat) }
})

Hooks.once('ready', () => {
  registerSocket()
  registerTime()
  registerImmunity()
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

/** Actors directory gets "Build a crawler" and "Import CrawlSpace character" buttons. */
Hooks.on('renderActorDirectory', (_app: any, html: HTMLElement) => {
  groupActorDirectory(html)
  // Every user may build a crawler; a player without actor creation sends it to the GM.
  if (!html.querySelector('.crawlspace-builder')) {
    const build = document.createElement('button')
    build.type = 'button'
    build.className = 'crawlspace-builder'
    build.innerHTML = `<i class="fa-solid fa-user-plus"></i> ${game.i18n.localize('CRAWLSPACE.Builder.Button')}`
    build.addEventListener('click', () => openBuilder())
    html.querySelector('.header-actions')?.append(build)
  }
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
