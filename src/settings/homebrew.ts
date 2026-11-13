/**
 * The system's homebrew compendiums can be turned off. Foundry builds its compendiums from game.data.packs after
 * init, so leaving them out there removes them everywhere: the Compendium tab, the sheets' "Add from Database" and
 * every lookup that walks game.packs. Changing the setting reloads the world.
 */
export const HOMEBREW_PACKS = ['homebrew-skills', 'homebrew-spells', 'homebrew-items']

export function registerHomebrewSetting() {
  game.settings.register('crawlspace', 'homebrewCompendium', {
    name: 'CRAWLSPACE.Settings.Homebrew.Name',
    hint: 'CRAWLSPACE.Settings.Homebrew.Hint',
    scope: 'world',
    config: true,
    restricted: true,
    type: Boolean,
    default: true,
    requiresReload: true,
  })
  if (game.settings.get('crawlspace', 'homebrewCompendium') !== false) return
  const hidden = ids()
  game.data.packs = game.data.packs.filter((pack: any) => !hidden.has(pack.id))
  hideEmptyFolder()
}

/**
 * Foundry made a world folder for the homebrew packs (system.json packFolders). With the packs gone it would sit empty
 * in the Compendium tab, so it's left out too, unless the GM has put other compendiums or folders in it.
 */
function hideEmptyFolder() {
  const name = game.system.packFolders ? [...game.system.packFolders].find((folder: any) => [...folder.packs].some((pack: string) => HOMEBREW_PACKS.includes(pack)))?.name : null
  const folder = name && game.data.folders.find((entry: any) => entry.type === 'Compendium' && entry.name === name && !entry.folder)
  if (!folder) return
  let configuration: Record<string, any> = {}
  try {
    const raw = game.data.settings.find((setting: any) => setting.key === 'core.compendiumConfiguration')?.value
    configuration = (typeof raw === 'string' ? JSON.parse(raw) : raw) ?? {}
  } catch { return }
  const used = Object.entries(configuration).some(([pack, entry]: [string, any]) => entry?.folder === folder._id && !ids().has(pack))
  if (used || game.data.folders.some((entry: any) => entry.folder === folder._id)) return
  game.data.folders = game.data.folders.filter((entry: any) => entry !== folder)
}

const ids = () => new Set(HOMEBREW_PACKS.map((name) => `crawlspace.${name}`))
