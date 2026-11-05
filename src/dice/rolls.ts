import { attackOutcome, doubleDice, outcomeLabel, resolveFormulaTokens, SUCCESS_OUTCOMES, type AttackOutcome } from '../rules/core'
import { debuffById } from '../rules/debuffs'

export type RollModeName = 'normal' | 'advantage' | 'disadvantage'
export type Modifier = { label: string; value: number; enabled?: boolean }

export type CheckOptions = {
  label: string
  /** attack | check | evade, used to read roll-mode effects. */
  kind: 'attack' | 'check' | 'evade'
  modifiers: Modifier[]
  /** Names the effect targets can match, e.g. the skill name, `Spells`, `Ranged`. */
  sources?: string[]
  difficulty?: number | null
  /** Skip the dialog (shift-click). */
  fast?: boolean
  flavor?: string
  flags?: Record<string, unknown>
}

const MODE_FORMULA: Record<RollModeName, string> = { normal: '1d20', advantage: '2d20kh', disadvantage: '2d20kl' }

/** Advantage and Disadvantage cancel out, whatever their number (conditionEffects.ts effectRollMode). */
export function effectRollMode(actor: any, kind: CheckOptions['kind'], sources: string[] = []): RollModeName {
  const type = kind === 'attack' ? 'attackMode' : kind === 'evade' ? 'evadeMode' : 'checkMode'
  const lowered = sources.map((source) => source.toLowerCase())
  const modes = new Set<string>()
  for (const entry of actor?.system?.rollModes ?? []) {
    if (entry.kind !== type) continue
    const targets = String(entry.target || 'All')
      .split(',')
      .map((target) => target.trim().toLowerCase())
      .filter(Boolean)
    if (!targets.length || targets.includes('all') || lowered.some((source) => targets.includes(source)))
      modes.add(entry.value)
  }
  for (const status of actor?.statuses ?? []) {
    const debuff = debuffById(status)
    if (debuff?.disadvantage === 'checks' || (debuff?.disadvantage === 'attacks' && kind === 'attack'))
      modes.add('disadvantage')
  }
  const advantage = modes.has('advantage')
  const disadvantage = modes.has('disadvantage')
  return advantage === disadvantage ? 'normal' : advantage ? 'advantage' : 'disadvantage'
}

/** The general check penalty from debuffs, as a modifier row. */
export function penaltyModifiers(actor: any): Modifier[] {
  const penalty = Number(actor?.system?.checkPenalty) || 0
  return penalty ? [{ label: game.i18n.localize('CRAWLSPACE.Roll.DebuffPenalty'), value: penalty }] : []
}

async function promptCheck(options: CheckOptions, mode: RollModeName) {
  const content = await foundry.applications.handlebars.renderTemplate(
    'systems/crawlspace/templates/dialogs/roll-check.hbs',
    { modifiers: options.modifiers.map((modifier, index) => ({ ...modifier, index, enabled: modifier.enabled !== false })), mode, difficulty: options.difficulty },
  )
  return foundry.applications.api.DialogV2.wait({
    window: { title: options.label },
    content,
    rejectClose: false,
    buttons: [
      {
        action: 'roll',
        label: game.i18n.localize('CRAWLSPACE.Roll.Roll'),
        default: true,
        callback: (_event: Event, button: any) => {
          const form = button.form
          const enabled = options.modifiers.map((_m, index) => form.elements[`mod-${index}`]?.checked !== false)
          const extra = Number(form.elements.extra?.value) || 0
          const extraLabel = String(form.elements.extraLabel?.value || game.i18n.localize('CRAWLSPACE.Roll.Temporary'))
          return { enabled, extra, extraLabel, mode: form.elements.mode.value as RollModeName }
        },
      },
    ],
  })
}

/** Roll a d20 check with toggled modifiers. Returns the evaluated Roll and the chosen mode. */
export async function rollD20(actor: any, options: CheckOptions) {
  let mode = effectRollMode(actor, options.kind, options.sources)
  let modifiers = options.modifiers.filter((modifier) => modifier.value !== 0 || modifier.enabled === false)
  if (!options.fast) {
    const answer = await promptCheck({ ...options, modifiers }, mode)
    if (!answer) return null
    modifiers = modifiers.filter((_modifier, index) => answer.enabled[index])
    if (answer.extra) modifiers.push({ label: answer.extraLabel, value: answer.extra })
    mode = answer.mode
  }
  const terms = modifiers.map((modifier) => `${modifier.value >= 0 ? '+' : '-'} ${Math.abs(modifier.value)}[${modifier.label.replace(/[[\]]/g, '')}]`)
  const roll = new Roll(`${MODE_FORMULA[mode]} ${terms.join(' ')}`.trim())
  await roll.evaluate()
  return { roll, mode, modifiers }
}

/** The natural d20 kept by a check roll. */
export function naturalD20(roll: any): number | undefined {
  const die = roll?.dice?.find((term: any) => term.faces === 20)
  return die?.results?.find((result: any) => result.active)?.result
}

export function outcomeFor(roll: any, difficulty: number) {
  return attackOutcome(roll.total, difficulty, naturalD20(roll))
}

const messageMode = () => game.settings.get('core', 'messageMode')

