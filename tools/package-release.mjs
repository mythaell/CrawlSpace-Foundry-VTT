/**
 * Packages a release: release/system.json and release/system.zip, ready to attach to a GitHub Release.
 *
 *   npm run release -- v0.1.0 [owner/repo]
 *
 * Build first (`npm run build`, then the homebrew and action packs). The repo defaults to GITHUB_REPOSITORY
 * (set in GitHub Actions) or the one in package.json.
 */
import fs from 'node:fs'
import path from 'node:path'
import { zipSync } from 'fflate'
import { releaseEntries, releaseManifest } from './release-lib.mjs'

const ROOT = path.resolve(import.meta.dirname, '..')
const [tag, repoArgument] = process.argv.slice(2)
if (!tag) throw new Error('Usage: npm run release -- v<version> [owner/repo]')
const packageRepo = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).repository?.url?.match(/github\.com\/([^/]+\/[^/.]+)/)?.[1]
const repo = repoArgument || process.env.GITHUB_REPOSITORY || packageRepo
if (!repo) throw new Error('Name the GitHub repository: npm run release -- v<version> owner/repo')

const system = JSON.parse(fs.readFileSync(path.join(ROOT, 'system.json'), 'utf8'))
const manifest = releaseManifest(system, { repo, tag })

const walk = (dir) =>
  fs.existsSync(path.join(ROOT, dir))
    ? fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true }).flatMap((entry) => {
        const file = `${dir}/${entry.name}`
        return entry.isDirectory() ? walk(file) : [file]
      })
    : []
const files = ['dist', 'styles', 'templates', 'lang', 'assets', 'packs'].flatMap(walk)
const entries = releaseEntries(system, files)

const manifestJson = `${JSON.stringify(manifest, null, 2)}\n`
const zip = zipSync(
  Object.fromEntries([['system.json', new TextEncoder().encode(manifestJson)], ...entries.map((file) => [file, fs.readFileSync(path.join(ROOT, file))])]),
  { level: 9 },
)
const out = path.join(ROOT, 'release')
fs.rmSync(out, { recursive: true, force: true })
fs.mkdirSync(out)
fs.writeFileSync(path.join(out, 'system.json'), manifestJson)
fs.writeFileSync(path.join(out, 'system.zip'), zip)
console.log(`release/system.zip: ${entries.length + 1} files, ${(zip.length / 1024 / 1024).toFixed(1)} MB`)
console.log(`Manifest URL: ${manifest.manifest}`)
