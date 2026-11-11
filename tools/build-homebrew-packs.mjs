/**
 * Homebrew database → packs-src/<pack>/*.json (committed) → packs/<pack> (LevelDB, built).
 *
 *   npm run packs:homebrew            read the homebrew database, rewrite packs-src, compile
 *   npm run packs:homebrew -- --offline   compile the committed packs-src without a database
 */
import fs from 'node:fs'
import path from 'node:path'
import { convertRow } from '../src/import/convert.ts'
import { ROOT, ITEM_TYPE_LABELS, assertPacksClosed, compile, foldersFor, keyify, loadCrawlSpaceEnv, readContent, stamp, writeSource } from './lib.mjs'

const PACKS = ['homebrew-skills', 'homebrew-spells', 'homebrew-items']
const SRC = path.join(ROOT, 'packs-src')
const OUT = path.join(ROOT, 'packs')
assertPacksClosed(OUT)
const offline = process.argv.includes('--offline')
// Homebrew rows that stay out of the shipped packs: test entries, and content not written by the system's author.
const LEFT_OUT = new Set(['38', '39', '40', '47', '67', '1156'])
const version = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8')).version

if (!offline) {
  loadCrawlSpaceEnv()
  const rows = await readContent(process.env.HOMEBREW_DATABASE_URL)
  const byPack = Object.fromEntries(PACKS.map((pack) => [pack, []]))
  const skipped = {}
  for (const row of rows) {
    if (LEFT_OUT.has(String(row.id))) continue
    const converted = convertRow(row, 'homebrew')
    // The system ships homebrew skills, spells and items only; other homebrew (mobs, quests...) stays out.
    if (!converted || converted.documentName !== 'Item') {
      skipped[row.content_type] = (skipped[row.content_type] ?? 0) + 1
      continue
    }
    const pack = converted.pack === 'skills' ? 'homebrew-skills' : converted.pack === 'spells' ? 'homebrew-spells' : 'homebrew-items'
    byPack[pack].push(keyify(stamp(converted.data, version), 'items'))
  }
  for (const pack of PACKS) {
    const docs = byPack[pack]
    const folders = pack === 'homebrew-items' ? foldersFor(docs, 'Item', (doc) => ITEM_TYPE_LABELS[doc.type], pack) : []
    writeSource(path.join(SRC, pack), [...folders, ...docs])
    console.log(`${pack}: ${docs.length} documents`)
  }
  if (Object.keys(skipped).length) console.log('Not shipped (not items):', skipped)
}

for (const pack of PACKS) {
  const src = path.join(SRC, pack)
  if (!fs.existsSync(src)) {
    console.warn(`No source for ${pack}; run without --offline first.`)
    continue
  }
  await compile(src, path.join(OUT, pack))
}
console.log(`Compiled ${PACKS.length} packs into ${path.relative(ROOT, OUT)}/`)
