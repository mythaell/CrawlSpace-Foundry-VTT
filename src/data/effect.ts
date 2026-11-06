/**
 * ActiveEffect system data. Extends core's V14 model (which owns `changes`) with the CrawlSpace condition
 * fields: buff/debuff kind, stacks, cast rank, rank gating, Clean Up damage and shield slots.
 */
const f = () => foundry.data.fields

/** The key an actor uses to switch one of its items' effects off for itself. */
export const itemEffectKey = (effect: any) => `${effect?.parent?.id}.${effect?.id}`

/** Has the item's actor switched this effect off (flags.crawlspace.offEffects)? */
export function actorTurnedOff(effect: any) {
  const item = effect?.parent
  const off = item?.actor?.flags?.crawlspace?.offEffects
  return Array.isArray(off) && off.includes(itemEffectKey(effect))
}

export function createEffectDataModel() {
  const Base = foundry.data.ActiveEffectTypeDataModel
  return class CrawlEffectData extends Base {
    [key: string]: any
    static defineSchema() {
      const fields = f()
      return {
        ...super.defineSchema(),
        conditionType: new fields.StringField({ required: true, blank: true, initial: '', choices: ['', 'buff', 'debuff'] }),
        stacks: new fields.NumberField({ required: true, nullable: false, integer: true, min: 1, initial: 1 }),
        maxStacks: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        /** The Rank the spell was cast at, if any. */
        rank: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        /** On a skill or spell: only active once the parent's Rank reaches this. */
        requiredRank: new fields.NumberField({ required: false, nullable: true, integer: true, initial: null }),
        /** Legacy: moved into a Clean Up Damage rule on load. */
        cleanup: new fields.SchemaField({
          formula: new fields.StringField({ required: true, blank: true, initial: '' }),
          types: new fields.ArrayField(new fields.StringField({ blank: false })),
        }),
        /** Shield slots left on an applied condition (its Condition Shield rule sets how many it starts with). */
        shield: new fields.SchemaField({
          remaining: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          perSlot: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          /** Blocks only non-magic damage (CrawlSpace scope `nonMagic`). */
          nonMagic: new fields.BooleanField(),
        }),
        castBy: new fields.StringField({ required: true, blank: true, initial: '' }),
        durationText: new fields.StringField({ required: true, blank: true, initial: '' }),
      }
    }

    /**
     * Clean Up damage and shield slots used to be fields of their own; they are rules now. An old effect's
     * values move into its changes when it loads (world, actors and compendia alike).
     */
    static migrateData(source: any) {
      const legacy = Number(source?.shield?.perSlot) > 0 || !!source?.cleanup?.formula
      if (source && legacy && !Array.isArray(source.changes)) source.changes = []
      const changes: any[] = Array.isArray(source?.changes) ? source.changes : null
      if (changes) {
        const has = (key: string) => changes.some((change) => change?.type === 'crawlspace.special' && change.key === key)
        const special = (key: string, value: Record<string, unknown>) => ({ key, type: 'crawlspace.special', value: JSON.stringify(value), phase: 'initial', priority: null })
        const cleanup = source.cleanup
        if (cleanup?.formula && !has('cleanup')) {
          changes.push(special('cleanup', { value: String(cleanup.formula), damageTypes: Array.isArray(cleanup.types) ? cleanup.types : [] }))
          source.cleanup = { formula: '', types: [] }
        }
        const shield = source.shield
        if (Number(shield?.perSlot) > 0 && !has('shield')) {
          changes.push(special('shield', { target: String(shield.perSlot), value: String(shield.remaining ?? 0), scope: shield.nonMagic ? 'nonMagic' : 'all' }))
          // The rule now says how many slots it starts with; remaining stays as the running count (it must
          // match the stored value, or a later write of the same number would be a no-op on the server).
          source.shield = { remaining: Number(shield.remaining) || 0, perSlot: 0, nonMagic: false }
        }
      }
      return super.migrateData(source)
    }

    /**
     * Core reads this to decide whether an otherwise enabled effect applies. Gear only works while equipped,
     * and a skill or spell's rank-gated effect waits for its Rank (CrawlSpace `requiredRank`).
     */
    get isSuppressed() {
      return !!this.suppression
    }

    /**
     * Why an enabled effect doesn't apply: 'expired', 'unequipped' gear, a Rank not yet reached, or 'off' when
     * the owning actor switched an item's effect off for itself (the item keeps its own on/off).
     */
    get suppression(): '' | 'expired' | 'unequipped' | 'rank' | 'off' | 'cast' {
      const effect = this.parent
      if (effect?.duration?.expired) return 'expired'
      const item = effect?.parent?.documentName === 'Item' ? effect.parent : null
      if (!item) return ''
      if (actorTurnedOff(effect)) return 'off'
      // A spell's own effects aren't always on: casting it puts a copy on the caster (applyCastEffects).
      if (item.type === 'spell' && effect.transfer) return 'cast'
      if (['weapon', 'equipment', 'tattoo'].includes(item.type) && !item.system.equipped) return 'unequipped'
      if (this.requiredRank !== null && this.requiredRank !== undefined && ['skill', 'spell'].includes(item.type)) {
        const actor = item.actor
        const prepass = actor?.rankPrepass?.(item.type) ?? {}
        const rank =
          item.system.rank?.override ??
          (Number(item.system.rank?.value) || 0) + (Number(prepass[item.name.trim().toLowerCase()]) || 0)
        if (rank < this.requiredRank) return 'rank'
      }
      return ''
    }
  }
}
