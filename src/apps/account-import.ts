/**
 * Imports a CrawlSpace account export or party backup into this world: images go to the world's
 * folder, then characters, homebrew, macros and each chosen party (its crawlers, library, journals
 * and scenes with walls, lights, tiles, drawings, notes and tokens).
 */
import { characterToActor, convertRow, inventoryToItem } from '../import/convert'
import { fillDamageData } from '../import/fill-damage'
import {
  combatantToMob,
  convertScene,
  extensionFor,
  importKey,
  journalToFoundry,
  macroToFoundry,
  reimportUpdate,
  resolveImages,
  usedImageIds,
  type ExportParty,
  type ImportBundle,
} from '../import/account-import'

// Document classes this module creates (not declared as globals in this project).
const { Folder } = foundry.documents as any

const t = (key: string, data?: Record<string, unknown>) =>
  data ? game.i18n.format(`CRAWLSPACE.AccountImport.${key}`, data) : game.i18n.localize(`CRAWLSPACE.AccountImport.${key}`)
const escape = (value: unknown) => foundry.utils.escapeHTML(String(value ?? ''))
const slug = (value: string) =>
  value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40) || 'import'

type Choice = { characters: boolean; homebrew: boolean; macros: boolean; parties: number[] }

/** Ask what to import, then import it. */
export async function openAccountImport(bundle: ImportBundle) {
  if (!game.user.isGM) return ui.notifications.warn(t('GMOnly'))
  const { manifest } = bundle
  const option = (name: string, label: string, count: number) =>
    count ? `<label class="account-import-option"><input type="checkbox" name="${name}" checked> ${escape(label)}</label>` : ''
  const parties = manifest.parties
    .map(
      (party, index) =>
        `<label class="account-import-option"><input type="checkbox" name="party-${index}" checked> ${escape(
          t('Party', { name: party.party?.name ?? '?', scenes: party.scenes.length, crawlers: party.characters.length }),
        )}</label>`,
    )
    .join('')
  const missingImages = manifest.images.length > 0 && bundle.files.size === 0
  const content = [
    manifest.account.displayName ? `<p>${escape(t('From', { name: manifest.account.displayName, date: manifest.exportedAt.slice(0, 10) }))}</p>` : '',
    option('characters', t('Characters', { count: manifest.characters.length }), manifest.characters.length),
    option('homebrew', t('Homebrew', { count: manifest.homebrew.length }), manifest.homebrew.length),
    option('macros', t('Macros', { count: manifest.macros.macros.length }), manifest.macros.macros.length),
    parties,
    missingImages ? `<p class="notification warning">${escape(t('NoImages'))}</p>` : '',
  ].join('')
  const choice: Choice | null = await foundry.applications.api.DialogV2.prompt({
    window: { title: t('Title') },
    position: { width: 520 },
    classes: ['crawlspace', 'account-import-dialog'],
    rejectClose: false,
    content,
    ok: {
      label: t('Start'),
      callback: (_event: Event, button: any) => {
        const form = button.form.elements
        return {
          characters: !!form.characters?.checked,
          homebrew: !!form.homebrew?.checked,
          macros: !!form.macros?.checked,
          parties: manifest.parties.map((_party, index) => index).filter((index) => form[`party-${index}`]?.checked),
        }
      },
    },
  })
  if (!choice) return
  try {
    await importAccount(bundle, choice)
  } catch (error: any) {
    console.error(error)
    ui.notifications.error(game.i18n.format('CRAWLSPACE.Import.Failed', { error: error.message }))
  }
}

export async function ensureDirectory(path: string) {
  const FilePicker = foundry.applications.apps.FilePicker.implementation
  let current = ''
  for (const part of path.split('/')) {
    current = current ? `${current}/${part}` : part
    try {
      await FilePicker.createDirectory('data', current, { notify: false })
    } catch (error: any) {
      // Existing folders are expected.
      if (!/EEXIST|already exists/i.test(error?.message ?? '')) throw error
    }
  }
}

async function folder(name: string, type: string, parent?: any) {
  const existing = game.folders.find((entry: any) => entry.type === type && entry.name === name && (entry.folder?.id ?? null) === (parent?.id ?? null))
  return existing ?? Folder.implementation.create({ name, type, folder: parent?.id ?? null })
}

const keyOf = (doc: any) => doc?.flags?.crawlspace?.importKey

/**
 * Create a document, or refresh the one an earlier import of the same export made (found by its
 * import key): its content is replaced, its embedded documents recreated, its folder kept.
 */
