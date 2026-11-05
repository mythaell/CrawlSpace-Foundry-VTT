/** Race/class cap exceptions unlock on Floor 7; gear cannot grant them. */
import { advancementCap } from '../rules/advancementCaps'

export function rankCap(actor: any, name: string) {
  const abilities = (actor?.items?.contents ?? []).filter((item: any) => ['race', 'class'].includes(item.type) || (item.type === 'ability' && ['racial', 'class'].includes(item.system.category)))
  return advancementCap(name, actor?.system?.details?.floor ?? 1, abilities.map((item: any) => ({
    name: `${item.name} ${item.system.description ?? ''}`,
    properties: { effects: (actor.system.specials ?? []).filter((entry: any) => entry.itemId === item.id && entry.type === 'rankCap') },
  })))
}
