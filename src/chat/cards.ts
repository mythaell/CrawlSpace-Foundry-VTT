import { rollDamage } from '../dice/rolls'
import { actorAction, combatAction } from '../socket'
import { debuffByName } from '../rules/debuffs'

/** Actors to apply a card to: controlled tokens first, then the card's recorded targets. */
async function chosenActors(fallbackUuids: string[] = []) {
  const controlled = (canvas?.tokens?.controlled ?? []).map((token: any) => token.actor).filter(Boolean)
  if (controlled.length) return controlled
  const actors = await Promise.all(fallbackUuids.map((uuid) => fromUuid(uuid)))
  const found = actors.filter(Boolean)
  if (!found.length) ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.SelectTokens'))
  return found
}

async function onAction(message: any, button: HTMLElement) {
  const flags = message.flags?.crawlspace ?? {}
  const action = button.dataset.crawlAction
  const total = Number(message.rolls?.[0]?.total) || 0
  switch (action) {
    case 'damage-tier': {
      const speaker = ChatMessage.getSpeakerActor(message.speaker)
      if (!speaker?.isOwner) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NotYours'))
      const tier = button.dataset.tier as 'normal' | 'amazing' | 'critical'
      const targets = (flags.targets ?? []).filter((target: any) => target.success).map((target: any) => target.uuid)
      return rollDamage(speaker, flags.damage, { label: flags.label, tier, targets })
    }
    case 'apply-damage': {
      const multiplier = Number(button.dataset.multiplier) || 1
      for (const actor of await chosenActors(flags.targets ?? []))
        await actorAction(actor, 'applyDamage', total, {
          types: flags.types ?? [],
          multiplier,
          armorPiercing: flags.armorPiercing,
          magic: flags.magic,
          source: message.flavor ? '' : '',
        })
      return
    }
    case 'apply-heal': {
      for (const actor of await chosenActors(flags.targets ?? [])) await actorAction(actor, 'applyHealing', total)
      return
    }
    case 'undo': {
      const actor = await fromUuid(flags.actorUuid)
      if (!actor) return
      await actorAction(actor, 'restoreHealth', flags.snapshot)
      if (message.isOwner || game.user.isGM) await message.update({ 'flags.crawlspace.undone': true })
      return
    }
    case 'apply-debuff': {
      const debuff = debuffByName(button.dataset.debuff ?? '')
      if (!debuff) return
      for (const actor of await chosenActors(button.dataset.target ? [button.dataset.target] : []))
        await actorAction(actor, 'addDebuff', debuff.id)
      return
    }
    case 'defend': {
      const combat = game.combats.get(flags.combatId)
      if (!combat) return
      const actor = await fromUuid(button.dataset.actor ?? '')
      if (!actor?.isOwner) return ui.notifications.warn(game.i18n.localize('CRAWLSPACE.Warn.NotYours'))
      return combat.defendDeclaration(flags.declarationId, button.dataset.target, button.dataset.kind, actor)
    }
    case 'declaration-damage': {
      const combat = game.combats.get(flags.combatId)
      if (combat && game.user.isGM) return combat.rollDeclarationDamage(flags.declarationId)
      return
    }
    case 'end-turn': {
      const combat = game.combats.get(button.dataset.combat ?? '')
      if (combat) return combatAction(combat, 'markDone', button.dataset.combatant)
      return
    }
  }
}

export function registerChatHandlers() {
  Hooks.on('renderChatMessageHTML', (message: any, html: HTMLElement) => {
    if (message.flags?.crawlspace?.undone) html.querySelector('[data-crawl-action="undo"]')?.setAttribute('disabled', '')
    for (const button of html.querySelectorAll<HTMLElement>('[data-crawl-action]')) {
      button.addEventListener('click', (event) => {
        event.preventDefault()
        event.stopPropagation()
        onAction(message, button).catch((error) => {
          console.error('CrawlSpace | chat action', error)
          ui.notifications.error(error.message)
        })
      })
    }
    // Damage/healing cards get buttons appended under the roll.
    const kind = message.flags?.crawlspace?.kind
    if ((kind === 'damage' || kind === 'healing') && !html.querySelector('.crawl-apply')) {
      const bar = document.createElement('div')
      bar.className = 'crawl-apply'
      bar.innerHTML =
        kind === 'healing'
          ? `<button type="button" data-crawl-action="apply-heal"><i class="fa-solid fa-heart"></i> ${game.i18n.localize('CRAWLSPACE.Damage.ApplyHeal')}</button>`
          : `<button type="button" data-crawl-action="apply-damage" data-multiplier="0.5">×½</button>
             <button type="button" data-crawl-action="apply-damage" data-multiplier="1"><i class="fa-solid fa-burst"></i> ${game.i18n.localize('CRAWLSPACE.Damage.Apply')}</button>
             <button type="button" data-crawl-action="apply-damage" data-multiplier="2">×2</button>
             <button type="button" data-crawl-action="apply-heal" data-tooltip="${game.i18n.localize('CRAWLSPACE.Damage.HealHint')}"><i class="fa-solid fa-heart"></i></button>`
      html.querySelector('.message-content')?.append(bar)
      for (const button of bar.querySelectorAll<HTMLElement>('[data-crawl-action]'))
        button.addEventListener('click', (event) => {
          event.preventDefault()
          onAction(message, button).catch((error) => ui.notifications.error(error.message))
        })
    }
  })
}
