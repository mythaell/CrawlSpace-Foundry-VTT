/**
 * Shared helpers for the pack builders: read CrawlSpace's Postgres content, give every document and
 * embedded document a LevelDB `_key`, write JSON sources and compile them with the Foundry CLI.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import dotenv from 'dotenv'
import pg from 'pg'
import { compilePack } from '@foundryvtt/foundryvtt-cli'
import { stableId } from '../src/import/convert.ts'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')

/** CrawlSpace's .env holds the database URLs. Override with CRAWLSPACE_ENV=path/to/.env. */
export function loadCrawlSpaceEnv() {
  const envPath = process.env.CRAWLSPACE_ENV ?? path.resolve(ROOT, '..', 'Dungeon Crawler Carl RPG', '.env')
  if (fs.existsSync(envPath)) dotenv.config({ path: envPath, quiet: true })
  return envPath
}

/** Read every row of a CrawlSpace content database (read-only). */
export async function readContent(connectionString) {
  if (!connectionString) throw new Error('Database URL is not set. Check CRAWLSPACE_ENV or the CrawlSpace .env file.')
  const client = new pg.Client({ connectionString })
  await client.connect()
  try {
    const { rows } = await client.query('select id, content_type, name, data from content order by content_type, name, id')
    return rows
  } finally {
    await client.end()
  }
}

/** Embedded collections the CLI walks (same shape as its HIERARCHY). */
const EMBEDDED = {
  actors: ['items', 'effects'],
  items: ['effects'],
  journal: ['pages'],
}

export const COLLECTION_FOR = { Item: 'items', Actor: 'actors', JournalEntry: 'journal', ActiveEffect: 'effects', Folder: 'folders' }

/** Assign `_id`s (deterministic) and `_key`s to a document and everything embedded in it. */
export function keyify(doc, collection, parentPath = '', parentIds = '') {
  doc._id ??= stableId(`${parentIds}/${collection}/${doc.name ?? ''}`)
  const sublevel = parentPath ? `${parentPath}.${collection}` : collection
  const ids = parentIds ? `${parentIds}.${doc._id}` : doc._id
  doc._key = `!${sublevel}!${ids}`
  const seen = new Set()
  for (const embedded of EMBEDDED[collection] ?? []) {
    for (const [index, child] of (doc[embedded] ?? []).entries()) {
      if (!child._id || seen.has(child._id)) child._id = stableId(`${ids}/${embedded}/${index}/${child.name ?? ''}`)
      seen.add(child._id)
      keyify(child, embedded, sublevel, ids)
    }
  }
  return doc
}

export function slug(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'entry'
}

/** Replace a pack's JSON source folder with these documents, one file each. */
export function writeSource(dir, docs) {
  fs.rmSync(dir, { recursive: true, force: true })
  fs.mkdirSync(dir, { recursive: true })
  for (const doc of docs) {
    const prefix = doc._key.startsWith('!folders!') ? '_folder_' : ''
    fs.writeFileSync(path.join(dir, `${prefix}${slug(doc.name)}_${doc._id}.json`), `${JSON.stringify(doc, null, 2)}\n`)
  }
}

/** Compile a JSON source folder into a LevelDB pack, replacing any old build. */
export async function compile(srcDir, packDir) {
  fs.rmSync(packDir, { recursive: true, force: true })
  await compilePack(srcDir, packDir, { log: false })
}

/** One folder per distinct label, so big packs stay browsable. */
export function foldersFor(docs, documentName, labelOf, seed) {
  const folders = new Map()
  for (const doc of docs) {
    const label = labelOf(doc)
    if (!label) continue
    if (!folders.has(label)) {
      folders.set(label, { _id: stableId(`${seed}/folder/${label}`), name: label, type: documentName, sorting: 'a', folder: null, color: null, flags: {} })
    }
    doc.folder = folders.get(label)._id
  }
  return [...folders.values()].map((folder) => ({ ...folder, _key: `!folders!${folder._id}` }))
}

export const ITEM_TYPE_LABELS = {
  skill: 'Skills',
  spell: 'Spells',
  weapon: 'Weapons',
  equipment: 'Equipment',
  consumable: 'Consumables',
  tattoo: 'Tattoos',
  loot: 'Loot',
  lootBox: 'Loot Boxes',
  ability: 'Abilities',
  race: 'Races',
  class: 'Classes',
  background: 'Backgrounds',
  achievement: 'Achievements',
  trap: 'Traps',
}

/** Stamp the core/system versions Foundry expects on compendium documents. */
export function stamp(doc, systemVersion) {
  doc._stats = { coreVersion: '14.370', systemId: 'crawlspace', systemVersion, createdTime: null, modifiedTime: null, lastModifiedBy: null, compendiumSource: null, duplicateSource: null, exportSource: null }
  return doc
}
