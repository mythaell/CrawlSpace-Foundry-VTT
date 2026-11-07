import { applyCastEffects } from '../effects/use-conditions'
import { handEquipmentConflict, type WornItem } from '../crawlspace-shared/shared/equipmentSlots'
import { openLootBoxes } from '../loot/boxes'
import { buildEffect, effectDuration, stableId } from '../import/convert'
import { BUILD_EFFECT_FIELDS } from '../data/items'
import { itemCooldown, withCooldowns } from '../effects/cooldowns'
import { penaltyModifiers, rollAttack, rollCheck, rollDamage, type Modifier } from '../dice/rolls'
import { STATS, statKeyFromCode } from '../config'
import { attackWithRow, resolveAttack, rowForItem, withEffectBonuses } from '../actors/attacks'
import { conditionRows, itemCardDetails } from '../effects/use-conditions'
import { advancementPick } from '../rules/damage-effects'

/** Targeted tokens, or the user themself when nothing is targeted. */
const healTargets = (actor: any): string[] => {
  const targeted = [...game.user.targets].map((token: any) => token.actor?.uuid).filter(Boolean)
  return targeted.length ? targeted : [actor.uuid]
}

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
    if (!['weapon', 'consumable'].includes(this.type) || !this.actor) return null
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
    // Broken gear can't be used until it is repaired.
    if (this.system?.broken) return ui.notifications.warn(game.i18n.format('CRAWLSPACE.Warn.Broken', { name: this.name }))
    switch (this.type) {
      case 'skill':
      case 'spell':
        return withCooldowns(actor, [itemCooldown(this)], async () => {
          const result = await this.#useRanked(options)
          // A Passive skill only posts its card; anything rolled (or any spell cast) counts toward advancement.
          if (result && (this.type === 'spell' || this.system.checkType !== 'Passive')) await markAttackAdvancement(actor, [this], (result as any)?.effectSkills ?? [])
          if (result) await applyCastEffects(this)
          return result
        })
      case 'weapon':
        return this.#useWeapon(options)
      case 'consumable':
        if (this.system.consumableType === 'explosives') return attackWithRow(actor, rowForItem(this), options)
        return this.#useConsumable()
      case 'lootBox':
        return this.#openBox()
      default:
        return this.toMessage()
    }
  }

  async #useRanked(options: { fast?: boolean }) {
    const system = this.system
    const pay = this.type === 'spell' ? () => this.payMana() : undefined
    const kind = this.type as 'skill' | 'spell'
    // One card per use: attacks show the roll and its buttons; other skills and spells add their description.
    const details = await itemCardDetails(this, { attack: system.isAttack })
    if (system.isAttack) {
      // The same attack the attacks table makes (its saved row, if any): modifiers, damage effect options, ranks.
      const saved = (this.actor.system.attacks ?? []).find((row: any) => row.sourceId === this.id)
      const attack = resolveAttack(this.actor, saved ?? rowForItem(this))
      const attacked = await rollAttack(
        this.actor,
        { ...attack, sources: [...new Set([...attack.sources, ...(this.type === 'spell' ? ['Spells'] : [])])], details },
        options,
      )
      // An attack that also heals (Drain Life) heals its caster once the attack goes through.
      const drain = String(system.healing?.atRank ?? '').trim()
      if (attacked && drain)
        await rollDamage(this.actor, { formula: drain, types: [] }, { label: `${this.name}: ${game.i18n.localize('CRAWLSPACE.Damage.Healing')}`, img: this.img, healing: true, targets: [this.actor.uuid] })
      return attacked
    }
    // Heal spells and skills: pay, roll the healing at the current Rank, and let the card apply the slots.
    const healing = String(system.healing?.atRank ?? '').trim()
    if (healing) {
      if (pay && !(await pay())) return null
      return rollDamage(
        this.actor,
        { formula: healing, types: [] },
        { label: `${this.name}: ${game.i18n.localize('CRAWLSPACE.Damage.Healing')}`, img: this.img, healing: true, targets: healTargets(this.actor), details },
      )
    }
    if (system.checkType === 'Passive') {
      if (pay && !(await pay())) return null
      return this.toMessage({ ranked: true })
    }
    return rollCheck(this.actor, {
      details,
      label: this.name,
      kind: 'check',
      pay,
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
      // manaRestore.ts manaRestorePoints: percentage and point recovery both round down.
      const restore = text.endsWith('%') ? Math.floor((max * Number(text.slice(0, -1))) / 100) : Math.floor(Number(text) || 0)
      await actor.update({ 'system.mana.value': Math.min(max, (Number(actor.system.mana.value) || 0) + restore) })
    }
    // Healing rolls give health slots; the card's Heal button applies them.
    if (system.healing?.formula)
      await rollDamage(actor, { formula: system.healing.formula, types: [] }, { label: `${this.name}: ${game.i18n.localize('CRAWLSPACE.Damage.Healing')}`, img: this.img, healing: true, targets: [actor.uuid] })
    if (system.damage?.formula) await rollDamage(actor, { ...system.damage, types: system.damage.types }, { label: this.name })
    // Conditions the item gives when used (a potion's Good Mana Refill) go on the user, timed by core durations.
    const conditions = this.effects.filter((effect: any) => !effect.transfer)
    if (conditions.length)
      await actor.createEmbeddedDocuments(
        'ActiveEffect',
        conditions.map((effect: any) => {
          const data = effect.toObject()
          delete data._id
          delete data.start
          data.duration = { ...data.duration, ...(effectDuration(data.system?.durationText) ? { expiry: null, ...effectDuration(data.system.durationText) } : {}), expired: false }
          return { ...data, transfer: true, disabled: false, origin: this.uuid }
        }),
      )
    return this.toMessage()
  }

  /** Open a sealed box now. Boxes usually open during Safe Room upkeep, so this asks first. */
  async #openBox() {
    if (!this.system.sealed) return this.toMessage()
    const ok = await foundry.applications.api.DialogV2.confirm({
      window: { title: this.name },
      content: `<p>${game.i18n.format('CRAWLSPACE.Loot.OpenConfirm', { name: foundry.utils.escapeHTML(this.name), quantity: this.system.quantity })}</p>`,
      rejectClose: false,
    })
    if (ok) return openLootBoxes(this.actor, [this])
  }

  /** Post the item's description as a chat card. */
  async toMessage(options: { ranked?: boolean } = {}) {
    // A used skill or spell shows what its Rank gives (upgrades reached), its area and conditions.
    const ranked = options.ranked && ['skill', 'spell'].includes(this.type)
    const description = ranked
      ? ''
      : await foundry.applications.ux.TextEditor.implementation.enrichHTML(this.system.description ?? '', {
          relativeTo: this,
          rollData: this.actor?.getRollData?.() ?? {},
        })
    const content = await foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/item.hbs', {
      item: this,
      description,
      notes: this.system.notes,
      conditions: ranked ? await itemCardDetails(this) : options.ranked ? conditionRows(this) : '',
    })
    return ChatMessage.create({ content, speaker: ChatMessage.getSpeaker({ actor: this.actor }), flags: { crawlspace: { kind: 'item', itemUuid: this.uuid } } })
  }

  /** Enforce one item per body slot, ten accessories, and two hands when equipping. */
  async _preUpdate(changed: any, options: any, user: any) {
    if ((await super._preUpdate(changed, options, user)) === false) return false
    const equipping = foundry.utils.getProperty(changed, 'system.equipped') === true
    if (!equipping || !this.actor) return
    // A two-handed weapon takes both hands (equipmentSlots.ts handEquipmentConflict).
    const worn = this.actor.items.contents.map((item: any) => wornItem(item, item.id === this.id ? changed : null))
    const conflict = handEquipmentConflict(worn, this.id)
    if (conflict) {
      ui.notifications.warn(conflict)
      return false
    }
    if (this.type !== 'equipment') return
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

  _onUpdate(changed: any, options: any, userId: string) {
    super._onUpdate(changed, options, userId)
    if (userId !== game.user.id || !['race', 'class'].includes(this.type)) return
    if (BUILD_EFFECT_FIELDS.some((key) => changed.system && key in changed.system)) this.syncBuildEffect()
  }

  /** Rebuild the race or class's "Build" effect from its stat, skill, spell and DR bonuses. */
  async syncBuildEffect() {
    const source = this._source.system
    const wanted = buildEffect(this.name, this.img, source)
    // Items imported before builds were tracked carry the same effect without the flag, under the id the importer gave it.
    const legacyId = stableId(`${this.name}-effect-0-${this.name}`)
    const current = this.effects.find((effect: any) => effect.getFlag('crawlspace', 'build')) ?? this.effects.get(legacyId)
    if (!wanted) return current?.delete()
    if (current) return current.update({ 'system.changes': wanted.system.changes, 'flags.crawlspace.build': true })
    return this.createEmbeddedDocuments('ActiveEffect', [wanted])
  }
}

