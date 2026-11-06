import { bladeClapAllowed, bladeClapSkill } from '../rules/blade-clap'
import { expireActorEvent, expireCombatConditions, settleTime } from '../time'
import { COMBAT_PHASES } from '../config'
import { attackOutcome, outcomeLabel, resolveFormulaTokens, SUCCESS_OUTCOMES } from '../rules/core'
import { debuffById } from '../rules/debuffs'
import { naturalD20, penaltyModifiers, rollD20, rollDamage } from '../dice/rolls'
import { combatAction } from '../socket'
import { shieldBlockAllowed, shieldBlockFor, shieldBlockSkill } from '../rules/shield-block'

export type DefenseKind = 'evade' | 'tank' | 'block' | 'clap'
export type DeclarationTarget = {
  combatantId: string
  actorUuid: string
  name: string
  /** `blocked`: a successful Shield Block, which halves the damage when it is applied. */
  response?: { kind: DefenseKind; total?: number; natural?: number; outcome?: string; hit: boolean; half: boolean; blocked?: boolean }
}
export type Declaration = {
  id: string
  round: number
  mobCombatantId: string
  mobActorUuid: string
  mobName: string
  attack: { id: string; name: string; toHit: number | null; damage: string; damageTypes: string[]; isArea: boolean; armorPiercing: boolean; magic: boolean; ranged?: boolean; failedDebuff: string; notes: string }
  targets: DeclarationTarget[]
  messageId?: string
  damageRolled?: boolean
}

/** A defense roll's card header, like other checks. */
const defenseFlavor = (label: string, mode: string) =>
  foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/check.hbs', {
    label,
    mode: mode === 'normal' ? '' : game.i18n.localize(`CRAWLSPACE.Roll.Mode.${mode}`),
  })

type CrawlFlags = { phase: number; done: string[]; declarations: Declaration[] }

/** Which side a combatant fights on: crawlers (and their allies) or mobs. */
export function combatantSide(combatant: any): 'crawler' | 'mob' {
  const forced = combatant.flags?.crawlspace?.side
  if (forced === 'crawler' || forced === 'mob') return forced
  // Raised minions and companions fight for the crawlers' side.
  return ['crawler', 'minion', 'companion'].includes(combatant.actor?.type) ? 'crawler' : 'mob'
}

/**
 * CrawlSpace's five-phase round: Mob Action Declaration → Crawler Reaction → Mob Actions Resolution →
 * Crawler Action → Clean Up. Core's turn order still sorts combatants, but "next turn" moves through phases,
 * and a phase ends when every combatant on its side has finished.
 */
export class CrawlCombat extends Combat {
  /** Ending an encounter also clears conditions with an earlier-of-combat-or-time duration. */
  async _preDelete(options: any, user: any) {
    if ((await super._preDelete(options, user)) === false) return false
    if (this.started) await expireCombatConditions([...this.combatants].map((combatant: any) => combatant.actor).filter(Boolean))
  }

  get crawl(): CrawlFlags {
    const flags = this.flags?.crawlspace ?? {}
    return { phase: Number(flags.phase) || 0, done: flags.done ?? [], declarations: flags.declarations ?? [] }
  }

  get phase() {
    return COMBAT_PHASES[this.crawl.phase] ?? COMBAT_PHASES[0]
  }

  /** Combatants who act in the current phase. */
  get activeCombatants() {
    const side = this.phase.side
    if (!side) return []
    return this.combatants.filter((combatant: any) => !combatant.defeated && combatantSide(combatant) === side)
  }

  isDone(combatantId: string) {
    return this.crawl.done.includes(combatantId)
  }

  async startCombat() {
    await this.setFlag('crawlspace', 'phase', 0)
    await this.update({ 'flags.crawlspace.done': [], 'flags.crawlspace.declarations': [] })
    return super.startCombat()
  }

