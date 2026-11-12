/**
 * The CrawlSpace app's bestiary → build/crawlspace-bestiary, a Foundry module, and build/crawlspace-bestiary.zip.
 *
 * Reads the app's extracted bestiary (output/bestiary-site: entries.json, media.json and media/) and copies each
 * entry's portrait previews in three styles next to the module's code (modules/crawlspace-bestiary). The output holds
 * published book text, so it is built locally and never committed or released publicly (build/ is ignored).
 *
 * For a manifest install, set BESTIARY_URL (in this repository's .env) to the unlisted folder the module is hosted
 * in; module.json then names <BESTIARY_URL>/module.json and <BESTIARY_URL>/crawlspace-bestiary.zip.
 *
 *   node tools/build-bestiary-module.mjs ["…/Dungeon Crawler Carl RPG/output/bestiary-site"]
 */
import fs from 'node:fs'
import path from 'node:path'
import { zipSync } from 'fflate'
import { ROOT } from './lib.mjs'

const MODULE_ID = 'crawlspace-bestiary'
const site = process.argv[2] ?? process.env.BESTIARY_SITE ?? path.resolve(ROOT, '..', 'Dungeon Crawler Carl RPG', 'output', 'bestiary-site')
const code = path.join(ROOT, 'modules', MODULE_ID)
const out = path.join(ROOT, 'build', MODULE_ID)
for (const file of ['entries.json', 'media.json']) if (!fs.existsSync(path.join(site, file))) throw new Error(`No ${file} in ${site}. Pass the app's output/bestiary-site folder.`)

const env = Object.fromEntries(
  (fs.existsSync(path.join(ROOT, '.env')) ? fs.readFileSync(path.join(ROOT, '.env'), 'utf8') : '')
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/))
    .filter(Boolean)
    .map((match) => [match[1], match[2]]),
)
const baseUrl = (process.env.BESTIARY_URL ?? env.BESTIARY_URL ?? '').replace(/\/+$/, '')

const read = (file) => JSON.parse(fs.readFileSync(path.join(site, file), 'utf8'))
const entries = read('entries.json')
const media = read('media.json')
const system = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'))
const moduleVersion = JSON.parse(fs.readFileSync(path.join(code, 'version.json'), 'utf8')).version

fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(path.join(out, 'data'), { recursive: true })

// portraits/goblin.png → { painted: media/portraits/goblin.avif, anime: …, pixel: … }, copying each preview.
const copied = new Set()
const styleKey = { painted: (file) => file, anime: (file) => file.replace('portraits/', 'portraits/anime/'), pixel: (file) => file.replace('portraits/', 'portraits/pixel/') }
const catalogue = entries.map((entry) => {
  const portraits = {}
  if (entry.portrait_file)
    for (const [style, keyOf] of Object.entries(styleKey)) {
      const preview = media[keyOf(entry.portrait_file)]?.preview
      if (!preview) continue
      portraits[style] = `media/${preview}`
      if (copied.has(preview)) continue
      fs.mkdirSync(path.dirname(path.join(out, 'media', preview)), { recursive: true })
      fs.copyFileSync(path.join(site, 'media', preview), path.join(out, 'media', preview))
      copied.add(preview)
    }
  const { portrait_file: _portrait, ...rest } = entry
  return { ...rest, portraits }
})
fs.writeFileSync(path.join(out, 'data', 'catalogue.json'), JSON.stringify({ entries: catalogue }))

for (const file of ['bestiary.mjs', 'bestiary.css', 'lang/en.json']) {
  fs.mkdirSync(path.dirname(path.join(out, file)), { recursive: true })
  fs.copyFileSync(path.join(code, file), path.join(out, file))
}

const manifest = {
  id: MODULE_ID,
  title: 'CrawlSpace: Bestiary',
  description: 'The CrawlSpace bestiary: mobs, bosses, crawlers and NPCs with painted, anime and pixel-art portraits. Built locally; not for distribution.',
  version: moduleVersion,
  compatibility: { minimum: '14', verified: system.compatibility?.verified ?? '14', maximum: '14' },
  authors: [{ name: 'Mythaell' }],
  relationships: { systems: [{ id: 'crawlspace', type: 'system', compatibility: { minimum: '0.9.8.4' } }] },
  esmodules: ['bestiary.mjs'],
  styles: ['bestiary.css'],
  languages: [{ lang: 'en', name: 'English', path: 'lang/en.json' }],
  ...(baseUrl ? { manifest: `${baseUrl}/module.json`, download: `${baseUrl}/${MODULE_ID}.zip` } : {}),
}
fs.writeFileSync(path.join(out, 'module.json'), JSON.stringify(manifest, null, 2) + '\n')

// module.json at the zip root, like the system release.
const files = {}
const walk = (dir) => {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full)
    else files[`${path.relative(out, full).replaceAll('\\', '/')}`] = [fs.readFileSync(full), { level: 0 }]
  }
}
walk(out)
const zip = zipSync(files)
fs.writeFileSync(path.join(ROOT, 'build', `${MODULE_ID}.zip`), zip)
console.log(`Built build/${MODULE_ID} ${moduleVersion}: ${catalogue.length} entries, ${copied.size} portraits, ${(zip.length / 1024 / 1024).toFixed(1)} MB zipped.`)
if (!baseUrl) console.log('No BESTIARY_URL set: module.json has no manifest or download URL (manual install only).')
