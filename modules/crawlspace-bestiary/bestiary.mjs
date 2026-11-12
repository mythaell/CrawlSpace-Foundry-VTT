/**
 * The CrawlSpace app's bestiary as a Foundry window. The GM opens it from the Actors sidebar (Create Actor makes a mob
 * or NPC from an entry) or from an actor sheet's header (Use Portrait sets that actor's portrait). Create Token hands
 * the portrait to the CrawlSpace system's token maker.
 *
 * The catalogue and portraits ship in this module's folder; tools/build-bestiary-module.mjs in the system repository
 * builds it. It holds published book text, so it is never committed or released publicly.
 */
const MODULE = 'crawlspace-bestiary'
const ROOT = `modules/${MODULE}`
const STYLES = ['painted', 'anime', 'pixel']
const CATEGORIES = ['main', 'Mob', 'Boss', 'Crawler', 'NPC', 'all']
const SOURCES = ['all', 'core', 'toolkit', 'course']

const t = (key, data) => game.i18n.format(`CRAWLSPACE_BESTIARY.${key}`, data ?? {})
const esc = (value) => foundry.utils.escapeHTML(String(value ?? ''))
const paragraphs = (text) =>
  String(text ?? '')
    .split(/\n{2,}/)
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) => `<p>${esc(part).replace(/\n/g, '<br>')}</p>`)
    .join('')

let catalogue = null
/** { entries: [{ id, name, category, source, pdf_page, printed_page, green_box_text, context_description, entry_note, portraits: { painted, anime, pixel } }] } */
const loadCatalogue = () =>
  (catalogue ??= fetch(`${ROOT}/data/catalogue.json`)
    .then((response) => {
      if (!response.ok) throw new Error(`catalogue.json returned ${response.status}`)
      return response.json()
    })
    .catch((error) => {
      catalogue = null
      throw error
    }))

const portraitOf = (entry, style) => (entry.portraits?.[style] ? `${ROOT}/${entry.portraits[style]}` : '')

const { ApplicationV2 } = foundry.applications.api

class BestiaryApp extends ApplicationV2 {
  static DEFAULT_OPTIONS = {
    classes: ['crawlspace-bestiary'],
    position: { width: 960, height: 760 },
    window: { icon: 'fa-solid fa-dragon', resizable: true },
    actions: {
      usePortrait: BestiaryApp.#onUsePortrait,
      makeToken: BestiaryApp.#onMakeToken,
      createActor: BestiaryApp.#onCreateActor,
      view: BestiaryApp.#onView,
    },
  }

  /** One window per actor, and one for the Actors sidebar (actor: null). */
  static open(actor = null) {
    const id = `${MODULE}-${actor ? actor.uuid.replace(/\./g, '-') : 'directory'}`
    const existing = foundry.applications.instances.get(id)
    if (existing) return existing.render({ force: true })
    return new BestiaryApp({ id, actor }).render({ force: true })
  }

  constructor(options = {}) {
    super(options)
    this.actor = options.actor ?? null
    this.filters = { search: '', category: 'main', source: 'all' }
  }

  get title() {
    return this.actor ? `${t('Title')}: ${this.actor.name}` : t('Title')
  }

  get style() {
    return game.settings.get(MODULE, 'style')
  }

  async _renderHTML() {
    let error = ''
    try {
      this.entries = (await loadCatalogue()).entries
    } catch (err) {
      console.error(`${MODULE} |`, err)
      error = t('LoadFailed')
    }
    const options = (values, prefix, selected) =>
      values.map((value) => `<option value="${value}"${value === selected ? ' selected' : ''}>${esc(t(`${prefix}.${value}`))}</option>`).join('')
    const root = document.createElement('div')
    root.className = 'bestiary-body'
    root.innerHTML = `
      <div class="bestiary-toolbar">
        <input type="search" name="search" value="${esc(this.filters.search)}" placeholder="${esc(t('Search'))}" aria-label="${esc(t('Search'))}">
        <select name="category" aria-label="${esc(t('CategoryLabel'))}">${options(CATEGORIES, 'Category', this.filters.category)}</select>
        <select name="source" aria-label="${esc(t('SourceLabel'))}">${options(SOURCES, 'Source', this.filters.source)}</select>
        <select name="style" aria-label="${esc(t('StyleLabel'))}" data-tooltip="${esc(t('StyleLabel'))}">${options(STYLES, 'Style', this.style)}</select>
      </div>
      <p class="bestiary-count" aria-live="polite">${esc(error)}</p>
      <div class="bestiary-entries"></div>`
    return root
  }

