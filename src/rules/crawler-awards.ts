/** Pure module: blank preserves, signed numbers modify, unsigned numbers replace (crawlerAwards.ts). */
export function awardNumber(input: string, current: number) {
  if (!input.trim()) return current
  if (!/^[+-]?\d+(?:\.\d+)?$/.test(input.trim())) throw new Error('CRAWLSPACE.Awards.InvalidNumber')
  const next = /^[+-]/.test(input.trim()) ? current + Number(input) : Number(input)
  if (!Number.isFinite(next)) throw new Error('CRAWLSPACE.Awards.InvalidNumber')
  return Math.floor(next)
}

/** Normalize the tier/type in a sealed box name, as CrawlSpace does; a known box type keeps its own spelling. */
export function boxIdentity(name: string, types: readonly string[] = []) {
  const tier = ['Bronze', 'Silver', 'Gold', 'Platinum', 'Legendary', 'Celestial'].find((tier) => new RegExp(`\\b${tier}\\b`, 'i').test(name)) ?? 'Bronze'
  const typed = name.replace(new RegExp(`\\b${tier}\\b`, 'i'), '').replace(/\b(?:loot\s*)?box(?:es)?\b/gi, '').trim() || 'Adventurer'
  const type = types.find((known) => known.toLowerCase() === typed.toLowerCase()) ?? typed
  return { tier, boxType: type, name: `${tier} ${type} Box` }
}
