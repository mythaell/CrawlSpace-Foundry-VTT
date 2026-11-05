/**
 * Link this repo into Foundry's user data as the `crawlspace` system, and the built content module
 * (if present) as `crawlspace-content`. Uses directory junctions on Windows, symlinks elsewhere.
 *
 *   npm run link                         uses %LOCALAPPDATA%/FoundryVTT/Data
 *   FOUNDRY_DATA=path npm run link       any other Data folder
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { ROOT } from './lib.mjs'

const defaultData =
  process.platform === 'win32'
    ? path.join(process.env.LOCALAPPDATA ?? path.join(os.homedir(), 'AppData', 'Local'), 'FoundryVTT', 'Data')
    : path.join(os.homedir(), '.local', 'share', 'FoundryVTT', 'Data')
const data = process.env.FOUNDRY_DATA ?? defaultData
if (!fs.existsSync(data)) {
  console.error(`Foundry Data folder not found: ${data}\nSet FOUNDRY_DATA to your Data folder.`)
  process.exit(1)
}

function link(target, linkPath) {
  const existing = fs.lstatSync(linkPath, { throwIfNoEntry: false })
  if (existing) {
    if (!existing.isSymbolicLink()) {
      console.error(`${linkPath} exists and is not a link; leaving it alone.`)
      return
    }
    if (path.resolve(fs.realpathSync(linkPath)) === path.resolve(fs.realpathSync(target))) {
      console.log(`Already linked: ${linkPath}`)
      return
    }
    fs.unlinkSync(linkPath)
  }
  fs.mkdirSync(path.dirname(linkPath), { recursive: true })
  fs.symlinkSync(target, linkPath, process.platform === 'win32' ? 'junction' : 'dir')
  console.log(`Linked ${linkPath} → ${target}`)
}

link(ROOT, path.join(data, 'systems', 'crawlspace'))
const content = path.join(ROOT, 'build', 'crawlspace-content')
if (fs.existsSync(path.join(content, 'module.json'))) link(content, path.join(data, 'modules', 'crawlspace-content'))
else console.log('Content module not built yet; run `npm run packs:content` first to link it.')
