/**
 * Game database → build/crawlspace-content, a Foundry module with one compendium per content group.
 *
 * The output holds published book text, so it is built locally and never committed (build/ is ignored).
 * Link it into Foundry with `npm run link`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { convertRow, stableId } from '../src/import/convert.ts'
import { ROOT, COLLECTION_FOR, ITEM_TYPE_LABELS, compile, foldersFor, keyify, loadCrawlSpaceEnv, readContent, stamp, writeSource } from './lib.mjs'

const MODULE_ID = 'crawlspace-content'
const OUT = path.join(ROOT, 'build', MODULE_ID)
const SRC = path.join(ROOT, 'build', 'src')
const systemManifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'))

/** Pack name → label and document type. Order here is the order in the sidebar. */
const PACKS = {
  skills: { label: 'Skills', type: 'Item' },
  spells: { label: 'Spells', type: 'Item' },
  items: { label: 'Items & Gear', type: 'Item' },
  'races-classes': { label: 'Races & Classes', type: 'Item' },
  backgrounds: { label: 'Backgrounds', type: 'Item' },
  achievements: { label: 'Achievements', type: 'Item' },
  'loot-boxes': { label: 'Loot Boxes', type: 'Item' },
  traps: { label: 'Traps', type: 'Item' },
  conditions: { label: 'Buffs & Conditions', type: 'ActiveEffect' },
  mobs: { label: 'Mobs & Bosses', type: 'Actor' },
  npcs: { label: 'NPCs', type: 'Actor' },
  companions: { label: 'Pets & Mounts', type: 'Actor' },
  adventures: { label: 'Quests & Neighborhoods', type: 'JournalEntry' },
  lore: { label: 'Dungeon Lore', type: 'JournalEntry' },
  reference: { label: 'Reference Tables', type: 'JournalEntry' },
  'reference-tables': { label: 'Rollable Tables', type: 'RollTable' },
}

const titleCase = (text) => String(text ?? '').replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())

loadCrawlSpaceEnv()
const rows = await readContent(process.env.GAME_CONTENT_DATABASE_URL)
// The rulebooks' reference tables ship with the CrawlSpace app rather than its database.
const appSource = path.resolve(path.dirname(process.env.CRAWLSPACE_ENV ?? path.resolve(ROOT, '..', 'Dungeon Crawler Carl RPG', '.env')), 'src', 'data', 'referenceTables.ts')
if (fs.existsSync(appSource)) {
  const { referenceTables } = await import(pathToFileURL(appSource).href)
  for (const table of referenceTables) rows.push({ id: table.localId, content_type: 'reference_table', name: `${table.data.label ? `${table.data.label}: ` : ''}${table.name}`, data: table.data })
}
const byPack = Object.fromEntries(Object.keys(PACKS).map((pack) => [pack, []]))
const skipped = {}
for (const row of rows) {
  const converted = convertRow(row, 'game')
  if (!converted || !byPack[converted.pack]) {
    skipped[row.content_type] = (skipped[row.content_type] ?? 0) + 1
    continue
  }
  if (PACKS[converted.pack].type !== converted.documentName) throw new Error(`${row.content_type} produced ${converted.documentName} for pack ${converted.pack}`)
  if (row.data?.book) converted.data.flags.crawlspace.book = row.data.book
  byPack[converted.pack].push(stamp(converted.data, systemManifest.version))
}

// NPC stat blocks point at mobs by database seed; turn them into compendium UUIDs.
const mobIds = new Set(byPack.mobs.map((mob) => mob._id))
for (const npc of byPack.npcs) {
  const ref = npc.system?.statBlock
  if (typeof ref !== 'string' || !ref.startsWith('@mobRef:')) continue
  const id = stableId(ref.slice('@mobRef:'.length))
  npc.system.statBlock = mobIds.has(id) ? `Compendium.${MODULE_ID}.mobs.Actor.${id}` : ''
}

const folderLabel = {
  items: (doc) => ITEM_TYPE_LABELS[doc.type],
  'races-classes': (doc) => ITEM_TYPE_LABELS[doc.type],
  backgrounds: (doc) => titleCase(doc.system?.stage),
  mobs: (doc) => (doc.system?.kind === 'boss' ? 'Bosses' : `Floor ${doc.system?.floor ?? '?'}`),
  adventures: (doc) => titleCase(doc.flags?.crawlspace?.contentType),
  lore: (doc) => titleCase(doc.flags?.crawlspace?.contentType),
  companions: (doc) => titleCase(doc.system?.kind),
  reference: (doc) => doc.flags?.crawlspace?.book,
  'reference-tables': (doc) => doc.flags?.crawlspace?.book,
}

fs.rmSync(OUT, { recursive: true, force: true })
fs.mkdirSync(OUT, { recursive: true })
const packEntries = []
for (const [pack, { label, type }] of Object.entries(PACKS)) {
  const docs = byPack[pack].map((doc) => keyify(doc, COLLECTION_FOR[type]))
  if (!docs.length) continue
  const folders = folderLabel[pack] ? foldersFor(docs, type, folderLabel[pack], `${MODULE_ID}/${pack}`) : []
  const src = path.join(SRC, pack)
  writeSource(src, [...folders, ...docs])
  await compile(src, path.join(OUT, 'packs', pack))
  packEntries.push({ name: pack, label, path: `packs/${pack}`, type, system: 'crawlspace', ownership: { PLAYER: 'OBSERVER', ASSISTANT: 'OWNER' } })
  console.log(`${pack}: ${docs.length} documents`)
}
if (Object.keys(skipped).length) console.log('Skipped content types:', skipped)

const manifest = {
  id: MODULE_ID,
  title: 'CrawlSpace: Game Content',
  description: 'Skills, spells, gear, mobs, NPCs and lore from the CrawlSpace game database. Built locally; not for distribution.',
  version: systemManifest.version,
  compatibility: systemManifest.compatibility,
  authors: systemManifest.authors,
  relationships: { systems: [{ id: 'crawlspace', type: 'system', compatibility: { minimum: systemManifest.version } }] },
  packs: packEntries,
  packFolders: [{ name: 'CrawlSpace', color: '#7a2e1d', packs: packEntries.map((entry) => entry.name) }],
}
fs.writeFileSync(path.join(OUT, 'module.json'), `${JSON.stringify(manifest, null, 2)}\n`)
fs.rmSync(SRC, { recursive: true, force: true })
console.log(`Built ${path.relative(ROOT, OUT)} with ${packEntries.length} packs.`)
