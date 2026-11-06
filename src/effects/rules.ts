/**
 * A PF2e-style "rules" editor over ActiveEffect changes. Each change is shown as a typed rule with its own
 * fields (Stat bonus: stat + value, Skill Rank: skill + value...), with a JSON editor for anything else.
 * Used by every item sheet's Effects tab and by the effect sheet, so all effects edit the same way.
 */
import { DAMAGE_TYPES, STATS, STAT_KEYS, statKeyFromCode } from '../config'
import { DEBUFFS } from '../rules/debuffs'
import { CUSTOM_CHANGE_TYPES } from './mapping'

type Field = { name: string; label: string; kind: 'stat' | 'number' | 'text' | 'damageType' | 'debuff' | 'rollKind' | 'rollValue' | 'changeType' }
type Values = Record<string, any>
type Change = { key: string; type: string; value: any; phase?: string; priority?: number | null }
type RuleType = {
  id: string
  label: string
  fields: Field[]
  match: (change: Change) => boolean
  read: (change: Change) => Values
  write: (values: Values) => Change
}

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0)
const make = (key: string, type: string, value: unknown): Change => ({ key, type, value, phase: 'initial' })
const json = (value: unknown) => {
  try {
    return typeof value === 'string' ? JSON.parse(value) : (value ?? {})
  } catch {
    return {}
  }
}
const statCode = (key: string) => STATS[(statKeyFromCode(key) ?? 'str') as keyof typeof STATS].code
const F = {
  stat: { name: 'stat', label: 'CRAWLSPACE.Rules.Field.stat', kind: 'stat' } as Field,
  value: { name: 'value', label: 'CRAWLSPACE.Rules.Field.value', kind: 'number' } as Field,
  name: { name: 'target', label: 'CRAWLSPACE.Rules.Field.name', kind: 'text' } as Field,
}

/** Stat-path rules: `system.attributes.<stat>.<field>` with an `add` change. */
const statRule = (id: string, field: string): RuleType => ({
  id,
  label: `CRAWLSPACE.Rules.Type.${id}`,
  fields: [F.stat, F.value],
  match: (c) => c.type === 'add' && new RegExp(`^system\\.attributes\\.(${STAT_KEYS.join('|')})\\.${field}$`).test(c.key),
  read: (c) => ({ stat: STATS[c.key.split('.')[2] as keyof typeof STATS].code, value: c.value }),
  write: (v) => make(`system.attributes.${statKeyFromCode(v.stat) ?? 'str'}.${field}`, 'add', num(v.value)),
})

/** Numeric bonus on one path, e.g. `system.dr.bonus`. */
const pathRule = (id: string, path: string): RuleType => ({
  id,
  label: `CRAWLSPACE.Rules.Type.${id}`,
  fields: [F.value],
  match: (c) => c.key === path && c.type === 'add',
  read: (c) => ({ value: c.value }),
  write: (v) => make(path, 'add', num(v.value)),
})

/** Adds a word to a trait set, e.g. a Fire resistance. */
const traitRule = (id: string, trait: string, kind: Field['kind']): RuleType => ({
  id,
  label: `CRAWLSPACE.Rules.Type.${id}`,
  fields: [{ name: 'value', label: kind === 'debuff' ? 'CRAWLSPACE.Rules.Field.debuff' : 'CRAWLSPACE.Rules.Field.damageType', kind }],
  match: (c) => c.key === `system.traits.${trait}`,
  read: (c) => ({ value: c.value }),
  write: (v) => make(`system.traits.${trait}`, 'add', String(v.value ?? '')),
})

/** Custom change types keyed by a name: skill/spell ranks. */
const namedRule = (id: keyof typeof CUSTOM_CHANGE_TYPES, field: Field): RuleType => ({
  id,
  label: `CRAWLSPACE.Rules.Type.${id}`,
  fields: [field, F.value],
  match: (c) => c.type === CUSTOM_CHANGE_TYPES[id],
  read: (c) => ({ [field.name]: c.key, value: c.value }),
  write: (v) => make(String(v[field.name] ?? ''), CUSTOM_CHANGE_TYPES[id], num(v.value)),
})

const SPECIAL_KINDS = ['armorPiercing', 'damageBonus', 'magicDamageCap', 'areaDamageHalf', 'manaPerRound', 'regenPerRound', 'rankCap', 'shield', 'lightOrb', 'raiseMinion']