/** A plain check (attribute, skill, spell): optional difficulty gives an outcome. */
export async function rollCheck(actor: any, options: CheckOptions) {
  const result = await rollD20(actor, options)
  if (!result) return null
  const { roll, mode } = result
  const outcome = options.difficulty != null ? outcomeFor(roll, options.difficulty) : null
  const flavor = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/check.hbs', {
    label: options.label,
    flavor: options.flavor,
    mode: mode === 'normal' ? '' : game.i18n.localize(`CRAWLSPACE.Roll.Mode.${mode}`),
    outcome: outcome ? outcomeLabel(outcome, options.kind !== 'attack') : null,
    success: outcome ? SUCCESS_OUTCOMES.includes(outcome) : null,
    difficulty: options.difficulty,
  })
  await roll.toMessage(
    { speaker: ChatMessage.getSpeaker({ actor }), flavor, flags: { crawlspace: { kind: 'check', outcome, ...options.flags } } },
    { messageMode: messageMode() },
  )
  return { roll, outcome }
}

export type AttackSource = {
  label: string
  modifiers: Modifier[]
  sources: string[]
  damage: { formula: string; types: string[]; armorPiercing?: boolean; magic?: boolean }
  /** Run before rolling: spend mana or ammunition; false cancels. */
  pay?: () => Promise<boolean>
  ranged?: boolean
}

/** Target defense used against an attack: Evade for everyone in CrawlSpace. */
export function targetDefense(actor: any): number {
  return Number(actor?.system?.evade?.total) || 0
}

/**
 * Attack every targeted token: one d20 roll, one outcome per target (vs. its Evade), and buttons for
 * Normal, Amazing (+Floor) and Critical (doubled dice) damage.
 */
export async function rollAttack(actor: any, attack: AttackSource, options: { fast?: boolean } = {}) {
  const targets = [...game.user.targets].map((token: any) => token.actor).filter(Boolean)
  const result = await rollD20(actor, {
    label: attack.label,
    kind: 'attack',
    modifiers: attack.modifiers,
    sources: [...attack.sources, ...(attack.ranged ? ['Ranged'] : []), ...(attack.damage.magic ? ['Spells'] : [])],
    fast: options.fast,
  })
  if (!result) return null
  if (attack.pay && !(await attack.pay())) return null
  const { roll, mode } = result
  const natural = naturalD20(roll)
  const floor = Number(actor?.system?.details?.floor ?? actor?.system?.floor) || 0
  const rows = targets.map((target) => {
    const difficulty = targetDefense(target)
    const outcome: AttackOutcome = attackOutcome(roll.total, difficulty, natural)
    return {
      name: target.name,
      uuid: target.uuid,
      difficulty,
      outcome,
      success: SUCCESS_OUTCOMES.includes(outcome),
    }
  })
  const formula = resolveFormulaTokens(attack.damage.formula, { floor })
  const flavor = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/attack.hbs', {
    label: attack.label,
    mode: mode === 'normal' ? '' : game.i18n.localize(`CRAWLSPACE.Roll.Mode.${mode}`),
    targets: rows,
    natural,
    hasDamage: !!formula,
    damageTypes: attack.damage.types.join(', '),
  })
  await roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor,
      flags: {
        crawlspace: {
          kind: 'attack',
          damage: { ...attack.damage, formula, floor },
          label: attack.label,
          targets: rows,
        },
      },
    },
    { messageMode: messageMode() },
  )
  return { roll, targets: rows }
}

/** Roll damage and post a card with Apply ×½/×1/×2 and Heal buttons. */
export async function rollDamage(
  actor: any,
  damage: { formula: string; types: string[]; armorPiercing?: boolean; magic?: boolean; floor?: number },
  options: { label?: string; tier?: 'normal' | 'amazing' | 'critical'; targets?: string[]; healing?: boolean } = {},
) {
  const floor = damage.floor ?? (Number(actor?.system?.details?.floor ?? actor?.system?.floor) || 0)
  let formula = resolveFormulaTokens(damage.formula, { floor })
  if (!formula) return null
  if (options.tier === 'critical') formula = doubleDice(formula)
  if (options.tier === 'amazing' && floor) formula = `${formula}+${floor}`
  const roll = new Roll(formula, actor?.getRollData?.() ?? {})
  await roll.evaluate()
  const tierLabel = options.tier && options.tier !== 'normal' ? game.i18n.localize(`CRAWLSPACE.Damage.Tier.${options.tier}`) : ''
  const flavor = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/damage.hbs', {
    label: options.label ?? game.i18n.localize('CRAWLSPACE.Damage.Damage'),
    tier: tierLabel,
    types: damage.types.join(', '),
    armorPiercing: damage.armorPiercing,
    magic: damage.magic,
    healing: options.healing,
  })
  await roll.toMessage(
    {
      speaker: ChatMessage.getSpeaker({ actor }),
      flavor,
      flags: {
        crawlspace: {
          kind: options.healing ? 'healing' : 'damage',
          types: damage.types,
          armorPiercing: !!damage.armorPiercing,
          magic: !!damage.magic,
          targets: options.targets ?? [],
        },
      },
    },
    { messageMode: messageMode() },
  )
  return roll
}
