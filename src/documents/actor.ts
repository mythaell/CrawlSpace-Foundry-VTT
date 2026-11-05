import { HEALTH_MAX } from '../config'
import { applySlotDamage, dyingAfterHealthChange, type ConditionShield } from '../rules/core'
import { debuffById } from '../rules/debuffs'
import { CUSTOM_CHANGE_TYPES } from '../effects/mapping'

export type DamageOptions = {
  types?: string[]
  multiplier?: number
  armorPiercing?: boolean
  magic?: boolean
  shieldBlock?: { rank: number; strength: number }
  /** Post a health-change card with an Undo button. */
  chat?: boolean
  source?: string
}

export class CrawlActor extends Actor {
  /** Not a class field: Foundry prepares data inside the Document constructor, before fields initialize. */
  declare _rankPrepass: Record<string, Record<string, number>> | null

  prepareBaseData() {
    this._rankPrepass = null
    super.prepareBaseData()
  }

  /**
   * Skill/spell rank bonuses from effects that are not themselves rank-gated. Rank-gated effects use this to
   * decide whether they are active without depending on each other.
   */
  rankPrepass(kind: 'skill' | 'spell') {
    if (!this._rankPrepass) {
      const prepass: Record<string, Record<string, number>> = { skill: {}, spell: {} }
      for (const effect of this.allApplicableEffects()) {
        if (effect.disabled || effect.system?.requiredRank != null) continue
        for (const change of effect.system?.changes ?? []) {
          const bucket =
            change.type === CUSTOM_CHANGE_TYPES.skillRank || change.type === CUSTOM_CHANGE_TYPES.baseSkillRank
              ? 'skill'
              : change.type === CUSTOM_CHANGE_TYPES.spellRank || change.type === CUSTOM_CHANGE_TYPES.baseSpellRank
                ? 'spell'
                : null
          if (!bucket) continue
          for (const name of String(change.key).split(',').map((n) => n.trim().toLowerCase()))
            prepass[bucket][name] = (prepass[bucket][name] ?? 0) + (Number(change.value) || 0)
        }
      }
      this._rankPrepass = prepass
    }
    return this._rankPrepass[kind]
  }

  prepareDerivedData() {
    super.prepareDerivedData()
    // Items prepared before the actor's effects applied; recompute what depends on the actor now.
    for (const item of this.items) item.system?.prepareActorData?.()
  }

  /** Stacks of a standard debuff (status id) on this actor; 0 if absent. */
  debuffStacks(statusId: string): number {
    let stacks = 0
    for (const effect of this.effects) {
      if (!effect.disabled && effect.statuses.has(statusId)) stacks += Number(effect.system?.stacks) || 1
    }
    return stacks
  }

  get isCrawler() {
    return this.type === 'crawler'
  }

  getRollData() {
    return { ...super.getRollData(), ...(this.system?.getRollData?.() ?? {}) }
  }

  /* ------------------------------------------------------------------ */
  /*  Health                                                             */
  /* ------------------------------------------------------------------ */

  /** Active condition shields (e.g. Hot Stuff Aura) as damage-rule input. */
  conditionShields(): (ConditionShield & { effect: any })[] {
    return this.effects
      .filter((effect: any) => effect.active && (effect.system?.shield?.remaining ?? 0) > 0)
      .map((effect: any) => ({
        id: effect.id,
        effect,
        remaining: effect.system.shield.remaining,
        perSlot: effect.system.shield.perSlot,
        magicOnly: effect.system.shield.magicOnly,
      }))
  }

  /**
   * Apply damage the way CrawlSpace does: condition shields, magical shield slots, Shield Block, DR,
   * resistances, then whole health slots. Returns the breakdown and posts an undoable chat card.
   */
  async applyDamage(amount: number, options: DamageOptions = {}) {
    const multiplier = options.multiplier ?? 1
    const incoming = Math.floor(Math.max(0, amount) * multiplier)
    const system = this.system
    const types = options.types ?? []
    const armorPiercing = !!options.armorPiercing
    const shields = this.conditionShields()

    if (this.type === 'crawler') {
      const before = { health: system.health.value, shield: [...system.shield.slots] }
      // A Dying crawler loses a countdown round instead of taking damage.
      if (system.isDying && incoming > 0) {
        const countdown = Math.max(0, (system.health.dyingCountdown ?? system.attributes.con.mod) - 1)
        await this.update({ 'system.health.dyingCountdown': countdown })
        return this.#postHealthCard(`${this.name} is Dying: countdown drops to ${countdown}.`, before)
      }
      const healthValues = system.health.slots
        .filter((slot: any) => slot.filled)
        .map((slot: any) => Number(slot.threshold))
      const result = applySlotDamage(incoming, system.shield.slots, system.shield.value, system.dr.total, healthValues, {
        armorPiercing,
        damageTypes: types,
        responses: system.damageResponses,
        shieldBlock: options.shieldBlock,
        conditionShields: shields,
        magic: options.magic,
      })
      const health = Math.max(0, system.health.value - result.slotsLost * 10)
      await this.update({ 'system.health.value': health, 'system.shield.slots': result.shieldStates })
      await this.#updateConditionShields(shields, result.conditionShields)
      await this.#syncDying(before.health, health)
      const summary = this.#describe(result, types, incoming)
      return this.#postHealthCard(`${this.name} lost ${result.slotsLost} health slot${result.slotsLost === 1 ? '' : 's'}. ${summary}`, before, options)
    }

    // Mobs: health slots of CON-mod each.
    const before = { slotsLost: system.slotsLost }
    const perSlot = Math.max(0, Number(system.health.perSlot) || 0)
    const remaining = system.health.value
    const result = applySlotDamage(incoming, [], 0, system.dr?.total ?? 0, Array(remaining).fill(perSlot || 1), {
      armorPiercing,
      damageTypes: types,
      responses: system.damageResponses,
      conditionShields: shields,
      magic: options.magic,
    })
    await this.update({ 'system.slotsLost': system.slotsLost + result.slotsLost })
    await this.#updateConditionShields(shields, result.conditionShields)
    if (system.slotsLost + result.slotsLost >= system.health.max) await this.#markDefeated()
    const summary = this.#describe(result, types, incoming)
    return this.#postHealthCard(`${this.name} lost ${result.slotsLost} health slot${result.slotsLost === 1 ? '' : 's'}. ${summary}`, before, options)
  }

