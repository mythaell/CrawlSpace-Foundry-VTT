/**
 * Character builder (CharacterBuilder.tsx, characterBuilder.ts). Six steps: backgrounds, combat, stats, story,
 * starting gear and a recap. The CrawlSpace rules build the sheet; the backup importer turns it into a crawler.
 *
 * CrawlSpace's server rolls and logs builder stats. Here every stat roll is a Foundry roll posted to chat, and
 * a player's finished crawler is created by the active GM's client, which checks the choices again and checks
 * each rolled stat against that player's latest roll message for it.
 */
import { buildCrawler, builderBackgroundOptions, builderCombatOptions, newBuilderDraft, validateBuilderStep, type BuilderCatalogEntry, type BuilderDraft } from '../crawlspace-shared/shared/characterBuilder'
import { bookStories, builderStages, builderStoryKeys, type BuilderStage } from '../crawlspace-shared/shared/characterBuilderCatalog'
import { attributes } from '../crawlspace-shared/shared/characterSheetModel'
import { getAttributeModifier } from '../crawlspace-shared/shared/characterSheetRules'
import { crawlerEvade } from '../crawlspace-shared/shared/crawlerEvade'
import { databaseRows } from '../loot/database'
import { characterToActor } from '../import/convert'
import { fillDamageData } from '../import/fill-damage'

const { HandlebarsApplicationMixin, ApplicationV2 } = foundry.applications.api

/** The builder draft plus the chat message that rolled each stat (roll mode). */
export type Draft = BuilderDraft & { rollMessages: string[] }

const STEPS = ['Background', 'Combat', 'Stats', 'Story', 'Gear', 'Recap']
const STAGE_RANKS = [1, 1, 3, 2]
const STORY_LABELS: Record<string, string> = { pastTrauma: 'PastTrauma', looseEnds: 'LooseEnd', regrets: 'Regret' }
const t = (key: string, data?: Record<string, unknown>) => (data ? game.i18n.format(`CRAWLSPACE.Builder.${key}`, data) : game.i18n.localize(`CRAWLSPACE.Builder.${key}`))
const pick = <T>(options: T[]) => options[Math.floor(Math.random() * options.length)]

/** Builder rows: every compendium and world record, typed as the CrawlSpace catalog. */
const catalogRows = async () => (await databaseRows()) as unknown as BuilderCatalogEntry[]

/** Roll the given stats (1d6, rerolling 1s) as one chat message; returns its id and the new values. */
async function rollStats(indexes: number[], name: string) {
  const rolls = await Promise.all(indexes.map(() => new Roll('1d6rr1').evaluate()))
  const values = Object.fromEntries(indexes.map((index, at) => [index, String(rolls[at].total)]))
  const lines = indexes.map((index, at) => `<li><strong>${attributes[index].code}</strong> ${rolls[at].total}</li>`).join('')
  const message = await ChatMessage.create({
    speaker: { alias: name || game.user.name },
    content: `<div class="crawl-card builder-roll"><h4 class="card-title"><i class="fa-solid fa-dice"></i> ${t('StatRoll', { name: foundry.utils.escapeHTML(name || game.user.name) })}</h4><ul>${lines}</ul></div>`,
    rolls,
    flags: { crawlspace: { builderStats: values } },
  })
  return { id: message?.id ?? '', values }
}

/** Every rolled stat must equal that user's roll message for it. */
function checkRolls(draft: Draft, user: any) {
  if (draft.statMode !== 'roll') return
  draft.stats.forEach((value, index) => {
    const message = game.messages.get(draft.rollMessages?.[index] ?? '')
    const rolled = message?.flags?.crawlspace?.builderStats?.[index]
    if (!message || message.author?.id !== user.id || rolled !== value) throw new Error(t('RollMismatch', { stat: attributes[index].code }))
  })
}

