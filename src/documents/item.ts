import { penaltyModifiers, rollAttack, rollCheck, rollDamage, type Modifier } from '../dice/rolls'
import { STATS, statKeyFromCode } from '../config'
import { attackWithRow, rowForItem } from '../actors/attacks'

export class CrawlItem extends Item {
  get isRanked() {
    return this.type === 'skill' || this.type === 'spell'
  }

  /** Modifiers for a check made with this skill or spell: Rank + stat mod + debuff penalties. */
  checkModifiers(): Modifier[] {
    const actor = this.actor
    const system = this.system
    const stat = statKeyFromCode(system.stat)
    return [
      { label: game.i18n.format('CRAWLSPACE.Roll.RankOf', { name: this.name }), value: Number(system.rank?.total) || 0 },
      { label: stat ? STATS[stat].label : game.i18n.localize('CRAWLSPACE.Roll.Modifier'), value: Number(system.rank?.mod) || 0 },
      ...penaltyModifiers(actor),
    ]
  }

  /** The skill used to attack with a weapon: its named skill if the actor has it. */
  weaponSkill() {
    if (this.type !== 'weapon' || !this.actor) return null
    const names = [this.system.skill, this.name, `${this.name} Training`].map((name) => String(name || '').trim().toLowerCase()).filter(Boolean)
    for (const name of names) {
      const skill = this.actor.items.find((item: any) => item.type === 'skill' && item.name.toLowerCase() === name)
      if (skill) return skill
    }
    // No skill named: the longest skill name that appears as a word in the weapon's name ("Dagger of the Night Stalker" → Dagger).
    const words = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `
    const weaponName = words(this.name)
    const contained = this.actor.items
      .filter((item: any) => item.type === 'skill' && item.name.length > 2 && weaponName.includes(words(item.name)))
      .sort((a: any, b: any) => b.name.length - a.name.length)
    return contained[0] ?? null
  }

  /** Spend mana for a spell; refuses when there is not enough (spellCasting.ts). */
  async payMana(): Promise<boolean> {
    const actor = this.actor
    const cost = Number(this.system.manaCost) || 0
    if (!actor || this.type !== 'spell' || cost <= 0 || this.system.usage === 'inherent') return true
    if (actor.statuses.has('muted')) {
      ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.Muted', { name: actor.name }))
      return false
    }
    const current = Number(actor.system.mana?.value) || 0
    if (current < cost) {
      ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.NoMana', { name: this.name, cost, current }))
      return false
    }
    await actor.update({ 'system.mana.value': current - cost })
    return true
  }

  /** Spend one unit of a consumable or linked ammunition; false (and a warning) when none are left. */
  async spendOne(): Promise<boolean> {
    const quantity = Number(this.system.quantity) || 0
    if (quantity <= 0) {
      ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.NoneLeft', { name: this.name }))
      return false
    }
    await this.update({ 'system.quantity': quantity - 1 })
    return true
  }

  /** Main "use" action from sheets, hotbar macros and the hotlist. */
  async use(options: { fast?: boolean } = {}) {
    const actor = this.actor
    if (!actor) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NoActor'))
    switch (this.type) {
      case 'skill':
      case 'spell':
        return this.#useRanked(options)
      case 'weapon':
        return this.#useWeapon(options)
      case 'consumable':
        return this.#useConsumable()
      default:
        return this.toMessage()
    }
  }

  async #useRanked(options: { fast?: boolean }) {
    const system = this.system
    const pay = this.type === 'spell' ? () => this.payMana() : undefined
    if (system.isAttack) {
      return rollAttack(
        this.actor,
        {
          label: this.name,
          modifiers: this.checkModifiers(),
          sources: [this.name, ...(this.type === 'spell' ? ['Spells'] : [])],
          damage: {
            formula: system.damage.atRank || system.damage.formula,
            types: system.damage.types,
            armorPiercing: system.damage.armorPiercing,
            magic: this.type === 'spell' || system.damage.magic,
          },
          pay,
        },
        options,
      )
    }
    if (pay && !(await pay())) return null
    if (system.checkType === 'Passive') return this.toMessage()
    return rollCheck(this.actor, {
      label: this.name,
      kind: 'check',
      modifiers: this.checkModifiers(),
      sources: [this.name],
      fast: options.fast,
      flavor: this.type === 'spell' && this.system.manaCost ? game.i18n.format('CRAWLSPACE.Spell.Cast', { mana: this.system.manaCost }) : '',
    })
  }

  async #useWeapon(options: { fast?: boolean }) {
    // A saved Attacks row for this weapon keeps its overrides; otherwise use the weapon as is.
    const saved = (this.actor.system.attacks ?? []).find((row: any) => row.sourceId === this.id)
    return attackWithRow(this.actor, saved ?? rowForItem(this), options)
  }

  async #useConsumable() {
    const system = this.system
    if (!(await this.spendOne())) return null
    const actor = this.actor
    if (system.manaRestore) {
      const max = Number(actor.system.mana?.max) || 0
      const text = String(system.manaRestore).trim()
      const restore = text.endsWith('%') ? Math.floor((max * Number(text.slice(0, -1))) / 100) : Number(text) || 0
      await actor.update({ 'system.mana.value': Math.min(max, (Number(actor.system.mana.value) || 0) + restore) })
    }
    // Healing rolls give health slots; the card's Heal button applies them.
    if (system.healing?.formula)
      await rollDamage(actor, { formula: system.healing.formula, types: [] }, { label: `${this.name}: ${game.i18n.localize('CRAWLSPACE.Damage.Healing')}`, healing: true })
    if (system.damage?.formula) await rollDamage(actor, { ...system.damage, types: system.damage.types }, { label: this.name })
    return this.toMessage()
  }

  /** Post the item's description as a chat card. */
  async toMessage() {
    const description = await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.description ?? '', {
      relativeTo: this,
      rollData: this.actor?.getRollData?.() ?? {},
    })
    const content = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/item.hbs', {
      item: this,
      description,
      notes: this.system.notes,
    })
    return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: this.actor }), flags: { crawlspace: { kind: 'item', itemUuid: this.uuid } } })
  }

  /** Enforce one item per body slot and ten accessories when equipping. */
  async _preUpdate(changed: any, options: any, user: any) {
    if ((await super._preUpdate(changed, options, user)) === false) return false
    const equipping = foundry.utils.getProperty(changed, 'system.equipped') === true
    if (!equipping || this.type !== 'equipment' || !this.actor) return
    const slot = foundry.utils.getProperty(changed, 'system.slot') ?? this.system.slot
    const occupied = this.actor.items.filter(
      (item: any) => item.id !== this.id && item.type === 'equipment' && item.system.equipped && item.system.slot === slot,
    )
    const limit = slot === 'accessory' ? 10 : 1
    if (occupied.length >= limit) {
      ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.SlotFull', { slot, limit }))
      return false
    }
  }
}
