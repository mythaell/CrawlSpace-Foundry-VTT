/**
 * Uploads build/crawlspace-bestiary.zip and its module.json to the unlisted R2 folder named by BESTIARY_URL, so
 * Foundry can install and update the module from <BESTIARY_URL>/module.json.
 *
 * Settings, in this repository's .env (never committed):
 *   BESTIARY_URL     public base URL of the folder, e.g. https://pub-….r2.dev/<long random folder>
 *   BESTIARY_BUCKET  the R2 bucket behind that URL
 * R2 credentials (R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY) come from the CrawlSpace app's .env.
 *
 *   npm run bestiary && node tools/upload-bestiary-module.mjs
 */
import fs from 'node:fs'
import path from 'node:path'
import dotenv from 'dotenv'
import { AwsClient } from 'aws4fetch'
import { ROOT, loadCrawlSpaceEnv } from './lib.mjs'

loadCrawlSpaceEnv()
dotenv.config({ path: path.join(ROOT, '.env'), quiet: true, override: true })
const { BESTIARY_URL, BESTIARY_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env
for (const [name, value] of Object.entries({ BESTIARY_URL, BESTIARY_BUCKET, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY }))
  if (!value) throw new Error(`${name} is not set.`)

const folder = new URL(BESTIARY_URL).pathname.replace(/^\/+|\/+$/g, '')
const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'build', 'crawlspace-bestiary', 'module.json'), 'utf8'))
if (manifest.manifest !== `${BESTIARY_URL.replace(/\/+$/, '')}/module.json`) throw new Error('module.json was built without this BESTIARY_URL. Run npm run bestiary first.')

const r2 = new AwsClient({ accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY, service: 's3', region: 'auto' })
const put = async (name, body, type) => {
  const url = `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com/${BESTIARY_BUCKET}/${folder ? `${folder}/` : ''}${name}`
  // Foundry checks the manifest for updates, so it must not be cached for long.
  const response = await r2.fetch(url, { method: 'PUT', body, headers: { 'Content-Type': type, 'Cache-Control': name.endsWith('.json') ? 'no-cache' : 'public, max-age=300' } })
  if (!response.ok) throw new Error(`Uploading ${name} returned ${response.status}: ${await response.text()}`)
  console.log(`Uploaded ${name} (${(body.length / 1024 / 1024).toFixed(1)} MB)`)
}
// The zip first, so the manifest never points at a download that isn't there yet.
await put('crawlspace-bestiary.zip', fs.readFileSync(path.join(ROOT, 'build', 'crawlspace-bestiary.zip')), 'application/zip')
await put('module.json', fs.readFileSync(path.join(ROOT, 'build', 'crawlspace-bestiary', 'module.json')), 'application/json')
console.log(`Manifest URL: ${BESTIARY_URL.replace(/\/+$/, '')}/module.json`)