/** Build and create the crawler. Runs on the GM's client for players. */
export async function createBuiltCrawler(draft: Draft, userId: string) {
  const user = game.users.get(userId)
  if (!user) throw new Error(t('NoUser'))
  const rows = await catalogRows()
  const sheet = buildCrawler(draft, rows)
  if (!user.isGM) checkRolls(draft, user)
  const data: any = characterToActor({ data: sheet, name: sheet.character.name })
  await fillDamageData(data.items ?? [])
  data.ownership = { default: CONST.DOCUMENT_OWNERSHIP_LEVELS.NONE, [user.id]: CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER }
  foundry.utils.setProperty(data, 'flags.crawlspace.builder', { userId: user.id, statMode: draft.statMode, rollMessages: draft.statMode === 'roll' ? draft.rollMessages : [] })
  const actor = await Actor.implementation.create(data, { keepEmbeddedIds: true })
  if (actor && !user.isGM && !user.character) await user.update({ character: actor.id })
  return actor
}

export class CharacterBuilder extends HandlebarsApplicationMixin(ApplicationV2) {
  static DEFAULT_OPTIONS: any = {
    id: 'crawl-character-builder',
    tag: 'form',
    classes: ['crawlspace', 'character-builder'],
    position: { width: 680, height: 'auto' },
    window: { title: 'CRAWLSPACE.Builder.Title', resizable: true, icon: 'fa-solid fa-user-plus' },
    form: { submitOnChange: true, closeOnSubmit: false, handler: CharacterBuilder.#onChange },
    actions: {
      step: CharacterBuilder.#onStep,
      next: CharacterBuilder.#onNext,
      back: CharacterBuilder.#onBack,
      rollBackground: CharacterBuilder.#onRollBackground,
      rollStats: CharacterBuilder.#onRollStats,
      rollStory: CharacterBuilder.#onRollStory,
    },
  }

  static PARTS = {
    form: { template: 'systems/crawlspace/templates/apps/builder.hbs', scrollable: ['.builder-body'] },
  }

  draft: Draft = { ...newBuilderDraft(), rollMessages: [] }
  rows: BuilderCatalogEntry[] = []
  loading = true
  loadError = ''
  error = ''
  busy = false
  step = 0

  async _prepareContext(options: any) {
    const context: any = await super._prepareContext(options)
    if (this.loading) {
      this.loading = false
      try {
        this.rows = await catalogRows()
      } catch (error: any) {
        this.loadError = error.message
      }
    }
    const draft = this.draft
    const labels = draft.species === 'animal' ? ['Youth', 'Training', 'Adult', 'Quirk'] : ['Childhood', 'Adolescence', 'Career', 'Hobby']
    const combats = builderCombatOptions(this.rows)
    const combat = combats.find((item) => item.name === draft.combat)
    Object.assign(context, {
      draft,
      step: this.step,
      stepKey: STEPS[this.step],
      stepNumber: this.step + 1,
      stepCount: STEPS.length,
      last: this.step === STEPS.length - 1,
      busy: this.busy,
      error: this.error,
      loadError: this.loadError,
      steps: STEPS.map((key, index) => ({ index, number: index + 1, label: t(`Step.${key}`), current: index === this.step })),
      isAnimal: draft.species === 'animal',
      baseAttack: draft.species === 'human' ? 'Unarmed Combat' : 'Slice Attack',
      combat,
      combatGroups: (['weapon', 'unarmed', 'spell'] as const).map((kind) => ({
        label: t(`Combat.${kind}`),
        options: combats.filter((item) => item.kind === kind).map((item) => ({ value: item.name, label: `${item.name}${item.homebrew ? ` (${t('Homebrew')})` : ''}`, selected: item.name === draft.combat })),
      })),
    })
    if (this.step === 0)
      context.stages = builderStages.map((stage, index) => {
        const options = builderBackgroundOptions(this.rows, draft.species, stage)
        const selected = draft.backgrounds[stage]
        const option = options.find((item) => item.name === selected.name)
        const others = builderStages.filter((key) => key !== stage).flatMap((key) => draft.backgrounds[key].skills)
        return {
          stage,
          label: labels[index],
          rank: STAGE_RANKS[index],
          options: options.map((item) => ({ value: item.name, label: `${item.name}${item.homebrew ? ` (${t('Homebrew')})` : ''}`, selected: item.name === selected.name })),
          skills: (option?.skills ?? []).map((name, skillIndex) => {
            const checked = selected.skills.includes(name)
            return { name, index: skillIndex, checked, taken: others.includes(name), disabled: !checked && (selected.skills.length >= 2 || others.includes(name)) }
          }),
        }
      })
    if (this.step === 2)
      context.stats = attributes.map((attribute, index) => ({ index, code: attribute.code, name: attribute.name, value: draft.stats[index], choices: [2, 3, 4, 5, 6].map(String) }))
    if (this.step === 3)
      context.stories = builderStoryKeys.map((key) => {
        const options = this.storyOptions(key)
        return { key, label: t(`Story.${STORY_LABELS[key]}`), options: options.map((value) => ({ value, selected: value === draft.story[key] })), text: draft.story[key] }
      })
    if (this.step === 5) context.recap = this.recap(labels)
    return context
  }

  storyOptions(key: (typeof builderStoryKeys)[number]) {
    return [
      ...bookStories[key],
      ...this.rows
        .filter((entry) => entry.content_type === 'reference_table' && entry.data.builderStory === key)
        .flatMap((entry) => (Array.isArray(entry.data.rows) ? entry.data.rows.map((row: any) => String(row?.[1] ?? '')).filter(Boolean) : [])),
    ]
  }

  recap(labels: string[]) {
    const draft = this.draft
    const issue = [0, 1, 2].map((index) => validateBuilderStep(draft, this.rows, index)).find(Boolean)
    if (issue) return { issue }
    const sheet = buildCrawler(draft, this.rows)
    return {
      sheet,
      backgrounds: builderStages.map((stage, index) => ({ label: labels[index], name: draft.backgrounds[stage].name, skills: draft.backgrounds[stage].skills.join(', '), rank: STAGE_RANKS[index] })),
      method: t(draft.statMode === 'array' ? 'StatArray' : 'StatRolled'),
      stats: attributes.map((attribute, index) => ({ label: `${attribute.name} (${attribute.code})`, value: draft.stats[index], mod: getAttributeModifier(draft.stats[index]) })),
      evade: crawlerEvade(sheet),
      perSlot: getAttributeModifier(draft.stats[2]),
      abilities: [...sheet.skills, ...sheet.spells].map((entry: any) => ({ name: entry.name, rank: entry.unenhancedRank, cooldown: entry.cooldown })),
      achievements: sheet.achievements,
      story: draft.storyLater ? null : builderStoryKeys.map((key) => ({ label: t(`Story.${STORY_LABELS[key]}`), text: draft.story[key] || t('NotSupplied') })),
      inventory: sheet.inventory.map((item: any) => ({ name: item.name, quantity: item.quantity })),
      hotlist: sheet.hotlist.filter(Boolean).join(', '),
    }
  }

  /** Move to a step, checking each earlier step on the way (CharacterBuilder.tsx forward). */
  forward(target: number) {
    for (let index = 0; index <= this.step && index < target; index++) {
      const issue = validateBuilderStep(this.draft, this.rows, index)
      if (issue) {
        this.error = issue
        return this.render()
      }
    }
    this.error = ''
    this.step = Math.max(0, Math.min(STEPS.length - 1, target))
    return this.render()
  }

  static async #onChange(this: CharacterBuilder, _event: Event, _form: HTMLFormElement, formData: any) {
    const values = formData.object
    const draft = this.draft
    this.error = ''
    const text = (key: string) => (typeof values[key] === 'string' ? values[key] : undefined)
    for (const key of ['name', 'crawlerNumber', 'animal', 'size', 'clothing', 'usefulItem', 'weirdItem', 'combat'] as const) if (text(key) !== undefined) (draft as any)[key] = text(key)
    if (text('species') && text('species') !== draft.species) Object.assign(draft, { species: text('species'), backgrounds: newBuilderDraft().backgrounds, combat: '' })
    if (typeof values.storyLater === 'boolean') draft.storyLater = values.storyLater
    if (typeof values.gearLater === 'boolean') draft.gearLater = values.gearLater
    for (const key of builderStoryKeys) {
      const picked = text(`storyPick.${key}`)
      const written = text(`story.${key}`)
      // A new pick replaces the text; otherwise the text box wins.
      if (picked && picked !== draft.story[key] && this.storyOptions(key).includes(picked)) draft.story[key] = picked
      else if (written !== undefined) draft.story[key] = written
    }
    for (const stage of builderStages) {
      const background = text(`background.${stage}`)
      if (background !== undefined && background !== draft.backgrounds[stage].name) draft.backgrounds[stage] = { name: background, skills: [] }
      const option = builderBackgroundOptions(this.rows, draft.species, stage).find((item) => item.name === draft.backgrounds[stage].name)
      const boxes = Object.keys(values).filter((key) => key.startsWith(`skill.${stage}.`))
      if (option && boxes.length)
        draft.backgrounds[stage].skills = option.skills.filter((_name, index) => values[`skill.${stage}.${index}`] === true).slice(0, 2)
    }
    const mode = text('statMode')
    if (mode && mode !== draft.statMode) {
      // As applyStatCommand: the array starts over; roll mode shows the stats rolled so far.
      draft.statMode = mode as Draft['statMode']
      draft.stats = mode === 'array' ? ['2', '3', '4', '5', '6'] : [...(draft.rolledStats ?? ['', '', '', '', ''])]
    } else if (draft.statMode === 'array') attributes.forEach((_attribute, index) => text(`stat.${index}`) && (draft.stats[index] = text(`stat.${index}`)!))
    this.render()
  }