  /** Heal whole health slots (CrawlSpace heals in slots, not points). */
  async applyHealing(slots: number, options: DamageOptions = {}) {
    const count = Math.floor(Math.max(0, slots))
    if (!count) return
    if (this.statuses.has('the-taint')) {
      ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.Tainted', { name: this.name }))
      return
    }
    const system = this.system
    if (this.type === 'crawler') {
      const before = { health: system.health.value, shield: [...system.shield.slots] }
      const health = Math.min(HEALTH_MAX, system.health.value + count * 10)
      const healed = Math.floor((health - system.health.value) / 10)
      await this.update({ 'system.health.value': health, 'system.health.dyingCountdown': null })
      await this.#syncDying(before.health, health)
      return this.#postHealthCard(`${this.name} healed ${healed} health slot${healed === 1 ? '' : 's'}.`, before, options)
    }
    const before = { slotsLost: system.slotsLost }
    const slotsLost = Math.max(0, system.slotsLost - count)
    await this.update({ 'system.slotsLost': slotsLost })
    return this.#postHealthCard(`${this.name} healed ${system.slotsLost - slotsLost} health slots.`, before, options)
  }

  /** Restore a snapshot taken before a health change (the chat card's Undo button). */
  async restoreHealth(snapshot: Record<string, any>) {
    if (this.type === 'crawler') {
      const current = this.system.health.value
      await this.update({ 'system.health.value': snapshot.health, 'system.shield.slots': snapshot.shield ?? [] })
      await this.#syncDying(current, snapshot.health)
    } else await this.update({ 'system.slotsLost': snapshot.slotsLost })
  }

  async #updateConditionShields(before: any[], after: ConditionShield[]) {
    for (const shield of before) {
      const next = after.find((entry) => entry.id === shield.id)
      if (!next || next.remaining === shield.remaining) continue
      if (next.remaining <= 0) await shield.effect.delete()
      else await shield.effect.update({ 'system.shield.remaining': next.remaining })
    }
  }

  async #syncDying(previous: number, next: number) {
    const dying = this.statuses.has('dying')
    const shouldBe = dyingAfterHealthChange(previous, next, dying)
    if (shouldBe !== dying) await this.toggleStatusEffect('dying', { active: shouldBe })
    if (next <= 0) await this.#markDefeated()
  }

  async #markDefeated() {
    const defeated = CONFIG.specialStatusEffects.DEFEATED
    if (!this.statuses.has(defeated)) await this.toggleStatusEffect(defeated, { active: true, overlay: true })
  }

  #describe(result: ReturnType<typeof applySlotDamage>, types: string[], incoming: number) {
    const parts = [`${incoming}${types.length ? ` ${types.join('/')}` : ''} incoming`]
    if (result.shieldBlockedDamage) parts.push(`shields blocked ${result.shieldBlockedDamage}`)
    if (result.physicalShieldBlockedDamage) parts.push(`Shield Block blocked ${result.physicalShieldBlockedDamage}`)
    if (result.drBlockedDamage) parts.push(`DR blocked ${result.drBlockedDamage}`)
    if (result.resistanceBlockedDamage) parts.push(`resistance blocked ${result.resistanceBlockedDamage}`)
    const immune = result.portions.filter((portion) => portion.immune).map((portion) => portion.damageType)
    if (immune.length) parts.push(`immune to ${immune.join(', ')}`)
    parts.push(`${result.damageReachingHealth} reached health`)
    return parts.join('; ') + '.'
  }

  async #postHealthCard(message: string, snapshot: Record<string, any>, options: DamageOptions = {}) {
    if (options.chat === false) return { message, snapshot }
    const content = await foundry.applications.handlebars.renderTemplate(
      'systems/crawlspace/templates/chat/health-change.hbs',
      { message, source: options.source ?? '' },
    )
    await ChatMessage.create({
      content,
      speaker: ChatMessage.getSpeaker({ actor: this }),
      flags: { crawlspace: { kind: 'healthChange', actorUuid: this.uuid, snapshot } },
    })
    return { message, snapshot }
  }

  /* ------------------------------------------------------------------ */
  /*  Debuffs                                                            */
  /* ------------------------------------------------------------------ */

  /** Add (or stack) a standard debuff by status id. Immunities are respected. */
  async addDebuff(statusId: string, stacks = 1) {
    const definition = debuffById(statusId)
    if (!definition) return
    const immune = this.system.traits?.conditionImmunities
    if (immune && [...immune].some((name: string) => name.toLowerCase() === definition.name.toLowerCase())) {
      ui.notifications.info(game.i18n.format('CRAWLSPACE.Info.Immune', { name: this.name, debuff: definition.name }))
      return
    }
    const existing = this.effects.find((effect: any) => effect.statuses.has(statusId))
    if (existing && definition.stackable)
      return existing.update({ 'system.stacks': (Number(existing.system.stacks) || 1) + stacks })
    if (existing) return existing
    return this.toggleStatusEffect(statusId, { active: true })
  }
}
