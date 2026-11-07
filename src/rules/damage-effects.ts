/**
 * Damage effect skills (damageEffectSkills.ts) and which items get an automatic attack row. A damage effect skill
 * names the attack skills it modifies; on those attacks it is an optional toggle (off until ticked) that adds its
 * damage at its Rank, and can add its Rank to the attack roll or set the roll's mode (Aiming: both, keep lower).
 * Pure, so tests can import it.
 */
export type RollModeName = 'normal' | 'advantage' | 'disadvantage'

const normalize = (name: unknown) => String(name ?? '').trim().replace(/\s+/g, ' ').toLowerCase()

/**
 * Items that get an automatic attack row. A weapon needs to be equipped, unbroken and to name its skill in its
 * details; it then stands in for that skill, whose own row goes. Broken items never attack.
 */
export function automaticAttackItems<T extends { id: string; type: string; system: any }>(items: T[], skillOf: (item: T) => { id: string } | null) {
  const weapons = items.filter((item) => item.type === 'weapon' && item.system.equipped && !item.system.broken && String(item.system.skill ?? '').trim())
  const replaced = new Set(weapons.map((weapon) => skillOf(weapon)?.id).filter(Boolean))
  return items.filter((item) => {
    if (item.system.broken) return false
    if (item.type === 'weapon') return weapons.includes(item)
    if (item.type === 'consumable') return item.system.consumableType === 'explosives'
    if (item.type === 'skill' || item.type === 'spell') return !!item.system.isAttack && !replaced.has(item.id)
    return false
  })
}

/** Explicit settings win; Aiming supplies its established defaults (its Rank on the roll, keep lower). */
export function damageEffectSettings(skill: { name: string; addRank?: boolean | null; mode?: string | null }) {
  const aiming = /^(aim|aiming)$/.test(normalize(skill.name))
  const mode = ['normal', 'advantage', 'disadvantage'].includes(String(skill.mode)) ? (skill.mode as RollModeName) : aiming ? 'disadvantage' : 'normal'
  return { addRank: skill.addRank ?? aiming, mode }
}

export type DamageEffectSkill = {
  name: string
  rank: number
  effect: { enabled: boolean; skills: string[]; addRank?: boolean | null; mode?: string | null }
  /** Damage at the skill's Rank: the part a Critical Hit doubles, and its Rank dice (added once). */
  damage: { base: string; dice: string }
}

/** The attack roll toggles for an attack made with `attackSkill`. */
export function linkedDamageEffects(skills: DamageEffectSkill[], attackSkill: string) {
  const target = normalize(attackSkill)
  if (!target) return []
  return skills.flatMap((skill) => {
    if (!skill.effect.enabled || !skill.effect.skills.some((name) => normalize(name) === target)) return []
    if (!(skill.rank > 0)) return []
    const settings = damageEffectSettings({ name: skill.name, addRank: skill.effect.addRank, mode: skill.effect.mode })
    const damage = String(skill.damage.base ?? '').trim()
    const undoubled = String(skill.damage.dice ?? '').trim()
    if (!damage && !undoubled && !settings.addRank && settings.mode === 'normal') return []
    return [
      {
        label: skill.name,
        value: settings.addRank ? skill.rank : 0,
        enabled: false,
        rollMode: settings.mode === 'normal' ? undefined : settings.mode,
        damage,
        undoubled,
      },
    ]
  })
}

/** Ticked effects constrain the roll: keep-lower wins, then keep-higher (damageEffectSkills.ts effectRollMode). */
export function toggledRollMode(mode: RollModeName, ticked: { rollMode?: RollModeName }[]): RollModeName {
  if (ticked.some((modifier) => modifier.rollMode === 'disadvantage')) return 'disadvantage'
  if (mode !== 'disadvantage' && ticked.some((modifier) => modifier.rollMode === 'advantage')) return 'advantage'
  return mode
}