  static #onStep(this: CharacterBuilder, _event: Event, target: HTMLElement) {
    return this.forward(Number(target.dataset.step))
  }

  static #onBack(this: CharacterBuilder) {
    return this.forward(this.step - 1)
  }

  static async #onNext(this: CharacterBuilder) {
    if (this.step < STEPS.length - 1) return this.forward(this.step + 1)
    return this.create()
  }

  static #onRollBackground(this: CharacterBuilder, _event: Event, target: HTMLElement) {
    const stage = target.dataset.stage as BuilderStage
    const options = builderBackgroundOptions(this.rows, this.draft.species, stage)
    if (!options.length) return
    this.draft.backgrounds[stage] = { name: pick(options).name, skills: [] }
    this.error = ''
    this.render()
  }

  static async #onRollStats(this: CharacterBuilder, _event: Event, target: HTMLElement) {
    const draft = this.draft
    if (draft.statMode !== 'roll' || this.busy) return
    const indexes = target.dataset.index !== undefined ? [Number(target.dataset.index)] : [0, 1, 2, 3, 4]
    this.busy = true
    try {
      const { id, values } = await rollStats(indexes, draft.name.trim())
      const rolled = [...(draft.rolledStats ?? ['', '', '', '', ''])]
      for (const index of indexes) {
        rolled[index] = values[index]
        draft.rollMessages[index] = id
      }
      draft.rolledStats = rolled
      draft.stats = [...rolled]
      this.error = ''
    } finally {
      this.busy = false
      this.render()
    }
  }

  static #onRollStory(this: CharacterBuilder, _event: Event, target: HTMLElement) {
    const key = target.dataset.key as (typeof builderStoryKeys)[number]
    const options = this.storyOptions(key)
    if (!options.length) return
    this.draft.story[key] = pick(options)
    this.render()
  }

  async create() {
    this.busy = true
    this.error = ''
    this.render()
    try {
      // Check here first, so a player sees mistakes before anything reaches the GM.
      buildCrawler(this.draft, this.rows)
      if (game.user.can('ACTOR_CREATE') || game.user.isGM) {
        const actor = await createBuiltCrawler(this.draft, game.user.id)
        await this.close()
        actor?.sheet.render(true)
        return
      }
      if (!game.users.activeGM) throw new Error(game.i18n.localize('CRAWLSPACE.Warn.NeedGM'))
      game.socket.emit('system.crawlspace', { type: 'buildCrawler', draft: this.draft, userId: game.user.id })
      ui.notifications.info(t('SentToGM'))
      // The builder stays open until the crawler arrives; a GM refusal shows as a notification.
      this.busy = false
      this.render()
    } catch (error: any) {
      this.error = error.message
      this.busy = false
      this.render()
    }
  }
}

export const openBuilder = () => {
  const existing = foundry.applications.instances.get('crawl-character-builder')
  return existing ? existing.bringToFront() : new CharacterBuilder().render(true)
}

/** A player's builder closes and their new crawler opens when the GM has made it. */
export function registerBuilder() {
  Hooks.on('createActor', (actor: any) => {
    if (game.user.isGM || actor.flags?.crawlspace?.builder?.userId !== game.user.id) return
    foundry.applications.instances.get('crawl-character-builder')?.close()
    actor.sheet.render(true)
  })
}