async function upsert(documentName: string, key: string, data: Record<string, any>, options: { pack?: string; keepEmbeddedIds?: boolean } = {}) {
  const cls = (foundry.documents as any)[documentName]
  const source = foundry.utils.mergeObject(data, { flags: { crawlspace: { importKey: key } } }, { inplace: false })
  const existing = options.pack
    ? (await game.packs.get(options.pack).getDocuments()).find((doc: any) => keyOf(doc) === key)
    : game.collections.get(documentName).find((doc: any) => keyOf(doc) === key)
  if (!existing) return cls.implementation.create(source, options)
  const { update, embedded } = reimportUpdate(documentName, source)
  await existing.update(update)
  for (const [name, documents] of Object.entries(embedded)) {
    const old = existing.getEmbeddedCollection(name).map((doc: any) => doc.id)
    if (old.length) await existing.deleteEmbeddedDocuments(name, old)
    if (documents.length) await existing.createEmbeddedDocuments(name, documents, { keepId: true })
  }
  return existing
}

export async function importAccount(bundle: ImportBundle, choice: Choice) {
  const { manifest, files } = bundle
  const parties = choice.parties.map((index) => manifest.parties[index])
  const label = manifest.account.displayName || parties[0]?.party?.name || 'CrawlSpace'
  const progress = ui.notifications.info(t('Working', { step: t('StepImages') }), { progress: true })
  const step = (pct: number, key: string) => progress?.update?.({ pct, message: t('Working', { step: t(key) }) })
  const counts = { images: 0, actors: 0, items: 0, journals: 0, scenes: 0, macros: 0, effects: 0, skipped: 0 }

  // Images: only the ones what we import uses.
  const wanted = usedImageIds([
    choice.characters ? manifest.characters : [],
    choice.homebrew ? manifest.homebrew : [],
    choice.macros ? manifest.macros : [],
    parties,
  ])
  const paths = new Map<string, string>()
  const directory = `worlds/${game.world.id}/crawlspace-import/${slug(label)}-${manifest.exportedAt.slice(0, 10)}`
  const images = manifest.images.filter((image) => wanted.has(image.id) && files.has(image.file))
  if (images.length) await ensureDirectory(directory)
  const FilePicker = foundry.applications.apps.FilePicker.implementation
  for (const [index, image] of images.entries()) {
    const name = `${image.id}.${extensionFor(image.contentType)}`
    const file = new File([files.get(image.file)! as BlobPart], name, { type: image.contentType })
    const result: any = await FilePicker.upload('data', directory, file, {}, { notify: false })
    if (result?.path) {
      paths.set(image.id, result.path)
      counts.images++
    }
    progress?.update?.({ pct: (0.4 * (index + 1)) / images.length, message: t('Working', { step: t('StepImages') }) })
  }
  const resolve = <T>(value: T, fallback = '') => resolveImages(value, (id) => paths.get(id) ?? null, fallback)

  const root = { Actor: null as any, Item: null as any, JournalEntry: null as any, Scene: null as any, Macro: null as any }
  const rootFolder = async (type: keyof typeof root) => (root[type] ??= await folder(t('Folder', { name: label }), type))

  // Crawlers by their app id, so party scenes link the same actor.
  const crawlers = new Map<number, string>()
  const createCrawler = async (character: { id: number; name: string; data: Record<string, any> }, parent: any) => {
    const data: any = characterToActor({ ...resolve(character), name: character.name })
    await fillDamageData(data.items ?? [])
    data.folder = parent.id
    data.flags = foundry.utils.mergeObject(data.flags ?? {}, { crawlspace: { appCharacterId: character.id } })
    const actor = await upsert('Actor', importKey('character', character.id), data, { keepEmbeddedIds: true })
    if (actor) {
      crawlers.set(character.id, actor.id)
      counts.actors++
    }
  }

  if (choice.characters) {
    step(0.45, 'StepCharacters')
    const parent = await rootFolder('Actor')
    for (const character of manifest.characters) await createCrawler(character, parent)
  }

  if (choice.homebrew) {
    step(0.5, 'StepHomebrew')
    const byType: Record<string, any[]> = { Item: [], Actor: [], JournalEntry: [], RollTable: [], ActiveEffect: [] }
    for (const entry of manifest.homebrew) {
      const converted = convertRow({ id: entry.id, content_type: entry.contentType, name: entry.name, data: resolve(entry.data) }, 'homebrew')
      if (!converted) {
        counts.skipped++
        continue
      }
      const { _id, ...data } = converted.data
      byType[converted.documentName].push({ key: importKey('homebrew', entry.id), data })
    }
    const each = async (type: string, list: { key: string; data: any }[], folderId?: string, pack?: string) => {
      let count = 0
      for (const { key, data } of list) if (await upsert(type, key, folderId ? { ...data, folder: folderId } : data, pack ? { pack } : {})) count++
      return count
    }
    const homebrewFolder = async (type: keyof typeof root) => folder(t('HomebrewFolder'), type, await rootFolder(type))
    if (byType.Item.length) {
      const parent = await homebrewFolder('Item')
      await fillDamageData(byType.Item.map((entry) => entry.data))
      counts.items += await each('Item', byType.Item, parent.id)
    }
    if (byType.Actor.length) counts.actors += await each('Actor', byType.Actor, (await homebrewFolder('Actor')).id)
    if (byType.JournalEntry.length) counts.journals += await each('JournalEntry', byType.JournalEntry, (await homebrewFolder('JournalEntry')).id)
    if (byType.RollTable.length) counts.journals += await each('RollTable', byType.RollTable)
    // Buffs aren't world documents; they go in a world compendium of effects.
    if (byType.ActiveEffect.length) {
      const name = `crawlspace-buffs-${slug(label)}`
      let pack = game.packs.get(`world.${name}`)
      pack ??= await foundry.documents.collections.CompendiumCollection.createCompendium({ type: 'ActiveEffect', label: t('BuffPack', { name: label }), name })
      counts.effects += await each('ActiveEffect', byType.ActiveEffect, undefined, pack.collection)
    }
  }

  if (choice.macros) {
    step(0.55, 'StepMacros')
    const parent = await rootFolder('Macro')
    for (const [index, macro] of manifest.macros.macros.entries())
      if (await upsert('Macro', importKey('macro', macro?.id ?? index), { ...macroToFoundry(resolve(macro)), folder: parent.id })) counts.macros++
  }

  for (const [index, party] of parties.entries()) {
    step(0.6 + (0.4 * index) / Math.max(1, parties.length), 'StepParties')
    await importParty(party, { resolve, paths, crawlers, createCrawler, rootFolder, counts })
  }
  progress?.update?.({ pct: 1, message: t('Done', counts) })
  ui.notifications.info(t('Done', counts))
  return counts
}