/** An owned item as the app's hand-slot rules see it; `changed` is a pending update to it. */
function wornItem(item: any, changed: any): WornItem {
  const get = (path: string) => (changed && foundry.utils.hasProperty(changed, path) ? foundry.utils.getProperty(changed, path) : foundry.utils.getProperty(item, path))
  const twoHanded = !!get('system.twoHanded') || String(get('system.hands') ?? '').trim() === '2'
  return {
    id: item.id,
    name: item.name,
    equipped: !!get('system.equipped'),
    properties: {
      itemType: item.type,
      equipment: { slot: item.type === 'equipment' && get('system.slot') === 'hands' ? 'Hands' : String(get('system.slot') ?? '') },
      ...(item.type === 'weapon' ? { weapon: { twoHanded } } : {}),
    },
  }
}

/** Mark a crawler's rolled skills and spells for advancement (the upkeep checks them). */
export async function markForAdvancement(items: any[]) {
  const byActor = new Map<any, string[]>()
  for (const item of items) {
    const actor = item?.actor
    if (!actor || actor.type !== 'crawler' || !actor.isOwner || !['skill', 'spell'].includes(item.type) || item.system.marked) continue
    byActor.set(actor, [...(byActor.get(actor) ?? []), item.id])
  }
  for (const [actor, ids] of byActor) await actor.updateEmbeddedDocuments('Item', [...new Set(ids)].map((_id) => ({ _id, 'system.marked': true })))
}