export const RULE_TYPES: RuleType[] = [
  statRule('statBonus', 'bonus'),
  statRule('baseStatBonus', 'value'),
  statRule('statModifier', 'modBonus'),
  {
    id: 'statPercent',
    label: 'CRAWLSPACE.Rules.Type.statPercent',
    fields: [F.stat, { name: 'value', label: 'CRAWLSPACE.Rules.Field.percent', kind: 'number' }],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.statPercent,
    read: (c) => ({ stat: statCode(c.key), value: c.value }),
    write: (v) => make(statKeyFromCode(v.stat) ?? 'str', CUSTOM_CHANGE_TYPES.statPercent, num(v.value)),
  },
  {
    id: 'modLoss',
    label: 'CRAWLSPACE.Rules.Type.modLoss',
    fields: [F.stat],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.modLoss,
    read: (c) => ({ stat: statCode(c.key) }),
    write: (v) => make(statKeyFromCode(v.stat) ?? 'str', CUSTOM_CHANGE_TYPES.modLoss, true),
  },
  pathRule('mana', 'system.mana.bonus'),
  pathRule('dr', 'system.dr.bonus'),
  pathRule('evade', 'system.evade.bonus'),
  pathRule('move', 'system.move.bonus'),
  pathRule('step', 'system.step.bonus'),
  pathRule('extraActions', 'system.actions.extra'),
  pathRule('hotlist', 'system.hotlist.bonus'),
  traitRule('resistance', 'resistances', 'damageType'),
  traitRule('vulnerability', 'vulnerabilities', 'damageType'),
  traitRule('immunity', 'immunities', 'damageType'),
  traitRule('conditionImmunity', 'conditionImmunities', 'debuff'),
  namedRule('skillRank', { name: 'target', label: 'CRAWLSPACE.Rules.Field.skill', kind: 'text' }),
  namedRule('spellRank', { name: 'target', label: 'CRAWLSPACE.Rules.Field.spell', kind: 'text' }),
  namedRule('baseSkillRank', { name: 'target', label: 'CRAWLSPACE.Rules.Field.skill', kind: 'text' }),
  namedRule('baseSpellRank', { name: 'target', label: 'CRAWLSPACE.Rules.Field.spell', kind: 'text' }),
  namedRule('healthBonus', { name: 'target', label: 'CRAWLSPACE.Rules.Field.slots', kind: 'text' }),
  {
    id: 'rollMode',
    label: 'CRAWLSPACE.Rules.Type.rollMode',
    fields: [
      { name: 'kind', label: 'CRAWLSPACE.Rules.Field.rollKind', kind: 'rollKind' },
      { name: 'target', label: 'CRAWLSPACE.Rules.Field.appliesTo', kind: 'text' },
      { name: 'value', label: 'CRAWLSPACE.Rules.Field.mode', kind: 'rollValue' },
    ],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.rollMode,
    read: (c) => {
      const [kind, target = 'All'] = String(c.key).split(':')
      return { kind, target, value: c.value }
    },
    write: (v) => make(`${v.kind || 'checkMode'}:${String(v.target || 'All').trim()}`, CUSTOM_CHANGE_TYPES.rollMode, v.value || 'advantage'),
  },
  {
    id: 'inherentSpell',
    label: 'CRAWLSPACE.Rules.Type.inherentSpell',
    fields: [
      { name: 'target', label: 'CRAWLSPACE.Rules.Field.spell', kind: 'text' },
      { name: 'value', label: 'CRAWLSPACE.Rules.Field.rank', kind: 'number' },
      { name: 'cooldown', label: 'CRAWLSPACE.Rules.Field.cooldown', kind: 'text' },
    ],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.special && c.key === 'inherentSpell',
    read: (c) => {
      const data = json(c.value)
      return { target: data.target ?? '', value: data.value ?? 1, cooldown: data.cooldown ?? '' }
    },
    write: (v) =>
      make('inherentSpell', CUSTOM_CHANGE_TYPES.special, JSON.stringify({ target: String(v.target ?? '').trim(), value: String(num(v.value) || 1), cooldown: String(v.cooldown ?? '') })),
  },
  {
    id: 'lightOrb',
    label: 'CRAWLSPACE.Rules.Type.lightOrb',
    fields: [
      { name: 'bright', label: 'CRAWLSPACE.Rules.Field.brightFeet', kind: 'number' },
      { name: 'dim', label: 'CRAWLSPACE.Rules.Field.dimFeet', kind: 'number' },
      { name: 'range', label: 'CRAWLSPACE.Rules.Field.rangeFeet', kind: 'number' },
    ],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.special && c.key === 'lightOrb',
    read: (c) => {
      const data = json(c.value)
      return { bright: num(data.target), dim: num(data.dimFeet), range: num(data.value) }
    },
    write: (v) =>
      make('lightOrb', CUSTOM_CHANGE_TYPES.special, JSON.stringify({ target: String(num(v.bright)), value: String(num(v.range)), dimFeet: String(Math.max(num(v.dim), num(v.bright))) })),
  },
  {
    id: 'raiseMinion',
    label: 'CRAWLSPACE.Rules.Type.raiseMinion',
    fields: [],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.special && c.key === 'raiseMinion',
    read: () => ({}),
    write: () => make('raiseMinion', CUSTOM_CHANGE_TYPES.special, JSON.stringify({ target: '', value: '' })),
  },
  {
    id: 'special',
    label: 'CRAWLSPACE.Rules.Type.special',
    fields: [
      { name: 'special', label: 'CRAWLSPACE.Rules.Field.special', kind: 'text' },
      { name: 'target', label: 'CRAWLSPACE.Rules.Field.appliesTo', kind: 'text' },
      { name: 'value', label: 'CRAWLSPACE.Rules.Field.value', kind: 'text' },
    ],
    match: (c) => c.type === CUSTOM_CHANGE_TYPES.special,
    read: (c) => {
      const data = json(c.value)
      return { special: c.key, target: data.target ?? '', value: data.value ?? '' }
    },
    write: (v) => make(String(v.special || 'damageBonus'), CUSTOM_CHANGE_TYPES.special, JSON.stringify({ target: v.target ?? '', value: v.value ?? '' })),
  },
  {
    id: 'custom',
    label: 'CRAWLSPACE.Rules.Type.custom',
    fields: [
      { name: 'key', label: 'CRAWLSPACE.Rules.Field.key', kind: 'text' },
      { name: 'type', label: 'CRAWLSPACE.Rules.Field.changeType', kind: 'changeType' },
      { name: 'value', label: 'CRAWLSPACE.Rules.Field.value', kind: 'text' },
    ],
    match: () => true,
    read: (c) => ({ key: c.key, type: c.type, value: typeof c.value === 'string' ? c.value : JSON.stringify(c.value) }),
    write: (v) => make(String(v.key ?? ''), String(v.type || 'add'), v.value),
  },
]

