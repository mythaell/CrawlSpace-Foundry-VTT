/**
 * ActiveEffect system data. Extends core's V14 model (which owns `changes`) with the CrawlSpace condition
 * fields: buff/debuff kind, stacks, cast rank, rank gating, Clean Up damage and shield slots.
 */
const f = () => foundry.data.fields

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
        /** Recurring damage rolled once per round in Clean Up, e.g. `1d8+F` Poison. */
        cleanup: new fields.SchemaField({
          formula: new fields.StringField({ required: true, blank: true, initial: '' }),
          types: new fields.ArrayField(new fields.StringField({ blank: false })),
        }),
        /** Temporary shield slots; the condition ends when they run out. */
        shield: new fields.SchemaField({
          remaining: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          perSlot: new fields.NumberField({ required: true, nullable: false, integer: true, min: 0, initial: 0 }),
          magicOnly: new fields.BooleanField(),
        }),
        castBy: new fields.StringField({ required: true, blank: true, initial: '' }),
        durationText: new fields.StringField({ required: true, blank: true, initial: '' }),
      }
    }

    /**
     * Core reads this to decide whether an otherwise enabled effect applies. Gear only works while equipped,
     * and a skill or spell's rank-gated effect waits for its Rank (CrawlSpace `requiredRank`).
     */
    get isSuppressed() {
      const effect = this.parent
      if (effect?.duration?.expired) return true
      const item = effect?.parent?.documentName === 'Item' ? effect.parent : null
      if (!item) return false
      if (['weapon', 'equipment', 'tattoo'].includes(item.type) && !item.system.equipped) return true
      if (this.requiredRank !== null && this.requiredRank !== undefined && ['skill', 'spell'].includes(item.type)) {
        const actor = item.actor
        const prepass = actor?.rankPrepass?.(item.type) ?? {}
        const rank =
          item.system.rank?.override ??
          (Number(item.system.rank?.value) || 0) + (Number(prepass[item.name.trim().toLowerCase()]) || 0)
        return rank < this.requiredRank
      }
      return false
    }
  }
}
