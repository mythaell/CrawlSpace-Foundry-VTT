/**
 * Mechanics written only in a race or class's benefit text: "Immunity to Poison", "Resistance to Fire damage",
 * "Vulnerable to Holy damage", "Fire and Acid Resistance". Only the published damage types count.
 */
import { damageTypes } from '../crawlspace-shared/shared/damageResponses.ts'

type Response = { type: 'damageResistance' | 'damageImmunity' | 'damageVulnerability'; target: string }

const KIND = (word: string): Response['type'] =>
  /^immun/i.test(word) ? 'damageImmunity' : /^resist/i.test(word) ? 'damageResistance' : 'damageVulnerability'
const TYPES = damageTypes.join('|')
const LIST = `(?:${TYPES})(?:\\s*(?:,|and|or|&)\\s*(?:${TYPES}))*`
/** "Immunity to Fire", "vulnerable to Ice and Holy damage" */
const AFTER = new RegExp(`\\b(immunity|immune|resistance|resistant|vulnerability|vulnerable)\\s+(?:to|against)\\s+(${LIST})\\b`, 'gi')
/** "Fire Resistance", "Fire and Acid Immunity" */
const BEFORE = new RegExp(`\\b(${LIST})\\s+(immunity|resistance|vulnerability)\\b`, 'gi')

export function damageResponsesFromText(text: string): Response[] {
  const found: { at: number; response: Response }[] = []
  const add = (at: number, word: string, list: string) => {
    for (const name of list.split(/\s*(?:,|\band\b|\bor\b|&)\s*/i)) {
      const target = damageTypes.find((type) => type.toLowerCase() === name.trim().toLowerCase())
      if (target) found.push({ at, response: { type: KIND(word), target } })
    }
  }
  for (const match of String(text ?? '').matchAll(AFTER)) add(match.index ?? 0, match[1], match[2])
  for (const match of String(text ?? '').matchAll(BEFORE)) add(match.index ?? 0, match[2], match[1])
  const seen = new Set<string>()
  return found
    .sort((a, b) => a.at - b.at)
    .map((entry) => entry.response)
    .filter((response) => {
      const key = `${response.type}:${response.target}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
}
