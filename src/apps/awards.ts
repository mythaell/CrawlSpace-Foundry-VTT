/** Crawler rewards use native achievement and sealed lootBox items. */
import { awardNumber, boxIdentity } from '../rules/crawler-awards'

export async function openAwards(actors: any[]) {
  if (!game.user.isGM) return
  const t = (key: string) => game.i18n.localize(`CRAWLSPACE.Awards.${key}`)
  const esc = foundry.utils.escapeHTML
  const fields = ['aiFavor', 'popularity', 'name', 'description', 'reward', 'box', 'quantity', 'notes']
  const answer = await foundry.applications.api.DialogV2.prompt({
    window: { title: t('Title') }, position: { width: 560 }, classes: ['crawlspace', 'awards-dialog'], rejectClose: false,
    content: `<p>${actors.map((actor) => esc(actor.name)).join(', ')}</p><p class="hint">${t('Hint')}</p>${fields.map((key) => `<div class="form-group"><label for="award-${key}">${t(key)}</label>${['description', 'notes'].includes(key) ? `<textarea id="award-${key}" name="${key}"></textarea>` : `<input id="award-${key}" name="${key}" value="${key === 'quantity' ? '1' : ''}">`}</div>`).join('')}<label class="upkeep-participant"><input name="link" type="checkbox"> ${t('Link')}</label>`,
    ok: { label: t('Award'), callback: (_event: Event, button: any) => ({ ...Object.fromEntries(fields.map((key) => [key, String(button.form.elements[key].value).trim()])), link: button.form.elements.link.checked }) },
  })
  if (!answer) return
  try {
    if (answer.box && (!Number.isInteger(Number(answer.quantity)) || Number(answer.quantity) < 1 || Number(answer.quantity) > 9999)) throw new Error('CRAWLSPACE.Awards.InvalidQuantity')
    const identity = answer.box ? boxIdentity(answer.box) : null
    const prepared = actors.map((actor) => ({ actor, favor: awardNumber(answer.aiFavor, actor.system.details.aiFavor), popularity: awardNumber(answer.popularity, actor.system.details.popularity) }))
    for (const { actor, favor, popularity } of prepared) {
      const items: any[] = []
      const boxId = foundry.utils.randomID()
      if (answer.box) items.push({ _id: boxId, name: identity!.name, type: 'lootBox', system: { sealed: true, quantity: Number(answer.quantity), notes: answer.notes, tier: identity!.tier, boxType: identity!.boxType } })
      if (answer.name) items.push({ name: answer.name, type: 'achievement', system: { description: `<p>${esc(answer.description)}</p>`, reward: answer.link && answer.box ? identity!.name : answer.reward }, flags: { crawlspace: { lootBoxId: answer.link && answer.box ? boxId : null } } })
      if (items.length) await actor.createEmbeddedDocuments('Item', items, { keepId: true })
      await actor.update({ 'system.details.aiFavor': favor, 'system.details.popularity': popularity })
      await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor }), content: `<div class="crawlspace chat-card"><h3>${t('Title')}</h3>${answer.name ? `<h4>${esc(answer.name)}</h4><p>${esc(answer.description)}</p><p>${esc(answer.link && answer.box ? identity!.name : answer.reward)}</p>` : ''}<p>${t('aiFavor')}: ${favor} - ${t('popularity')}: ${popularity}</p>${answer.box ? `<p>${esc(answer.quantity)} - ${esc(answer.box)}</p>` : ''}</div>` })
    }
  } catch (error: any) { ui.notifications.error(game.i18n.localize(error.message)) }
}