export const ruleTypeOf = (change: Change) => RULE_TYPES.find((rule) => rule.match(change)) ?? RULE_TYPES[RULE_TYPES.length - 1]
export const ruleById = (id: string) => RULE_TYPES.find((rule) => rule.id === id) ?? RULE_TYPES[RULE_TYPES.length - 1]

/** Default values for a fresh rule of a type. */
function defaults(rule: RuleType): Values {
  const values: Values = {}
  for (const field of rule.fields) {
    values[field.name] =
      field.kind === 'stat' ? 'STR' : field.kind === 'number' ? 1 : field.kind === 'damageType' ? DAMAGE_TYPES[0] : field.kind === 'debuff' ? DEBUFFS[0]?.name : field.kind === 'rollKind' ? 'checkMode' : field.kind === 'rollValue' ? 'advantage' : field.kind === 'changeType' ? 'add' : ''
  }
  if (rule.id === 'special') values.special = 'damageBonus'
  return values
}

export function newChange(ruleId: string) {
  const rule = ruleById(ruleId)
  return rule.write(defaults(rule))
}

const OPTIONS: Record<string, () => { value: string; label: string }[]> = {
  stat: () => Object.values(STATS).map((stat) => ({ value: stat.code, label: stat.label })),
  damageType: () => ['All', ...DAMAGE_TYPES].map((type) => ({ value: type, label: type })),
  debuff: () => DEBUFFS.map((debuff) => ({ value: debuff.name, label: debuff.name })),
  rollKind: () =>
    ['attackMode', 'checkMode', 'evadeMode', 'incomingAttackMode'].map((value) => ({ value, label: game.i18n.localize(`CRAWLSPACE.Rules.RollKind.${value}`) })),
  rollValue: () => ['advantage', 'disadvantage'].map((value) => ({ value, label: game.i18n.localize(`CRAWLSPACE.Roll.Mode.${value}`) })),
  changeType: () => Object.keys(CONFIG.ActiveEffect.changeTypes ?? { add: 1 }).map((value) => ({ value, label: value })),
}

