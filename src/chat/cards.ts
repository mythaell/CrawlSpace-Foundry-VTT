import { rollDamage } from '../dice/rolls'
import { actorAction, combatAction } from '../socket'
import { debuffByName } from '../rules/debuffs'
import { shieldBlockAllowed, shieldBlockFor } from '../rules/shield-block'

/** A row's own target, or (the "Selected tokens" row) the controlled tokens, then the card's recorded targets. */
async function rowActors(button: HTMLElement, fallbackUuids: string[] = []) {
  const uuid = button.closest<HTMLElement>('[data-target]')?.dataset.target
  if (uuid) {
    const actor = await fromUuid(uuid)
    return actor ? [actor] : []
  }
  return chosenActors(fallbackUuids)
}

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
      return rollDamage(speaker, flags.damage, { label: flags.label, subtitle: flags.subtitle, img: flags.img, tier, targets })
    }
    case 'apply-damage': {
      const multiplier = Number(button.dataset.multiplier) || 1
      const blocking = button.closest('.apply-row')?.querySelector('[data-crawl-action="toggle-block"]')?.getAttribute('aria-pressed') === 'true'
      for (const actor of await rowActors(button, flags.targets ?? [])) {
        // Shield Block: only for an actor that can block this damage (the toggle can't know every selected token).
        const block = blocking ? shieldBlockFor(actor) : null
        const shieldBlock = block && shieldBlockAllowed({ area: flags.area, types: flags.types }, block.rank) ? block : undefined
        if (blocking && !shieldBlock) ui.notifications.warn(game.i18n.format('CRAWLSPACE.Damage.CannotBlock', { name: actor.name }))
        await actorAction(actor, 'applyDamage', total, {
          types: flags.types ?? [],
          multiplier,
          armorPiercing: flags.armorPiercing,
          magic: flags.magic,
          area: flags.area,
          damageKind: flags.damageKind ?? undefined,
          magicBase: flags.magicBase ?? undefined,
          shieldBlock,
        })
      }
      return
    }
    case 'apply-heal': {
      for (const actor of await rowActors(button, flags.targets ?? [])) await actorAction(actor, 'applyHealing', total)
      return
    }
    case 'toggle-block': {
      const on = button.getAttribute('aria-pressed') !== 'true'
      button.setAttribute('aria-pressed', String(on))
      button.classList.toggle('active', on)
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

/** The part of a card under its roll: attack outcomes and damage buttons, or per-target apply rows. */
async function renderFooter(message: any) {
  const flags = message.flags?.crawlspace ?? {}
  if (flags.kind === 'attack') {
    const targets = flags.targets ?? []
    return foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/card-footer.hbs', {
      isAttack: true,
      targets,
      hasDamage: !!flags.damage?.formula,
      allMissed: targets.length > 0 && targets.every((target: any) => !target.success),
    })
  }
  const blocked = new Set(flags.blocked ?? [])
  const rows = (flags.targets ?? []).map((uuid: string) => {
    const actor = fromUuidSync(uuid)
    const block = flags.kind === 'damage' ? shieldBlockFor(actor) : null
    return {
      uuid,
      name: actor?.name ?? uuid,
      canBlock: !!block,
      blockAllowed: !!block && shieldBlockAllowed({ area: flags.area, types: flags.types }, block.rank),
      blocked: blocked.has(uuid),
    }
  })
  // Always offer the controlled tokens too, so a GM can apply the card to someone else.
  const own = flags.kind === 'damage' ? shieldBlockFor(game.user.character) : null
  rows.push({ uuid: '', name: '', canBlock: !!own, blockAllowed: !!own && shieldBlockAllowed({ area: flags.area, types: flags.types }, own.rank), blocked: false })
  return foundry.applications.handlebars.renderTemplate('systems/crawlspace/templates/chat/card-footer.hbs', {
    isAttack: false,
    healing: flags.kind === 'healing',
    rows,
  })
}

export function registerChatHandlers() {
  Hooks.on('renderChatMessageHTML', (message: any, html: HTMLElement) => {
    if (message.flags?.crawlspace?.undone) html.querySelector('[data-crawl-action="undo"]')?.setAttribute('disabled', '')
    // One delegated listener, so buttons added below (the footer) work too.
    html.addEventListener('click', (event) => {
      const button = (event.target as HTMLElement).closest<HTMLElement>('[data-crawl-action]')
      if (!button || !html.contains(button)) return
      event.preventDefault()
      event.stopPropagation()
      onAction(message, button).catch((error) => {
        console.error('CrawlSpace | chat action', error)
        ui.notifications.error(error.message)
      })
    })
    const kind = message.flags?.crawlspace?.kind
    if (!['attack', 'damage', 'healing'].includes(kind) || html.querySelector('.crawl-footer')) return
    // Cards posted before the footer existed carry their buttons in the header already.
    if (html.querySelector('.attack-targets, [data-crawl-action="damage-tier"], .crawl-apply')) return
    renderFooter(message).then((footer) => {
      if (html.querySelector('.crawl-footer')) return
      html.querySelector('.message-content')?.insertAdjacentHTML('beforeend', footer)
    })
  })
}
