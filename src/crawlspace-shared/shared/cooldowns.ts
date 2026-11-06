import { createSpell, type ContentLink, type EffectProperty, type SpellEntry } from './contentModels'

/** One use of a Skill, Spell or inherent Spell that is waiting out its cooldown. With a
 * running GM timer the party clock removes it after `duration` of in-game time; without
 * timers it stays until someone resets it. */
export type ActiveCooldown = {
  id: string
  key: string
  name: string
  duration: string
  startedAt: string
}
export const skillCooldownKey = (id: string) => `skill:${id}`
export const spellCooldownKey = (id: string) => `spell:${id}`
export const inherentCooldownKey = (grantKey: string) => `inherent:${grantKey}`

const rows = (value: unknown): Record<string, any>[] => (Array.isArray(value) ? value : [])
export function activeCooldowns(data: Record<string, unknown>): ActiveCooldown[] {
  return rows(data.cooldowns).filter(
    (entry): entry is ActiveCooldown => typeof entry.id === 'string' && typeof entry.key === 'string',
  ) as ActiveCooldown[]
}
export const cooldownFor = (cooldowns: readonly ActiveCooldown[], key: string) =>
  cooldowns.find((entry) => entry.key === key)
/** Starts (or restarts) a cooldown. A blank cooldown is not tracked. */
export function startCooldown(
  cooldowns: readonly ActiveCooldown[],
  key: string,
  name: string,
  duration: string,
  newId: () => string = () => crypto.randomUUID(),
  now = new Date(),
): ActiveCooldown[] {
  if (!duration.trim()) return [...cooldowns]
  return [
    ...cooldowns.filter((entry) => entry.key !== key),
    { id: newId(), key, name, duration: duration.trim(), startedAt: now.toISOString() },
  ]
}
export const clearCooldown = (cooldowns: readonly ActiveCooldown[], key: string) =>
  cooldowns.filter((entry) => entry.key !== key)

/** An inherent Spell granted by an Inherent Spell effect or a legacy item Spell grant. Its Rank
 * is fixed: Spell Rank effects only raise Spells the crawler has learned. It costs no Mana. */
export type InherentSpellGrant = {
  key: string
  name: string
  rank: string
  cooldown: string
  source: string
  spell: SpellEntry
  contentLink?: ContentLink
  /** Legacy item grants marked used before cooldowns moved to the sheet's cooldown list. */
  legacyCooldown?: boolean
  itemId?: string
  grantId?: string
}
/** The current data of the database Spell an inherent Spell links to (or, without a link, the one
 * with its name), when it is loaded; otherwise the copy saved with the link is used. */
export type LinkedSpellLookup = (link: ContentLink | undefined, name: string) => Record<string, unknown> | undefined
const spellFromLink = (name: string, link?: ContentLink, lookup?: LinkedSpellLookup): SpellEntry => ({
  ...createSpell(),
  ...((lookup?.(link, name) ?? link?.data ?? {}) as Partial<SpellEntry>),
  name,
})
function effectGrants(
  effects: unknown,
  ownerKey: string,
  source: string,
  rank?: number,
  lookup?: LinkedSpellLookup,
): InherentSpellGrant[] {
  return rows(effects)
    .filter((effect: Partial<EffectProperty>) => effect.type === 'inherentSpell' && String(effect.target ?? '').trim())
    .filter(
      (effect: Partial<EffectProperty>) =>
        rank === undefined || !String(effect.requiredRank ?? '').trim() || rank >= Number(effect.requiredRank),
    )
    .map((effect: Partial<EffectProperty>) => ({
      key: `${ownerKey}:${effect.id}`,
      name: String(effect.target).trim(),
      rank: String(effect.value || '1'),
      cooldown: String(effect.cooldown ?? ''),
      source,
      spell: spellFromLink(String(effect.target).trim(), effect.contentLink, lookup),
      contentLink: effect.contentLink,
    }))
}
/** Every inherent Spell the sheet currently grants: equipped items, active buffs, abilities
 * and Skills (honoring an effect's required Rank). A linked database Spell supplies its current
 * Stat, Range, Check Type and details through `lookup`. */
export function inherentSpellGrants(data: Record<string, unknown>, lookup?: LinkedSpellLookup): InherentSpellGrant[] {
  const grants: InherentSpellGrant[] = []
  for (const item of rows(data.inventory)) {
    if (!item.equipped) continue
    const name = String(item.name || 'Equipped item')
    grants.push(...effectGrants(item.properties?.effects, `item:${item.id}`, name, undefined, lookup))
    for (const grant of rows(item.properties?.spells))
      if (grant.usage === 'inherent' && grant.spell?.name)
        grants.push({
          key: `item:${item.id}:${grant.id}`,
          name: String(grant.spell.name),
          rank: String(grant.rank || '1'),
          cooldown: String(grant.cooldown ?? ''),
          source: name,
          spell: { ...createSpell(), ...grant.spell, ...lookup?.(grant.contentLink, String(grant.spell.name)) },
          contentLink: grant.contentLink,
          legacyCooldown: !!grant.cooldownUntil,
          itemId: String(item.id),
          grantId: String(grant.id),
        })
  }
  for (const field of ['internalBuffs', 'externalBuffs', 'customDebuffs'])
    for (const buff of rows(data[field]))
      if (buff.active)
        grants.push(
          ...effectGrants(buff.properties?.effects, `${field}:${buff.id}`, String(buff.name), undefined, lookup),
        )
  for (const field of ['racialAbilities', 'classAbilities', 'otherAbilities'])
    for (const ability of rows(data[field]))
      grants.push(
        ...effectGrants(ability.properties?.effects, `${field}:${ability.id}`, String(ability.name), undefined, lookup),
      )
  for (const skill of rows(data.skills))
    grants.push(
      ...effectGrants(
        skill.effects,
        `skill:${skill.id}`,
        String(skill.name),
        Number(skill.unenhancedRank) || 0,
        lookup,
      ),
    )
  return grants
}

/** Inherent Spells in the crawler's saved order; ones not in it yet follow, in grant order. */
export function orderInherentSpells<T extends { inherentGrantId: string }>(spells: T[], order: readonly string[]): T[] {
  const position = new Map(order.map((key, index) => [key, index]))
  const at = (spell: T, index: number) => position.get(spell.inherentGrantId) ?? order.length + index
  return spells
    .map((spell, index) => ({ spell, at: at(spell, index) }))
    .sort((a, b) => a.at - b.at)
    .map(({ spell }) => spell)
}