/**
 * Mark an attack's skills for advancement. With damage effect skills ticked, the rules mark only one of the skills
 * used: an unmarked one when the rest already are, else the player's pick.
 */
export async function markAttackAdvancement(actor: any, attackItems: any[], effectNames: string[] = []) {
  const effects = [...new Set(effectNames)].map((name) => actor.items.find((item: any) => item.type === 'skill' && item.name === name)).filter(Boolean)
  if (!effects.length) return markForAdvancement(attackItems)
  if (actor.type !== 'crawler' || !actor.isOwner) return
  const entry = (item: any) => ({ id: item.id, marked: !!item.system.marked, item })
  const ranked = attackItems.filter((item) => item && ['skill', 'spell'].includes(item.type))
  const { mark, choose } = advancementPick(ranked.map(entry), effects.map(entry))
  if (mark.length) return markForAdvancement(mark.map((candidate) => candidate.item))
  if (!choose.length) return
  const picked = await foundry.applications.api.DialogV2.wait({
    window: { title: game.i18n.localize('CRAWLSPACE.Advance.ChooseTitle'), icon: 'fa-solid fa-arrow-up-right-dots' },
    content: `<p>${game.i18n.localize('CRAWLSPACE.Advance.ChooseHint')}</p>`,
    buttons: choose.map((candidate, index) => ({ action: candidate.id, label: candidate.item.name, default: index === 0 })),
    rejectClose: false,
  })
  const item = picked ? actor.items.get(picked) : null
  if (item) await markForAdvancement([item])
}
