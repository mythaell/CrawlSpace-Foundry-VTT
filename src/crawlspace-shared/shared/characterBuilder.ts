import type { DatabaseContent } from '../api/types'
import { createDefaultSheet, createSkill, createSpell, createInventoryItem, createAttack } from './characterSheetModel'
import { copyDatabaseSkill, copyDatabaseSpell, copyDatabaseItem } from './characterSheetContent'
import { normalizeSkillName } from './characterSheetRules'
import {
  bookBackgrounds,
  bookCombat,
  builderStages,
  type BuilderSpecies,
  type BuilderStage,
  type BuilderBackground,
  type BuilderCombat,
} from './characterBuilderCatalog'

export type BuilderCatalogEntry = DatabaseContent & { source: 'game' | 'homebrew' }
export type BuilderDraft = {
  name: string
  species: BuilderSpecies
  animal: string
  crawlerNumber: string
  size: string
  backgrounds: Record<BuilderStage, { name: string; skills: string[] }>
  combat: string
  statMode: 'array' | 'roll'
  stats: string[]
  rolledStats: string[] | null
  storyLater: boolean
  story: { pastTrauma: string; looseEnds: string; regrets: string }
  gearLater: boolean
  clothing: string
  usefulItem: string
  weirdItem: string
}
export function newBuilderDraft(): BuilderDraft {
  return {
    name: '',
    species: 'human',
    animal: '',
    crawlerNumber: '',
    size: '4',
    backgrounds: {
      childhood: { name: '', skills: [] },
      adolescence: { name: '', skills: [] },
      career: { name: '', skills: [] },
      hobby: { name: '', skills: [] },
    },
    combat: '',
    statMode: 'array',
    stats: ['2', '3', '4', '5', '6'],
    rolledStats: null,
    storyLater: true,
    story: { pastTrauma: '', looseEnds: '', regrets: '' },
    gearLater: true,
    clothing: '',
    usefulItem: '',
    weirdItem: '',
  }
}
export function builderBackgroundOptions(
  entries: BuilderCatalogEntry[],
  species: BuilderSpecies,
  stage: BuilderStage,
): BuilderBackground[] {
  const options = new Map(
    bookBackgrounds.filter((item) => item.species === species && item.stage === stage).map((item) => [item.name, item]),
  )
  for (const entry of entries) {
    if (
      entry.content_type !== `background_${stage}` ||
      entry.data.species !== species ||
      !Array.isArray(entry.data.skills)
    )
      continue
    const links = Array.isArray(entry.data.skillLinks) ? entry.data.skillLinks : []
    const skills = entry.data.skills
      .map((name, index) => {
        const linked = entries.find(
          (skill) => skill.content_type === 'skill' && `${skill.source}-${skill.id}` === links[index],
        )
        return linked?.name ?? name
      })
      .filter((name): name is string => typeof name === 'string' && !!name.trim())
    if (skills.length < 2) continue
    options.set(entry.name, {
      name: entry.name,
      species,
      stage,
      skills,
      rank: [1, 1, 3, 2][builderStages.indexOf(stage)],
      homebrew: entry.source === 'homebrew',
    })
  }
  return [...options.values()]
}
export function builderCombatOptions(entries: BuilderCatalogEntry[]): BuilderCombat[] {
  const options = new Map(bookCombat.map((item) => [item.name, item]))
  for (const entry of entries) {
    const combat = entry.data.builderCombat as BuilderCombat | undefined
    if (combat && ['weapon', 'spell', 'unarmed'].includes(combat.kind) && typeof combat.skill === 'string') {
      const name =
        entry.content_type === 'weapon' || entry.content_type === 'spell' || combat.kind === 'unarmed'
          ? entry.name
          : combat.name
      options.set(combat.name, {
        ...combat,
        name,
        skill: entry.content_type === 'skill' || entry.content_type === 'spell' ? entry.name : combat.skill,
        homebrew: true,
      })
    }
  }
  return [...options.values()]
}
export function rollBuilderStats(random = Math.random) {
  const history: number[][] = []
  const stats = Array.from({ length: 5 }, () => {
    const rolls: number[] = []
    for (let attempt = 0; attempt < 1000; attempt++) {
      const die = 1 + Math.floor(random() * 6)
      rolls.push(die)
      if (die > 1) {
        history.push(rolls)
        return String(die)
      }
    }
    throw new Error('Could not roll a stat above 1. Try again.')
  })
  return { stats, history }
}
export function validateBuilderStep(draft: BuilderDraft, entries: BuilderCatalogEntry[], step: number): string {
  const combat = builderCombatOptions(entries).find((item) => item.name === draft.combat)
  if (step === 0) {
    if (!draft.name.trim()) return 'Enter a crawler name.'
    if (
      !/^\d+$/.test(draft.crawlerNumber) ||
      !Number.isSafeInteger(Number(draft.crawlerNumber)) ||
      Number(draft.crawlerNumber) < 1
    )
      return 'Enter a positive whole crawler number.'
    if (draft.species === 'animal' && (!draft.animal.trim() || !['2', '3', '4'].includes(draft.size)))
      return 'Enter an animal species and choose size 2, 3, or 4.'
    const seen = new Set<string>([normalizeSkillName(draft.species === 'human' ? 'Unarmed Combat' : 'Slice Attack')])
    for (const stage of builderStages) {
      const selected = draft.backgrounds[stage]
      const option = builderBackgroundOptions(entries, draft.species, stage).find((item) => item.name === selected.name)
      if (
        !option ||
        selected.skills.length !== 2 ||
        new Set(selected.skills).size !== 2 ||
        selected.skills.some((name) => !option.skills.includes(name))
      )
        return 'Choose one background and two skills for each stage.'
      for (const name of selected.skills) {
        const key = normalizeSkillName(name)
        if (seen.has(key)) return `Choose a different skill: ${name} is already granted by another choice.`
        seen.add(key)
      }
    }
  }
  if (step === 1) {
    if (!combat) return 'Choose a starting weapon, hand-to-hand skill, or attack spell.'
    const backgroundSkills = builderStages.flatMap((stage) => draft.backgrounds[stage].skills).map(normalizeSkillName)
    if (
      combat.kind !== 'spell' &&
      [combat.skill, ...(combat.effect ? [combat.effect] : [])].some((name) =>
        backgroundSkills.includes(normalizeSkillName(name)),
      )
    )
      return 'Your combat choice duplicates a background skill. Choose another combat option or adjust your background skills.'
  }
  if (step === 2) {
    if (draft.stats.length !== 5 || draft.stats.some((value) => !/^[2-6]$/.test(value)))
      return 'Every starting stat must be a whole number from 2 to 6.'
    if (draft.statMode === 'array' && [...draft.stats].sort().join(',') !== '2,3,4,5,6')
      return 'Assign each standard-array value (2, 3, 4, 5, 6) exactly once.'
    if (
      draft.statMode === 'roll' &&
      (!draft.rolledStats || draft.stats.some((value, index) => value !== draft.rolledStats![index]))
    )
      return 'Roll your stats in STR, INT, CON, DEX, CHA order.'
    if (combat?.kind === 'spell' && Number(draft.stats[1]) < 4)
      return 'A starting attack spell requires INT 4 or higher. Change your stat method or your combat choice.'
  }
  return ''
}
export function buildCrawler(draft: BuilderDraft, entries: BuilderCatalogEntry[]) {
  for (const step of [0, 1, 2]) {
    const error = validateBuilderStep(draft, entries, step)
    if (error) throw new Error(error)
  }
  const sheet = createDefaultSheet()
  const combat = builderCombatOptions(entries).find((item) => item.name === draft.combat)!
  const find = (name: string, kind: 'skill' | 'spell' | 'item') =>
    entries.find(
      (entry) =>
        normalizeSkillName(entry.name) === normalizeSkillName(name) &&
        (kind === 'item'
          ? entry.content_type === 'weapon' ||
            entry.content_type === 'consumable' ||
            entry.content_type.startsWith('equipment_') ||
            entry.content_type === 'other'
          : entry.content_type === kind),
    )
  const addSkill = (name: string, rank: number, linked?: BuilderCatalogEntry) => {
    const content = linked ?? find(name, 'skill')
    const skill = content ? copyDatabaseSkill(content) : createSkill(name)
    skill.name = name
    skill.unenhancedRank = String(rank)
    sheet.skills.push(skill)
    return skill
  }
  const addSpell = (name: string, rank: number) => {
    const content = find(name, 'spell')
    const spell = content ? copyDatabaseSpell(content) : createSpell(name)
    spell.name = name
    spell.unenhancedRank = String(rank)
    sheet.spells.push(spell)
    return spell
  }
  const addItem = (name: string, quantity = '1', blank = false) => {
    const content = blank ? undefined : find(name, 'item')
    const item = content ? copyDatabaseItem(content) : createInventoryItem()
    item.name = name.trim()
    item.quantity = blank ? '' : quantity
    sheet.inventory.push(item)
    return item
  }
  for (const stage of builderStages) {
    const selected = draft.backgrounds[stage]
    sheet.background[stage] = selected.name
    const backgroundEntry = entries.find(
      (entry) => entry.content_type === `background_${stage}` && entry.name === selected.name,
    )
    for (const name of selected.skills) {
      const links = Array.isArray(backgroundEntry?.data.skillLinks) ? backgroundEntry.data.skillLinks : []
      const linked = entries.find(
        (entry) =>
          entry.content_type === 'skill' && entry.name === name && links.includes(`${entry.source}-${entry.id}`),
      )
      addSkill(name, [1, 1, 3, 2][builderStages.indexOf(stage)], linked)
    }
  }
  sheet.character = {
    ...sheet.character,
    name: draft.name.trim(),
    crawlerNumber: draft.crawlerNumber,
    race: draft.species === 'human' ? 'Human' : draft.animal.trim(),
    level: '1',
    floor: '1',
    currentMana: draft.stats[1],
    aiFavor: draft.species === 'human' ? '1' : '0',
    size: draft.species === 'human' ? '4' : draft.size,
  }
  sheet.attributeValues = draft.stats.map((value) => ({ unenhanced: value, enhanced: value, mod: '' }))
  sheet.attacks = []
  const attack = (source: ReturnType<typeof createSkill> | ReturnType<typeof createSpell>, kind: 'skill' | 'spell') => {
    sheet.attacks.push({
      ...createAttack(),
      name: source.name,
      sourceType: kind,
      sourceId: source.id,
      hitRank: source.unenhancedRank,
      damageDice: source.damageFormula || '',
    })
  }
  attack(addSkill(draft.species === 'human' ? 'Unarmed Combat' : 'Slice Attack', 3), 'skill')
  if (combat.kind === 'spell') {
    const spell = addSpell(combat.skill, 3)
    attack(spell, 'spell')
    sheet.hotlist[0] = spell.name
    addItem('Standard Mana Potion', '5')
    sheet.hotlist[1] = 'Standard Mana Potion'
  } else {
    attack(addSkill(combat.skill, 3), 'skill')
    if (combat.effect) {
      addSkill(combat.effect, 3)
      sheet.attacks[sheet.attacks.length - 1].effects = combat.effect
    }
    if (combat.kind === 'unarmed')
      sheet.achievements.push({
        id: crypto.randomUUID(),
        name: 'Unarmed Combat',
        description: '',
        reward: 'Bronze Weapon Box',
      })
  }
  addSpell('Heal', 1)
  sheet.hotlist[sheet.hotlist.findIndex((value) => !value)] = 'Heal'
  if (!draft.storyLater) sheet.sideInfo = { ...sheet.sideInfo, ...draft.story }
  if (!draft.gearLater) {
    if (draft.clothing.trim()) addItem(draft.clothing)
    if (combat.kind === 'weapon') addItem(combat.name)
    if (draft.usefulItem.trim()) addItem(draft.usefulItem, '', true)
    if (draft.weirdItem.trim()) addItem(draft.weirdItem, '', true)
    if (combat.kind === 'unarmed') addItem('Bronze Weapon Box')
  }
  return sheet
}