  _replaceHTML(result, content) {
    content.replaceChildren(result)
  }

  _onRender(context, options) {
    super._onRender(context, options)
    const root = this.element
    for (const name of ['search', 'category', 'source'])
      root.querySelector(`[name=${name}]`).addEventListener('input', (event) => {
        this.filters[name] = event.target.value
        this.#renderList()
      })
    root.querySelector('[name=style]').addEventListener('change', async (event) => {
      await game.settings.set(MODULE, 'style', event.target.value)
      this.#renderList()
    })
    if (this.entries) this.#renderList()
  }

  #shown() {
    const { search, category, source } = this.filters
    const query = search.trim().toLowerCase()
    return this.entries
      .filter(
        (entry) =>
          (category === 'all' || (category === 'main' && entry.category !== 'NPC') || entry.category === category) &&
          (source === 'all' || entry.source === source) &&
          (!query || [entry.name, entry.green_box_text, entry.context_description].join(' ').toLowerCase().includes(query)),
      )
      .sort((a, b) => a.name.localeCompare(b.name))
  }

  #renderList() {
    const style = this.style
    const shown = this.#shown()
    const list = this.element.querySelector('.bestiary-entries')
    list.dataset.style = style
    this.element.querySelector('.bestiary-count').textContent = t('Count', { count: shown.length })
    const button = (action, icon, label, id) =>
      `<button type="button" data-action="${action}" data-id="${esc(id)}"><i class="${icon}"></i> ${esc(label)}</button>`
    list.innerHTML = shown
      .map((entry) => {
        const picture = portraitOf(entry, style)
        const actions = [
          picture && this.actor && button('usePortrait', 'fa-solid fa-image-portrait', t('UsePortrait'), entry.id),
          picture && button('makeToken', 'fa-solid fa-circle-user', t('MakeToken'), entry.id),
          !this.actor && button('createActor', 'fa-solid fa-user-plus', t('CreateActor'), entry.id),
        ].filter(Boolean)
        return `<article class="bestiary-card">${
          picture
            ? `<a class="bestiary-image" data-action="view" data-id="${esc(entry.id)}"><img loading="lazy" src="${esc(picture)}" alt="${esc(entry.name)}"></a>`
            : ''
        }<div class="bestiary-card-body">
          <span class="bestiary-badge">${esc(t(`Category.${entry.category}`))}</span>
          <h2>${esc(entry.name)}</h2>
          ${actions.length ? `<div class="bestiary-actions">${actions.join('')}</div>` : ''}
          <div class="bestiary-source">${esc(t(`Source.${entry.source}`))} · ${esc(t('Pages', { printed: entry.printed_page, pdf: entry.pdf_page }))}</div>
          ${entry.green_box_text ? `<div class="bestiary-label">${esc(t('GreenBox'))}</div><div class="bestiary-desc">${esc(entry.green_box_text)}</div>` : ''}
          ${entry.context_description ? `<div class="bestiary-profile"><div class="bestiary-label">${esc(t('Profile'))}</div>${esc(entry.context_description)}</div>` : ''}
          ${entry.entry_note ? `<p class="bestiary-note">${esc(entry.entry_note)}</p>` : ''}
        </div></article>`
      })
      .join('')
  }

  #entry(target) {
    return this.entries?.find((entry) => String(entry.id) === target.dataset.id)
  }

  /** Busy while saving, so a second click doesn't make a second actor. */
  async #busy(target, work) {
    if (target.disabled) return
    target.disabled = true
    try {
      await work()
    } catch (error) {
      console.error(`${MODULE} |`, error)
      ui.notifications.error(error?.message || t('Failed'))
    } finally {
      target.disabled = false
    }
  }

  static async #onUsePortrait(_event, target) {
    const entry = this.#entry(target)
    const img = entry && portraitOf(entry, this.style)
    if (!img || !this.actor) return
    await this.#busy(target, async () => {
      await this.actor.update({ img })
      ui.notifications.info(t('PortraitSet', { name: this.actor.name }))
    })
  }

  static async #onMakeToken(_event, target) {
    const entry = this.#entry(target)
    const style = this.style
    const source = entry && portraitOf(entry, style)
    if (!source) return
    if (!game.crawlspace?.openTokenMaker) return ui.notifications.error(t('NeedsSystem'))
    await this.#busy(target, async () => {
      const actor = this.actor ?? (await createActor(entry, style))
      if (actor) await game.crawlspace.openTokenMaker(actor, { source, pixelArt: style === 'pixel' })
    })
  }

  static async #onCreateActor(_event, target) {
    const entry = this.#entry(target)
    if (!entry) return
    await this.#busy(target, async () => {
      const actor = await createActor(entry, this.style)
      actor?.sheet.render({ force: true })
    })
  }

  static #onView(_event, target) {
    const entry = this.#entry(target)
    const src = entry && portraitOf(entry, this.style)
    if (!src) return
    new foundry.applications.apps.ImagePopout({ src, window: { title: entry.name } }).render({ force: true })
  }
}

