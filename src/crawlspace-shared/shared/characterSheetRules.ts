import { abilityScoreModifier } from './abilityScores'

export const unarmedAttackSkillNames = new Set([
  'backclaw',
  'bite',
  'sliceattack',
  'footsoldier',
  'nogginnocker',
  'pugilism',
  'unarmedcombat',
  'wrasslin',
  'rakingtalons',
  'palmfighter',
  'heelstriker',
  'shouldercharger',
  'grappleartist',
])

// Explicit choices override the legacy names used by older saved skills.
export const isUnarmedSkill = (skill: { name: string; isUnarmed?: boolean }) =>
  skill.isUnarmed ?? unarmedAttackSkillNames.has(normalizeSkillName(skill.name))

export const normalizeSkillName = (name: string) =>
  name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '')

export const generalCheckPenaltyEffects = [
  { label: 'Fatigued', value: -1 },
  { label: 'Long-Term Major Injury', value: -5 },
  { label: 'Long-Term Minor Injury', value: -2 },
  { label: 'Major Injury', value: -5 },
  { label: 'Minor Injury', value: -2 },
  { label: 'Sore as Shit', value: -1 },
]

export const getAttributeModifier = (value: string) => {
  if (value === '') return ''

  const attribute = Number(value)

  if (!Number.isFinite(attribute)) return ''

  return String(abilityScoreModifier(attribute))
}