async function importParty(
  party: ExportParty,
  context: {
    resolve: <T>(value: T, fallback?: string) => T
    paths: Map<string, string>
    crawlers: Map<number, string>
    createCrawler: (character: any, parent: any) => Promise<void>
    rootFolder: (type: any) => Promise<any>
    counts: Record<string, number>
  },
) {
  const { resolve, paths, crawlers, counts } = context
  const name = party.party?.name || 'Party'
  const partyKey = (...parts: (string | number)[]) => importKey('party', party.id ?? `name-${name}`, ...parts)
  const partyFolder = async (type: string) => folder(name, type, await context.rootFolder(type))
  const actorFolder = await partyFolder('Actor')
  for (const character of party.characters) {
    if (!crawlers.has(character.id)) await context.createCrawler(character, actorFolder)
    const actor = game.actors.get(crawlers.get(character.id))
    if (actor && actor.getFlag('crawlspace', 'inParty') === undefined) await actor.setFlag('crawlspace', 'inParty', true)
  }

  // The party library: actors (mobs, NPCs, companions), items and journals.
  const directories = party.directories ?? {}
  const libraryActors = new Map<string, string>()
  for (const entry of directories.actors?.entries ?? []) {
    const reference = entry.content?.reference
    if (!reference?.contentType) continue
    const converted = convertRow({ id: Number.NaN, content_type: reference.contentType, name: reference.name, data: resolve(reference.data ?? {}) }, 'homebrew')
    if (converted?.documentName !== 'Actor') {
      counts.skipped++
      continue
    }
    const { _id, ...data } = converted.data
    const actor = await upsert('Actor', partyKey('actor', reference.localId ?? entry.id), { ...data, folder: actorFolder.id })
    if (actor) {
      libraryActors.set(reference.localId, actor.id)
      counts.actors++
    }
  }
  const items = (directories.items?.entries ?? []).map((entry) => {
    const content = resolve(entry.content)
    return { key: partyKey('item', entry.id), data: inventoryToItem(content, content.contentType ?? content.content_type ?? '') as any }
  })
  if (items.length) {
    const parent = await partyFolder('Item')
    await fillDamageData(items.map((entry) => entry.data))
    for (const { key, data } of items) if (await upsert('Item', key, { ...data, folder: parent.id })) counts.items++
  }
  const journals = (directories.journals?.entries ?? []).map((entry) => ({ key: partyKey('journal', entry.id), data: journalToFoundry(resolve(entry.content)) }))
  if (journals.length) {
    const parent = await partyFolder('JournalEntry')
    for (const { key, data } of journals) if (await upsert('JournalEntry', key, { ...data, folder: parent.id })) counts.journals++
  }

  // Mobs placed straight from an encounter get an actor from their token, one per kind.
  const mobs = new Map<string, string>()
  const mobKey = (token: Record<string, any>) => token.referenceId || token.combatant?.baseName || token.combatant?.name || token.label || 'Mob'
  const tokens = [
    ...party.objects.filter((object) => object.kind === 'token').map((object) => object.data),
    ...party.scenes.flatMap((scene) => (Array.isArray(scene.data?.tokens) ? scene.data.tokens : [])),
  ]
  for (const token of tokens) {
    if (Number.isSafeInteger(token?.characterId) || !token?.combatant) continue
    const key = mobKey(token)
    if (libraryActors.has(key) || mobs.has(key)) continue
    const image = typeof token.image === 'string' ? resolve(token.image) || null : null
    const actor = await upsert('Actor', partyKey('mob', key), { ...combatantToMob(resolve(token.combatant), image), folder: actorFolder.id })
    if (actor) {
      mobs.set(key, actor.id)
      counts.actors++
    }
  }

  const sceneFolder = await partyFolder('Scene')
  const journalFolder = await partyFolder('JournalEntry')
  for (const scene of party.scenes) {
    const converted = convertScene(scene, party.objects, {
      image: (id) => paths.get(id) ?? null,
      crawler: (id) => (crawlers.has(id) ? { actorId: crawlers.get(id)! } : null),
      mob: (token) => {
        const key = mobKey(token)
        const actorId = libraryActors.get(key) ?? mobs.get(key)
        return actorId ? { actorId } : null
      },
    })
    const sceneKey = partyKey('scene', scene.id)
    const created = await upsert('Scene', sceneKey, { ...resolve(converted.scene), folder: sceneFolder.id })
    if (!created) continue
    counts.scenes++
    // A re-import replaces what the last import placed; walls or tokens the GM added stay.
    for (const type of ['Wall', 'AmbientLight', 'Tile', 'Drawing', 'Note', 'Token']) {
      const old = created.getEmbeddedCollection(type).filter((doc: any) => doc.flags?.crawlspace?.imported).map((doc: any) => doc.id)
      if (old.length) await created.deleteEmbeddedDocuments(type, old)
    }
    const { sceneX, sceneY } = created.dimensions ?? created.getDimensions()
    const at = <T extends { x: number; y: number }>(value: T) => ({ ...value, x: value.x + sceneX, y: value.y + sceneY })
    const notes: any[] = []
    for (const note of converted.notes) {
      const journal = await upsert('JournalEntry', importKey(sceneKey, 'note', note.key), {
        ...resolve(note.journal),
        folder: journalFolder.id,
        ...(note.hidden ? { ownership: { default: 0 } } : {}),
      })
      if (!journal) continue
      counts.journals++
      notes.push(at({ entryId: journal.id, x: note.x, y: note.y, text: note.text, texture: { src: 'icons/svg/book.svg' }, iconSize: 40 }))
    }
    const embedded: [string, any[]][] = [
      ['Wall', converted.walls.map((wall) => ({ ...wall, c: [wall.c[0] + sceneX, wall.c[1] + sceneY, wall.c[2] + sceneX, wall.c[3] + sceneY] }))],
      ['AmbientLight', converted.lights.map(at)],
      ['Tile', converted.tiles.map(at)],
      ['Drawing', converted.drawings.map(at)],
      ['Note', notes],
      [
        'Token',
        converted.tokens
          .filter((token) => token.actorId)
          .map((token) => {
            // Without its own image a token shows its actor's.
            const actor = game.actors.get(token.actorId)
            const texture = token.texture ?? { src: actor?.prototypeToken?.texture?.src || actor?.img }
            return at({ ...token, texture })
          }),
      ],
    ]
    const imported = (doc: any) => foundry.utils.mergeObject(doc, { flags: { crawlspace: { imported: true } } }, { inplace: false })
    for (const [type, documents] of embedded) if (documents.length) await created.createEmbeddedDocuments(type, documents.map(imported))
    counts.skipped += converted.tokens.filter((token) => !token.actorId).length
  }
}
