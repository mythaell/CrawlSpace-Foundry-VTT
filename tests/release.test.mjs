import { test } from 'node:test'
import assert from 'node:assert/strict'
import { releaseManifest, releaseEntries } from '../tools/release-lib.mjs'

const system = {
  id: 'crawlspace',
  version: '0.1.0',
  esmodules: ['dist/crawlspace.mjs'],
  styles: ['styles/crawlspace.css'],
  languages: [{ lang: 'en', path: 'lang/en.json' }],
  packs: [{ name: 'actions', path: 'packs/actions' }],
  manifest: '',
  download: '',
}

test('a release points Foundry at the latest manifest and at its own zip', () => {
  const manifest = releaseManifest(system, { repo: 'mythaell/CrawlSpace-Foundry-VTT', tag: 'v0.1.0' })
  assert.equal(manifest.manifest, 'https://github.com/mythaell/CrawlSpace-Foundry-VTT/releases/latest/download/system.json')
  assert.equal(manifest.download, 'https://github.com/mythaell/CrawlSpace-Foundry-VTT/releases/download/v0.1.0/system.zip')
  assert.equal(system.download, '', 'the source manifest is left alone')
})

test('a tag that does not match system.json version is refused', () => {
  assert.throws(() => releaseManifest(system, { repo: 'a/b', tag: 'v0.2.0' }), /0\.1\.0/)
})

test('the zip carries the built system and nothing else', () => {
  const files = [
    'system.json',
    'LICENSE',
    'README.md',
    'dist/crawlspace.mjs',
    'dist/crawlspace.mjs.map',
    'styles/crawlspace.css',
    'templates/actor/crawler.hbs',
    'lang/en.json',
    'assets/crawlspace-logo.png',
    'packs/actions/000005.ldb',
    'packs/actions/CURRENT',
    'packs/actions/LOCK',
    'packs/actions/LOG',
    'packs/actions/LOG.old',
    'packs/content-only/000001.ldb',
    'build/crawlspace-content/module.json',
    'src/crawlspace.ts',
    'packs-src/actions/a.json',
    'node_modules/x/index.js',
    '.env',
  ]
  assert.deepEqual(releaseEntries(system, files), [
    'LICENSE',
    'assets/crawlspace-logo.png',
    'dist/crawlspace.mjs',
    'lang/en.json',
    'packs/actions/000005.ldb',
    'packs/actions/CURRENT',
    'styles/crawlspace.css',
    'templates/actor/crawler.hbs',
  ])
})

test('a release missing a file system.json needs is refused', () => {
  assert.throws(() => releaseEntries(system, ['dist/crawlspace.mjs', 'lang/en.json', 'packs/actions/CURRENT']), /styles\/crawlspace\.css/)
  assert.throws(() => releaseEntries(system, ['dist/crawlspace.mjs', 'styles/crawlspace.css', 'lang/en.json', 'packs/actions/CURRENT']), /LICENSE/)
  assert.throws(() => releaseEntries(system, ['dist/crawlspace.mjs', 'lang/en.json', 'styles/crawlspace.css']), /packs\/actions/)
})
