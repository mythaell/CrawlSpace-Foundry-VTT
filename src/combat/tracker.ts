import { COMBAT_PHASES } from '../config'
import { combatantSide, promptDeclaration, type CrawlCombat } from './combat'
import { combatAction } from '../socket'

/** Core tracker plus a phase strip: the five phases, who still has to act, and phase controls. */
export function createCombatTracker() {
  const Base = foundry.applications.sidebar.tabs.CombatTracker
  return class CrawlCombatTracker extends Base {
    static DEFAULT_OPTIONS = {
      actions: {
        crawlPhase: CrawlCombatTracker.#onPhase,
        crawlDone: CrawlCombatTracker.#onDone,
        crawlDeclare: CrawlCombatTracker.#onDeclare,
      },
    }

    static PARTS = {
      header: Base.PARTS.header,
      phases: { template: 'systems/crawlspace/templates/combat/phases.hbs' },
      tracker: Base.PARTS.tracker,
      footer: Base.PARTS.footer,
    }

    async _preparePartContext(partId: string, context: any, options: any) {
      context = await super._preparePartContext(partId, context, options)
      if (partId !== 'phases') return context
      const combat = this.viewed as CrawlCombat | null
      if (!combat?.started) return { ...context, crawl: null }
      const current = combat.crawl.phase
      const side = COMBAT_PHASES[current]?.side
      const waiting = combat.combatants
        .filter((combatant: any) => side && !combatant.defeated && combatantSide(combatant) === side)
        .map((combatant: any) => ({
          id: combatant.id,
          name: combatant.name,
          img: combatant.img,
          done: combat.isDone(combatant.id),
          canToggle: game.user.isGM || combatant.isOwner,
        }))
      return {
        ...context,
        crawl: {
          round: combat.round,
          phases: COMBAT_PHASES.map((phase, index) => ({ ...phase, index, number: index + 1, active: index === current, past: index < current })),
          current: COMBAT_PHASES[current],
          waiting,
          isMobPhase: side === 'mob',
          canDeclare: game.user.isGM && COMBAT_PHASES[current]?.id === 'mobDeclaration',
          isGM: game.user.isGM,
        },
      }
    }

    /** Mark each combatant row with its side and done state for styling. */
    async _prepareTurnContext(combat: any, combatant: any, index: number) {
      const turn = await super._prepareTurnContext(combat, combatant, index)
      const side = combatantSide(combatant)
      const phaseSide = COMBAT_PHASES[combat.crawl?.phase ?? 0]?.side
      turn.css = [turn.css, `side-${side}`, combat.isDone?.(combatant.id) ? 'crawl-done' : '', phaseSide === side ? 'crawl-acting' : '']
        .filter(Boolean)
        .join(' ')
      return turn
    }

    static async #onPhase(this: any, _event: Event, target: HTMLElement) {
      const combat = this.viewed
      if (!combat || !game.user.isGM) return
      await combat.setPhase(Number(target.dataset.phase))
    }

    static async #onDone(this: any, _event: Event, target: HTMLElement) {
      const combat = this.viewed
      if (!combat) return
      await combatAction(combat, 'markDone', target.dataset.combatantId)
    }

    static async #onDeclare(this: any) {
      const combat = this.viewed
      if (combat && game.user.isGM) await promptDeclaration(combat)
    }
  }
}