/** Template data for one effect's rules. */
export function rulesContext(effect: any) {
  const changes: Change[] = effect.system?.changes ?? []
  return changes.map((change, index) => {
    const rule = ruleTypeOf(change)
    const values = rule.read(change)
    return {
      index,
      id: rule.id,
      label: game.i18n.localize(rule.label),
      json: JSON.stringify({ ...change, effect: undefined }),
      fields: rule.fields.map((field) => {
        const value = values[field.name] ?? ''
        const options = OPTIONS[field.kind]?.()
        if (options && value !== '' && !options.some((option) => option.value === String(value))) options.push({ value: String(value), label: String(value) })
        return {
          name: field.name,
          label: game.i18n.localize(field.label),
          value,
          isNumber: field.kind === 'number',
          options: options?.map((option) => ({ ...option, selected: option.value === String(value) })),
        }
      }),
    }
  })
}

export const ruleTypeChoices = () =>
  RULE_TYPES.map((rule) => ({ value: rule.id, label: game.i18n.localize(rule.label) })).sort((a, b) =>
    a.value === 'custom' ? 1 : b.value === 'custom' ? -1 : a.label.localeCompare(b.label),
  )

/** Read one rule block's inputs back into a change. */
function changeFromBlock(block: HTMLElement): Change {
  const rule = ruleById(block.dataset.ruleType ?? 'custom')
  const values: Values = {}
  for (const input of block.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-rule-field]')) values[input.dataset.ruleField as string] = input.value
  return rule.write(values)
}

async function writeChanges(effect: any, mutate: (changes: Change[]) => void) {
  const changes = foundry.utils.deepClone(effect._source.system?.changes ?? [])
  mutate(changes)
  // Prepared changes carry a back-reference to their effect; never store it.
  for (const change of changes) delete (change as any).effect
  await effect.update({ 'system.changes': changes })
}

/**
 * Wire up every `[data-rules-effect]` list inside `root`. `effectFor(id)` returns the ActiveEffect.
 * Inputs carry no `name`, so the surrounding sheet's form ignores them.
 */
export function bindRulesEditor(root: HTMLElement, effectFor: (id: string) => any, editable: boolean) {
  for (const list of root.querySelectorAll<HTMLElement>('[data-rules-effect]')) {
    const effect = () => effectFor(list.dataset.rulesEffect as string)
    if (!editable) {
      for (const input of list.querySelectorAll<HTMLInputElement>('input, select, button')) input.disabled = true
      continue
    }
    for (const input of list.querySelectorAll<HTMLElement>('[data-rule-field]')) {
      input.addEventListener('change', async (event) => {
        event.stopPropagation()
        const block = input.closest<HTMLElement>('[data-rule-index]')
        if (!block) return
        const index = Number(block.dataset.ruleIndex)
        const change = changeFromBlock(block)
        await writeChanges(effect(), (changes) => {
          changes[index] = { ...changes[index], ...change }
        })
      })
    }
    for (const button of list.querySelectorAll<HTMLElement>('[data-rule-action]')) {
      button.addEventListener('click', async (event) => {
        event.preventDefault()
        event.stopPropagation()
        const block = button.closest<HTMLElement>('[data-rule-index]')
        const index = Number(block?.dataset.ruleIndex)
        const target = effect()
        switch (button.dataset.ruleAction) {
          case 'delete':
            return writeChanges(target, (changes) => changes.splice(index, 1))
          case 'json':
            return editJson(target, index)
          case 'add': {
            const select = list.querySelector<HTMLSelectElement>('[data-rule-new]')
            return writeChanges(target, (changes) => changes.push(newChange(select?.value ?? 'statBonus')))
          }
        }
      })
    }
  }
}

/** Edit one change as raw JSON, like PF2e's rule element editor. */
async function editJson(effect: any, index: number) {
  const change = effect._source.system?.changes?.[index] ?? {}
  const text = JSON.stringify(change, null, 2)
  const result = await foundry.applications.api.DialogV2.prompt({
    window: { title: game.i18n.format('CRAWLSPACE.Rules.EditJson', { name: effect.name }) },
    position: { width: 520 },
    classes: ['crawlspace', 'crawl-json-dialog'],
    content: `<textarea name="json" class="crawl-json-editor" rows="14" spellcheck="false">${foundry.utils.escapeHTML(text)}</textarea>`,
    ok: { label: game.i18n.localize('CRAWLSPACE.Sheet.Apply'), callback: (_event: Event, button: any) => button.form.elements.json.value },
    rejectClose: false,
  })
  if (typeof result !== 'string') return
  let parsed: any
  try {
    parsed = JSON.parse(result)
  } catch (error: any) {
    return ui.notifications.error(game.i18n.format('CRAWLSPACE.Rules.BadJson', { error: error.message }))
  }
  await writeChanges(effect, (changes) => {
    changes[index] = { phase: 'initial', ...parsed }
  })
}
