/** The CrawlSpace effect sheet: condition fields on one side, the shared rules editor for its changes. */
import { effectDuration } from '../import/convert'
import { bindRulesEditor, rulesContext, rulesDatalists, ruleTypeChoices } from '../effects/rules'
import { documentIds } from './ids'

const { HandlebarsApplicationMixin, DocumentSheetV2 } = foundry.applications.api

export class CrawlEffectSheet extends HandlebarsApplicationMixin(DocumentSheetV2) {
  static DEFAULT_OPTIONS: any = {
    classes: ['crawlspace', 'effect-sheet'],
    position: { width: 600, height: 680 },
    form: { submitOnChange: true },
    window: { resizable: true },
    actions: { toggleDisabled: CrawlEffectSheet.#onToggleDisabled, copyId: CrawlEffectSheet.#onCopyId },
  }

  static PARTS = {
    body: { template: 'systems/crawlspace/templates/effects/effect-sheet.hbs', scrollable: [''] },
  }

  get effect() {
    return this.document
  }

  get title() {
    return `${game.i18n.localize('CRAWLSPACE.Effect.Effect')}: ${this.effect.name}`
  }

  async _prepareContext(options: any) {
    const context = await super._prepareContext(options)
    const effect = this.effect
    const system = effect.system ?? {}
    return Object.assign(context, {
      effect,
      system,
      source: effect._source,
      systemSource: effect._source.system ?? {},
      onItem: effect.parent?.documentName === 'Item',
      conditionChoices: { '': 'CRAWLSPACE.Effect.Plain', buff: 'CRAWLSPACE.Effect.Buff', debuff: 'CRAWLSPACE.Effect.Debuff' },
      shieldLeft: shieldLeft(effect),
      ids: documentIds(effect),
      rules: rulesContext(effect),
      ruleTypes: ruleTypeChoices(),
      datalists: rulesDatalists(),
      enrichedDescription: await foundry.applications.ux.TextEditor.implementation.enrichHTML(effect.description ?? '', { relativeTo: effect }),
    })
  }

  async _onRender(context: any, options: any) {
    await super._onRender(context, options)
    bindRulesEditor(this.element, () => this.effect, this.isEditable)
  }

  _processFormData(event: any, form: any, formData: any) {
    const data = super._processFormData(event, form, formData)
    const durationText = data.system?.durationText
    if (durationText !== undefined && durationText !== this.effect.system.durationText) {
      data.duration = { value: null, units: 'seconds', expiry: null, ...effectDuration(durationText), expired: false }
      if (this.effect.actor) data.start = foundry.documents.ActiveEffect.getEffectStart()
    }
    return data
  }

  static async #onToggleDisabled(this: CrawlEffectSheet) {
    await this.effect.update({ disabled: !this.effect.disabled })
  }

  static async #onCopyId(this: CrawlEffectSheet, _event: PointerEvent, target: HTMLElement) {
    game.clipboard.copyPlainText(target.dataset.value ?? '')
    ui.notifications.info(game.i18n.format('CRAWLSPACE.Ids.Copied', { value: target.dataset.value }))
  }
}

/** On an applied condition with a Condition Shield rule: how many slots are left. */
function shieldLeft(effect: any) {
  const actor = effect.parent?.documentName === 'Actor' ? effect.parent : null
  const shield = actor?.conditionShields?.().find((entry: any) => entry.id === effect.id)
  return shield ? game.i18n.format('CRAWLSPACE.Effect.ShieldLeft', { remaining: shield.remaining, total: shield.total, perSlot: shield.perSlot }) : ''
}