/** A mob (bosses as boss mobs) or NPC named after the entry, with its portrait and descriptions. */
async function createActor(entry, style) {
  const img = portraitOf(entry, style) || portraitOf(entry, 'painted') || undefined
  const mob = entry.category === 'Mob' || entry.category === 'Boss'
  const description = [paragraphs(entry.green_box_text), paragraphs(entry.context_description)].filter(Boolean).join('<hr>')
  const folder = await bestiaryFolder()
  return Actor.implementation.create({
    name: entry.name,
    type: mob ? 'mob' : 'npc',
    img,
    folder: folder?.id,
    system: { description, ...(mob ? { kind: entry.category === 'Boss' ? 'boss' : 'mob' } : {}) },
    prototypeToken: img ? { texture: { src: img } } : {},
  })
}

/** New actors go in a "Bestiary" folder in the Actors sidebar. */
async function bestiaryFolder() {
  const name = t('Title')
  return game.folders.find((folder) => folder.type === 'Actor' && folder.name === name && !folder.folder) ?? Folder.implementation.create({ name, type: 'Actor' })
}

Hooks.once('init', () => {
  game.settings.register(MODULE, 'style', {
    scope: 'client',
    config: false,
    type: String,
    default: 'painted',
    choices: Object.fromEntries(STYLES.map((style) => [style, style])),
  })
  game.modules.get(MODULE).api = { open: (actor) => BestiaryApp.open(actor ?? null) }
})

Hooks.on('renderActorDirectory', (_app, html) => {
  if (!game.user.isGM || html.querySelector('.crawlspace-bestiary-open')) return
  const button = document.createElement('button')
  button.type = 'button'
  button.className = 'crawlspace-bestiary-open'
  button.innerHTML = `<i class="fa-solid fa-dragon"></i> ${esc(t('Title'))}`
  button.addEventListener('click', () => BestiaryApp.open())
  html.querySelector('.header-actions')?.append(button)
})

Hooks.on('getHeaderControlsActorSheetV2', (sheet, controls) => {
  if (!game.user.isGM) return
  controls.push({
    icon: 'fa-solid fa-dragon',
    label: 'CRAWLSPACE_BESTIARY.Open',
    action: 'crawlspaceBestiary',
    onClick: () => BestiaryApp.open(sheet.actor),
  })
})
