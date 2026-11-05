/** Announce immunity removals once, on the active GM, after native effects recalculate. */
import { immunityRemovalText, pickImmunityTaunt } from '../rules/immunity-taunts'
import { debuffById } from '../rules/debuffs'

export async function announceImmunity(actor: any, condition: string) {
  const esc = foundry.utils.escapeHTML
  return ChatMessage.create({ speaker: { alias: 'System AI' }, content: `<div class="crawlspace chat-card"><p>${esc(immunityRemovalText(actor.name, condition))}</p><p>${esc(pickImmunityTaunt())}</p></div>` })
}

export function registerImmunity() {
  const pending = new Set<string>()
  const check = (document: any) => {
    const actor = document.documentName === 'Actor' ? document : document.actor ?? (document.parent?.documentName === 'Actor' ? document.parent : document.parent?.actor)
    if (!game.user.isActiveGM || !actor || pending.has(actor.uuid)) return
    pending.add(actor.uuid)
    setTimeout(async () => {
      try {
        const immunities = [...(actor.system.traits?.conditionImmunities ?? [])].map((name: any) => String(name).toLowerCase())
        const effects = actor.effects.filter((effect: any) => effect.active && ([effect.name, ...[...effect.statuses].map((id: any) => debuffById(id)?.name ?? '')].some((name: string) => immunities.includes(name.toLowerCase()))))
        if (effects.length) {
          await actor.deleteEmbeddedDocuments('ActiveEffect', effects.map((effect: any) => effect.id))
          for (const name of new Set(effects.map((effect: any) => effect.name))) await announceImmunity(actor, String(name))
        }
      } finally { pending.delete(actor.uuid) }
    }, 0)
  }
  for (const type of ['Actor', 'Item', 'ActiveEffect']) for (const action of ['create', 'update', 'delete']) Hooks.on(`${action}${type}`, check)
}