  async setPhase(phase: number) {
    await this.update({ 'flags.crawlspace.phase': phase, 'flags.crawlspace.done': [] })
    await this.#announcePhase()
    if (COMBAT_PHASES[phase]?.id === 'cleanUp') await this.runCleanUp()
  }

  async nextTurn() {
    if (!game.user.isGM) return
    const phase = this.crawl.phase
    if (phase >= COMBAT_PHASES.length - 1) return this.nextRound()
    return this.setPhase(phase + 1)
  }

  async previousTurn() {
    if (!game.user.isGM) return
    const phase = this.crawl.phase
    if (phase <= 0) return this.previousRound()
    return this.update({ 'flags.crawlspace.phase': phase - 1, 'flags.crawlspace.done': [] })
  }

  async nextRound() {
    if (!game.user.isGM) return
    await this.update({ 'flags.crawlspace.phase': 0, 'flags.crawlspace.done': [] }, { render: false })
    const result = await super.nextRound()
    await settleTime()
    await this.#announcePhase()
    return result
  }

  async previousRound() {
    if (!game.user.isGM) return
    await this.update({ 'flags.crawlspace.phase': COMBAT_PHASES.length - 1, 'flags.crawlspace.done': [] }, { render: false })
    return super.previousRound()
  }

  /** A combatant finished its part of the phase. When the whole side is done, the GM's client advances. */
  async markDone(combatantId: string, context: { userId?: string } = {}) {
    const combatant = this.combatants.get(combatantId)
    if (!combatant) return
    const user = game.users.get(context.userId ?? game.user.id)
    if (!user?.isGM && !combatant.actor?.testUserPermission(user, 'OWNER')) return
    const done = new Set(this.crawl.done)
    if (done.has(combatantId)) done.delete(combatantId)
    else done.add(combatantId)
    await this.update({ 'flags.crawlspace.done': [...done] })
    const active = this.activeCombatants
    if (active.length && active.every((entry: any) => done.has(entry.id)) && game.settings.get('crawlspace', 'autoAdvancePhase'))
      await this.nextTurn()
  }

