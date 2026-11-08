/**
 * What a release ships. Foundry installs a system from two public files: system.json (the manifest)
 * and system.zip. The zip holds the built system only: never sources, the book-text content module
 * (build/), local settings or packs that system.json does not list.
 */

/** system.json for a release: Foundry checks `manifest` for updates and installs from `download`. */
export function releaseManifest(system, { repo, tag }) {
  if (tag !== `v${system.version}`) throw new Error(`Tag ${tag} does not match system.json version ${system.version}; tag v${system.version}.`)
  const base = `https://github.com/${repo}/releases`
  return {
    ...system,
    manifest: `${base}/latest/download/system.json`,
    download: `${base}/download/${tag}/system.zip`,
  }
}

const shippedFolders = ['dist/', 'styles/', 'templates/', 'lang/', 'assets/']
// LevelDB's lock and logs belong to whoever has the pack open, not to the pack.
const packNoise = /\/(LOCK|LOG|LOG\.old)$/

/** The files (relative, forward slashes) that go in system.zip, besides system.json itself. */
export function releaseEntries(system, files) {
  const packs = (system.packs ?? []).map((pack) => `${pack.path.replace(/\/$/, '')}/`)
  const entries = files
    .filter((file) => !file.endsWith('.map'))
    .filter(
      (file) =>
        shippedFolders.some((folder) => file.startsWith(folder)) ||
        (packs.some((pack) => file.startsWith(pack)) && !packNoise.test(file)),
    )
    .sort()
  const required = [...(system.esmodules ?? []), ...(system.styles ?? []), ...(system.languages ?? []).map((language) => language.path)]
  for (const file of required) if (!entries.includes(file)) throw new Error(`The release is missing ${file}; run the build first.`)
  for (const pack of packs) if (!entries.some((file) => file.startsWith(pack))) throw new Error(`The release is missing the compiled ${pack}; run the pack build first.`)
  return entries
}
