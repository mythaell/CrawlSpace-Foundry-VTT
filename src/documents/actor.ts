import { announceImmunity } from '../effects/immunity'
import { creditKillingBlow, spellKillBonus } from '../effects/killing-blows'
import { expireActorEvent } from '../time'
import { HEALTH_MAX } from '../config'
import { applySlotDamage, dyingAfterHealthChange, type ConditionShield } from '../rules/core'
import { debuffById } from '../rules/debuffs'
import { CUSTOM_CHANGE_TYPES } from '../effects/mapping'
import { capsMagicDamage, halvesAreaDamage, hasRegen, regenAdvance } from '../effects/specials'

export type DamageOptions = {
  types?: string[]
  multiplier?: number
  armorPiercing?: boolean
  magic?: boolean
  /** Area damage: halved for an actor with an areaDamageHalf effect. */
  area?: boolean
  /** Skill or spell damage, for magicDamageCap targets. */
  damageKind?: 'skill' | 'spell'
  /** The spell's Rank 1 base damage, rolled with the card (magicDamageCap). */
  killingBlowSpell?: string
  magicBase?: number
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
      if (effect.active && effect.statuses.has(statusId)) stacks += Number(effect.system?.stacks) || 1
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

  /**
   * Active condition shields (e.g. Hot Stuff Aura) as damage-rule input. A condition's Shield effect gives
   * the slot count and health per slot (numbers or a stat), and a shield at 0 remaining starts full: a used-up
   * shield deletes its condition (conditionShields.ts activeConditionShields).
   */
  conditionShields(): (ConditionShield & { effect: any })[] {
    const statMod = (value: unknown) => {
      const text = String(value ?? '').trim()
      return /^(STR|INT|CON|DEX|CHA)$/i.test(text) ? Number(this.system.statMod?.(text.toUpperCase())) || 0 : Math.floor(Number(text) || 0)
    }
    const specials = (this.system.specials ?? []).filter((special: any) => special.type === 'shield')
    return this.effects
      .filter((effect: any) => effect.active)
      .map((effect: any) => {
        const special = specials.find((entry: any) => entry.effectId === effect.id)
        const shield = effect.system?.shield ?? {}
        return {
          id: effect.id,
          effect,
          remaining: Number(shield.remaining) || (special ? statMod(special.value) : 0),
          perSlot: Number(shield.perSlot) || (special ? statMod(special.target) : 0),
          nonMagic: !!shield.nonMagic || special?.scope === 'nonMagic',
        }
      })
      .filter((shield: any) => shield.remaining > 0 && shield.perSlot > 0)
  }

  /**
   * Apply damage the way CrawlSpace does: condition shields, magical shield slots, Shield Block, DR,
   * resistances, then whole health slots. Returns the breakdown and posts an undoable chat card.
   */
  async applyDamage(amount: number, options: DamageOptions = {}) {
    const multiplier = options.multiplier ?? 1
    const halved = options.area && halvesAreaDamage(this)
    const incoming = Math.floor(Math.max(0, amount) * multiplier * (halved ? 0.5 : 1))
    const magicDamageCap =
      options.magic && options.magicBase != null && capsMagicDamage(this, options.damageKind) ? Number(options.magicBase) : undefined
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
        magicDamageCap,
      })
      const health = Math.max(0, system.health.value - result.slotsLost * 10)
      await this.update({ 'system.health.value': health, 'system.shield.slots': result.shieldStates })
      await this.#updateConditionShields(shields, result.conditionShields)
      await this.#syncDying(before.health, health)
      if (before.health > 0 && health <= 0) await creditKillingBlow(options.killingBlowSpell)
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
      magicDamageCap,
    })
    await this.update({ 'system.slotsLost': system.slotsLost + result.slotsLost })
    await this.#updateConditionShields(shields, result.conditionShields)
    if (result.slotsLost >= remaining) await this.#markDefeated()
    if (remaining > 0 && result.slotsLost >= remaining) await creditKillingBlow(options.killingBlowSpell)
    const summary = this.#describe(result, types, incoming)
    return this.#postHealthCard(`${this.name} lost ${result.slotsLost} health slot${result.slotsLost === 1 ? '' : 's'}. ${summary}`, before, options)
  }

  /** Each lethal hit credits its source spell once; subsequent damage to a defeated target gives nothing. */
  async awardKillingBlow(itemId: string) {
    const item = this.items.get(itemId)
    if (item?.type !== 'spell' || !item.system.killingBlowStacking) return
    const rank = item.system.rank.total
    await item.update({ 'system.killingBlowStacks': Math.min(rank, spellKillBonus(item, rank) + 1), 'system.killingBlowFloor': String(this.system.details.floor), 'system.killingBlowAt': Date.now(), 'flags.crawlspace.killingBlowTime': game.time.worldTime })
  }

  /** Mana and health regeneration effects, for in-game seconds that passed (combat rounds or the clock). */
  async regenerate(seconds: number, prepared?: ReturnType<typeof regenAdvance>) {
    if (!(seconds > 0) || (!prepared && !hasRegen(this))) return
    const result = prepared ?? regenAdvance(this, this.getFlag('crawlspace', 'regen') ?? {}, seconds)
    const update: Record<string, unknown> = { 'flags.crawlspace.regen': result.elapsed }
    const mana = this.system.mana
    if (result.mana > 0 && mana && Number(mana.value) < Number(mana.max))
      update['system.mana.value'] = Math.min(Number(mana.max) || 0, (Number(mana.value) || 0) + result.mana)
    await this.update(update)
    const hurt = this.type === 'crawler' ? this.system.health.value < HEALTH_MAX : Number(this.system.slotsLost) > 0
    if (result.slots > 0 && hurt) await this.applyHealing(result.slots, { source: game.i18n.localize('CRAWLSPACE.Effect.Regeneration') })
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
      if (healed > 0) await expireActorEvent('healed', [this])
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
    if (result.magicCapBlockedDamage) parts.push(`magic damage capped, ${result.magicCapBlockedDamage} ignored`)
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
      await announceImmunity(this, definition.name)
      return
    }
    const existing = this.effects.find((effect: any) => effect.active && effect.statuses.has(statusId))
    if (existing && definition.stackable)
      return existing.update({ 'system.stacks': (Number(existing.system.stacks) || 1) + stacks })
    if (existing) return existing
    return this.toggleStatusEffect(statusId, { active: true })
  }
}