  async #announcePhase() {
    if (!game.user.isGM || !this.started) return
    const content = `<div class="crawlspace chat-card phase-card"><h3>${game.i18n.format('CRAWLSPACE.Combat.RoundPhase', {
      round: this.round,
      phase: this.phase.label,
    })}</h3></div>`
    await ChatMessage.create({ content, speaker: { alias: game.i18n.localize('CRAWLSPACE.Combat.SystemAI') }, whisper: [] })
  }

  /* ------------------------------------------------------------------ */
  /*  Declarations                                                       */
  /* ------------------------------------------------------------------ */

  /** GM: a mob declares one of its attacks against one or more crawler combatants. */
  async declareAttack(mobCombatantId: string, attackId: string, targetCombatantIds: string[]) {
    const mob = this.combatants.get(mobCombatantId)
    const attack = mob?.actor?.system?.attacks?.find((entry: any) => entry.id === attackId)
    if (!mob || !attack) return
    const floor = Number(mob.actor.system.floor) || 0
    const declaration: Declaration = {
      id: foundry.utils.randomID(),
      round: this.round,
      mobCombatantId,
      mobActorUuid: mob.actor.uuid,
      mobName: mob.name,
      attack: {
        id: attack.id,
        name: attack.name,
        toHit: attack.toHit ?? null,
        damage: resolveFormulaTokens(attack.damage, { floor }),
        damageTypes: attack.damageTypes ?? [],
        isArea: !!attack.aoeType,
        armorPiercing: !!attack.armorPiercing,
        magic: !!attack.magic,
        ranged: !!attack.ranged,
        failedDebuff: attack.failedDebuff ?? '',
        notes: attack.notes ?? '',
      },
      targets: targetCombatantIds
        .map((id) => this.combatants.get(id))
        .filter(Boolean)
        .map((combatant: any) => ({ combatantId: combatant.id, actorUuid: combatant.actor?.uuid ?? '', name: combatant.name })),
    }
    const message = await ChatMessage.create({
      content: await this.#renderDeclaration(declaration),
      speaker: ChatMessage.getSpeaker({ actor: mob.actor }),
      flags: { crawlspace: { kind: 'declaration', combatId: this.id, declarationId: declaration.id } },
    })
    declaration.messageId = message.id
    await this.update({ 'flags.crawlspace.declarations': [...this.crawl.declarations, declaration] })
  }

  /** Player side: roll the defense locally (so the roller sees their dice), then hand the result to the GM. */
  async defendDeclaration(declarationId: string, combatantId: string, kind: DefenseKind, actor: any) {
    const declaration = this.crawl.declarations.find((entry) => entry.id === declarationId)
    if (!declaration) return
    let total: number | undefined
    let natural: number | undefined
    if (kind === 'evade') {
      const result = await rollD20(actor, {
        label: game.i18n.format('CRAWLSPACE.Combat.EvadeAgainst', { attack: declaration.attack.name }),
        kind: 'evade',
        modifiers: [{ label: game.i18n.localize('CRAWLSPACE.Stat.Evade'), value: Number(actor.system.evade?.total) || 0 }, ...penaltyModifiers(actor)],
        sources: [...(declaration.attack.magic ? ['Spells'] : [])],
      })
      if (!result) return
      total = result.roll.total
      natural = naturalD20(result.roll)
      await result.roll.toMessage(
        { speaker: ChatMessage.getSpeaker({ actor }), flavor: await defenseFlavor(game.i18n.format('CRAWLSPACE.Combat.EvadeAgainst', { attack: declaration.attack.name }), result.mode) },
        { messageMode: game.settings.get('core', 'messageMode') },
      )
    }
    if (kind === 'block' || kind === 'clap') {
      // A Shield Block check: the Shield Block skill against the attack's to-hit.
      const skill = kind === 'clap' ? bladeClapSkill(actor) : shieldBlockSkill(actor)
      const block = kind === 'clap' ? { rank: skill?.system.rank.total } : shieldBlockFor(actor)
      if (!skill || !block || !(kind === 'clap' ? bladeClapAllowed(declaration.attack, block.rank) : shieldBlockAllowed({ area: declaration.attack.isArea, types: declaration.attack.damageTypes }, block.rank)))
        return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Combat.CannotBlock'))
      const label = game.i18n.format(kind === 'clap' ? 'CRAWLSPACE.Combat.ClapAgainst' : 'CRAWLSPACE.Combat.BlockAgainst', { attack: declaration.attack.name })
      const result = await rollD20(actor, { label, kind: 'check', modifiers: skill.checkModifiers(), sources: [skill.name] })
      if (!result) return
      total = result.roll.total
      natural = naturalD20(result.roll)
      await result.roll.toMessage({ speaker: ChatMessage.getSpeaker({ actor }), flavor: await defenseFlavor(label, result.mode) }, { messageMode: game.settings.get('core', 'messageMode') })
    }
    return combatAction(this, 'respondToDeclaration', declarationId, combatantId, kind, total ?? null, natural ?? null)
  }

  /** GM: record a crawler's response and its outcome (combat.ts defenseOutcome). */
  async respondToDeclaration(
    declarationId: string,
    combatantId: string,
    kind: DefenseKind,
    total: number | null,
    natural: number | null,
    context: { userId?: string } = {},
  ) {
    const declarations = foundry.utils.deepClone(this.crawl.declarations) as Declaration[]
    const declaration = declarations.find((entry) => entry.id === declarationId)
    const target = declaration?.targets.find((entry) => entry.combatantId === combatantId)
    if (!declaration || !target) return
    const combatant = this.combatants.get(combatantId)
    const user = game.users.get(context.userId ?? game.user.id)
    if (!user?.isGM && !combatant?.actor?.testUserPermission(user, 'OWNER')) return
    if (!['evade', 'tank', 'block', 'clap'].includes(kind)) return
    if (kind === 'clap' && (!bladeClapSkill(combatant?.actor) || !bladeClapAllowed(declaration.attack, bladeClapSkill(combatant.actor).system.rank.total))) return
    if (kind === 'tank' || declaration.attack.toHit === null || total === null) {
      target.response = { kind, hit: true, half: false }
    } else {
      const outcome = attackOutcome(total, declaration.attack.toHit, natural ?? undefined)
      const success = SUCCESS_OUTCOMES.includes(outcome)
      // A Shield Block never avoids the hit: a successful one halves the damage when it is applied.
      if (kind === 'block')
        target.response = { kind, total, natural: natural ?? undefined, outcome: outcomeLabel(outcome, true), hit: true, half: false, blocked: success }
      else target.response = {
        kind,
        total,
        natural: natural ?? undefined,
        outcome: outcomeLabel(outcome, true),
        hit: !success || !!declaration.attack.isArea,
        half: success && !!declaration.attack.isArea,
      }
    }
    await this.update({ 'flags.crawlspace.declarations': declarations })
    const message = game.messages.get(declaration.messageId)
    if (message) await message.update({ content: await this.#renderDeclaration(declaration) })
  }

  /** GM: roll the attack's damage once and post it for the crawlers it hit (shared pool, as in CrawlSpace). */
  async rollDeclarationDamage(declarationId: string) {
    const declarations = foundry.utils.deepClone(this.crawl.declarations) as Declaration[]
    const declaration = declarations.find((entry) => entry.id === declarationId)
    if (!declaration) return
    const mob = await fromUuid(declaration.mobActorUuid)
    const hit = declaration.targets.filter((target) => target.response?.hit ?? false)
    const unanswered = declaration.targets.filter((target) => !target.response)
    if (unanswered.length) ui.notifications.info(game.i18n.format('CRAWLSPACE.Combat.Unanswered', { names: unanswered.map((t) => t.name).join(', ') }))
    if (!hit.length && !unanswered.length) return ui.notifications.info(game.i18n.localize('CRAWLSPACE.Combat.AllAvoided'))
    await rollDamage(
      mob,
      { formula: declaration.attack.damage, types: declaration.attack.damageTypes, armorPiercing: declaration.attack.armorPiercing, magic: declaration.attack.magic, area: declaration.attack.isArea },
      {
        label: `${declaration.mobName}: ${declaration.attack.name}`,
        targets: [...hit, ...unanswered].map((target) => target.actorUuid),
        blocked: hit.filter((target) => target.response?.blocked).map((target) => target.actorUuid),
      },
    )
    declaration.damageRolled = true
    await this.update({ 'flags.crawlspace.declarations': declarations })
    const message = game.messages.get(declaration.messageId)
    if (message) await message.update({ content: await this.#renderDeclaration(declaration) })
  }

  async #renderDeclaration(declaration: Declaration) {
    const canBlock = (uuid: string, entry: Declaration) => {
      const block = shieldBlockFor(fromUuidSync(uuid))
      return !!block && shieldBlockAllowed({ area: entry.attack.isArea, types: entry.attack.damageTypes }, block.rank)
    }
    return foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/declaration.hbs', {
      declaration,
      combatId: this.id,
      toHit: declaration.attack.toHit ?? game.i18n.localize('CRAWLSPACE.Combat.AutoHit'),
      targets: declaration.targets.map((target) => ({
        ...target,
        halfNote: target.response?.half,
        canBlock: canBlock(target.actorUuid, declaration),
        canClap: !!bladeClapSkill(fromUuidSync(target.actorUuid)) && bladeClapAllowed(declaration.attack, bladeClapSkill(fromUuidSync(target.actorUuid)).system.rank.total),
        failedDebuff: target.response?.hit && declaration.attack.failedDebuff ? declaration.attack.failedDebuff : '',
      })),
    })
  }

  /* ------------------------------------------------------------------ */
  /*  Clean Up                                                           */
  /* ------------------------------------------------------------------ */

  /** Roll each combatant's recurring condition damage once, and count down Dying crawlers. */
  async runCleanUp() {
    if (!game.user.isGM) return
    for (const combatant of this.combatants) {
      const actor = combatant.actor
      if (!actor || combatant.defeated) continue
      const floor = Number(actor.system.details?.floor ?? actor.system.floor) || 0
      for (const effect of actor.effects) {
        if (!effect.active) continue
        const standard = [...effect.statuses].map((id: string) => debuffById(id)).find((debuff) => debuff?.cleanup)
        const formula = effect.system?.cleanup?.formula || standard?.cleanup?.formula
        if (!formula) continue
        const types = effect.system?.cleanup?.types?.length ? effect.system.cleanup.types : (standard?.cleanup?.types ?? [])
        const stacks = Math.max(1, Number(effect.system?.stacks) || 1)
        const resolved = resolveFormulaTokens(formula, { floor })
        await rollDamage(
          actor,
          { formula: stacks > 1 ? `(${resolved})*${stacks}` : resolved, types, floor },
          { label: game.i18n.format('CRAWLSPACE.Combat.CleanupDamage', { effect: effect.name, name: actor.name }), targets: [actor.uuid] },
        )
      }
      if (actor.type === 'crawler' && actor.statuses.has('dying')) {
        const countdown = (actor.system.health.dyingCountdown ?? actor.system.attributes.con.mod) - 1
        await actor.update({ 'system.health.dyingCountdown': Math.max(0, countdown) })
        if (countdown <= 0) await actor.update({ 'system.health.value': 0 })
      }
    }
    await expireActorEvent('cleanUp', [...this.combatants].map((combatant: any) => combatant.actor).filter(Boolean))
  }
}

