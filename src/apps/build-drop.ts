/**
 * Race, class, background and deity on the character tab: a button beside each field opens the compendiums that
 * hold them (official and homebrew), opened at the right folder; dropping one onto the sheet fills the field.
 * A race or class also brings its benefits and detriments as abilities.
 */
const { DialogV2 } = foundry.applications.api

type BuildKind = 'race' | 'class' | 'background' | 'deity'

const SOURCES: Record<BuildKind, { packs: string[]; type: string; folders: (stage?: string) => string[] }> = {
  race: { packs: ['crawlspace-content.races-classes', 'crawlspace.homebrew-items'], type: 'race', folders: () => ['Races', 'Race'] },
  class: { packs: ['crawlspace-content.races-classes', 'crawlspace.homebrew-items'], type: 'class', folders: () => ['Classes', 'Class'] },
  background: {
    packs: ['crawlspace-content.backgrounds', 'crawlspace.homebrew-items'],
    type: 'background',
    folders: (stage) => [stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : '', 'Backgrounds'].filter(Boolean),
  },
  deity: { packs: ['crawlspace-content.lore'], type: 'JournalEntry', folders: () => ['Deity', 'Deities'] },
}

/** Open every pack that holds this kind of entry, with only its folder expanded. */
export async function openBuildPacks(kind: BuildKind, stage?: string) {
  const source = SOURCES[kind]
  const wanted = source.folders(stage).map((name) => name.toLowerCase())
  const opened: Promise<unknown>[] = []
  for (const id of source.packs) {
    const pack = game.packs.get(id)
    if (!pack) continue
    if (pack.documentName === 'JournalEntry' && !(pack.folders ?? []).some((folder: any) => wanted.includes(String(folder.name).toLowerCase()))) continue
    if (pack.documentName === 'Item') {
      const index = await pack.getIndex({ fields: ['system.stage'] })
      const has = index.some((entry: any) => entry.type === source.type && (!stage || kind !== 'background' || entry.system?.stage === stage))
      if (!has) continue
    }
    for (const folder of pack.folders ?? []) {
      if (wanted.includes(String(folder.name).toLowerCase())) game.folders._expanded[folder.uuid] = true
      else delete game.folders._expanded[folder.uuid]
    }
    opened.push(pack.render(true))
  }
  if (!opened.length) ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.NoBuildContent', { kind: game.i18n.localize(`CRAWLSPACE.Build.Kind${kind}`) }))
  return Promise.all(opened)
}

/** Abilities a race or class gives: one per benefit and detriment. */
export function buildAbilities(item: any) {
  const category = item.type === 'race' ? 'racial' : 'class'
  const entries = [
    ...(item.system.benefits ?? []).map((entry: any) => ({ entry, detriment: false })),
    ...(item.system.detriments ?? []).map((entry: any) => ({ entry, detriment: true })),
  ]
  return entries
    .filter(({ entry }) => String(entry.name ?? '').trim())
    .map(({ entry, detriment }) => {
      const target = String(entry.target ?? '').trim()
      const links = (entry.links ?? []).map((link: any) => link.name).filter(Boolean)
      const text = [entry.description, target && `${game.i18n.localize('CRAWLSPACE.Build.Target')}: ${target}`, links.length && links.join(', ')].filter(Boolean)
      return {
        name: entry.name.trim(),
        type: 'ability',
        img: item.img,
        system: {
          category,
          description: text.map((line: string) => `<p>${foundry.utils.escapeHTML(String(line))}</p>`).join(''),
          notes: detriment ? game.i18n.localize('CRAWLSPACE.Build.Detriment') : '',
        },
        flags: { crawlspace: { grantedBy: item.name, detriment } },
      }
    })
}

/**
 * A race or class dropped from a compendium or the sidebar: it replaces the crawler's current one (and the
 * abilities that came with it), fills the field, and adds its abilities.
 */
export async function applyBuildItem(actor: any, item: any) {
  const field = item.type === 'race' ? 'system.details.race' : 'system.details.className'
  const current = actor.items.filter((owned: any) => owned.type === item.type)
  if (current.length) {
    const ok = await DialogV2.confirm({
      window: { title: game.i18n.localize(`TYPES.Item.${item.type}`) },
      content: `<p>${game.i18n.format('CRAWLSPACE.Build.Replace', { old: current.map((owned: any) => foundry.utils.escapeHTML(owned.name)).join(', '), new: foundry.utils.escapeHTML(item.name) })}</p>`,
      rejectClose: false,
    })
    if (!ok) return null
    const names = new Set(current.map((owned: any) => owned.name))
    const granted = actor.items.filter((owned: any) => owned.type === 'ability' && names.has(owned.flags?.crawlspace?.grantedBy))
    await actor.deleteEmbeddedDocuments('Item', [...current, ...granted].map((owned: any) => owned.id))
  }
  const data = game.items.fromCompendium(item)
  const owned = new Set(actor.items.filter((entry: any) => entry.type === 'ability').map((entry: any) => entry.name.toLowerCase()))
  const abilities = buildAbilities(item).filter((ability) => !owned.has(ability.name.toLowerCase()))
  const created = await actor.createEmbeddedDocuments('Item', [data, ...abilities])
  await actor.update({ [field]: item.name })
  ui.notifications.info(game.i18n.format('CRAWLSPACE.Build.Added', { name: item.name, count: abilities.length }))
  return created
}

/** A background fills its stage's field, replacing the crawler's background for that stage. */
export async function applyBackground(actor: any, item: any) {
  const stage = item.system.stage ?? 'childhood'
  const old = actor.items.filter((owned: any) => owned.type === 'background' && owned.system.stage === stage)
  if (old.length) await actor.deleteEmbeddedDocuments('Item', old.map((owned: any) => owned.id))
  const created = await actor.createEmbeddedDocuments('Item', [game.items.fromCompendium(item)])
  await actor.update({ [`system.background.${stage}`]: item.name })
  return created
}
