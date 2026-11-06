/** Build points are costs: two points buy one ordinary rank or one DR, not part of a skill's name. */
export function raceClassGrant(
  raw: string,
  rank?: unknown,
  points?: unknown,
  fallback?: 'skill' | 'spell',
  unusual = false,
) {
  const cost = raw.match(/[\[(]\s*(\d+)\s*[\[(]?\s*points?\s*[\])]*/i)
  const stripped = raw
    .replace(/\s*[\[(]\s*\d+\s*[\[(]?\s*points?\s*[\])]*/gi, '')
    .replace(/\s*\(passive\)/gi, '')
    .trim()
  const explicit = stripped.match(/^\+?(\d+)\s+(.+)$/)
  let name = explicit ? explicit[2] : stripped
  const kind: 'dr' | 'skill' | 'spell' | undefined = /^(?:DR|Damage Reduction)(?:\s+(?:buff|bonus))?$/i.test(name)
    ? 'dr'
    : /\bspells?$/i.test(name)
      ? 'spell'
      : /\bskills?$/i.test(name)
        ? 'skill'
        : fallback
  if (!kind) return null
  const grouped = /\b(?:spells|skills)$/i.test(name)
  name = name.replace(/\s+(?:skills?|spells?)\.?$/i, '').trim()
  const names = grouped ? name.split(/\s+and\s+|\s*&\s*|\s*,\s*/i).filter(Boolean) : [name]
  const actualRank = Number(rank) || Number(explicit?.[1])
  const buildPoints = Number(points) || Number(cost?.[1])
  const amount = actualRank || (buildPoints ? Math.floor(buildPoints / (unusual ? 4 : 2) / names.length) : 0)
  return { kind, names, amount: kind === 'dr' ? Math.min(3, amount) : amount }
}

/** Remove only untouched placeholders made by this exact race/class's old import. */
export function legacyGrantPlaceholder(
  skill: {
    name: string
    unenhancedRank: string
    raceClassRankBonus?: number
    details: string
    notes: string
    completed: boolean
    stat: string
    checkType: string
    effects: unknown[]
  },
  priorTargets: Set<string>,
) {
  return (
    priorTargets.has(skill.name) &&
    /[\[(]\s*\d+\s*[\[(]?\s*points?/i.test(skill.name) &&
    Boolean(raceClassGrant(skill.name)) &&
    Number(skill.unenhancedRank) - (Number(skill.raceClassRankBonus) || 0) === 0 &&
    !skill.details.trim() &&
    !skill.notes.trim() &&
    !skill.completed &&
    !skill.stat &&
    !skill.checkType &&
    !skill.effects.length
  )
}
