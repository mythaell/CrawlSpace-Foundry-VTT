/** Native Foundry rolls, with CrawlSpace totals always rounded down (including negative totals). */
export class CrawlRoll extends Roll {
  // Foundry serializes this name in chat rolls; it must survive production minification.
  static get name() { return 'CrawlRoll' }

  async _evaluate(options: any = {}) {
    await super._evaluate(options)
    if (typeof this._total === 'number') this._total = Math.floor(this._total)
    return this
  }

  _evaluateSync(options: any = {}) {
    super._evaluateSync(options)
    if (typeof this._total === 'number') this._total = Math.floor(this._total)
    return this
  }

  _evaluateTotal() {
    return Math.floor(super._evaluateTotal())
  }
}