/** Default "Declare Attack" dialog for the GM. */
export async function promptDeclaration(combat: CrawlCombat, mobCombatantId?: string) {
  const mobs = combat.combatants.filter((c: any) => combatantSide(c) === 'mob' && c.actor?.system?.attacks?.length)
  if (!mobs.length) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Combat.NoMobAttacks'))
  const crawlers = combat.combatants.filter((c: any) => combatantSide(c) === 'crawler' && !c.defeated)
  const targeted = new Set([...game.user.targets].map((token: any) => token.id))
  const content = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/dialogs/declare.hbs', {
    mobs: mobs.map((mob: any) => ({
      id: mob.id,
      name: mob.name,
      selected: mob.id === mobCombatantId,
      attacks: mob.actor.system.attacks.map((attack: any) => ({ id: attack.id, name: attack.name, toHit: attack.toHit ?? '—', damage: attack.damage })),
    })),
    crawlers: crawlers.map((crawler: any) => ({ id: crawler.id, name: crawler.name, checked: targeted.has(crawler.tokenId) })),
  })
  const answer = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize('CRAWLSPACE.Combat.Declare') },
    content,
    rejectClose: false,
    render: (_event: Event, dialog: any) => {
      const form = dialog.element.querySelector('form') ?? dialog.element
      const mobSelect = form.querySelector('[name=mob]')
      const sync = () => {
        for (const group of form.querySelectorAll('[data-mob-attacks]'))
          (group as HTMLElement).hidden = (group as HTMLElement).dataset.mobAttacks !== mobSelect.value
      }
      mobSelect?.addEventListener('change', sync)
      sync()
    },
    buttons: [
      {
        action: 'declare',
        label: game.i18n.localize('CRAWLSPACE.Combat.Declare'),
        default: true,
        callback: (_event: Event, button: any) => {
          const form = button.form
          const mob = form.elements.mob.value
          const attack = form.querySelector(`[data-mob-attacks="${mob}"] input[name="attack-${mob}"]:checked`)?.value
          const targets = [...form.querySelectorAll('input[name=target]:checked')].map((input: any) => input.value)
          return { mob, attack, targets }
        },
      },
    ],
  })
  if (!answer?.mob || !answer.attack || !answer.targets.length) return
  return combat.declareAttack(answer.mob, answer.attack, answer.targets)
}
