/** Grinding: actual hours, overtime fatigue, daily checks and level progress (partyUpkeepActions.ts). */
import { normalizeGrinding, creditGrindingHour, creditGrindingAid, nextGrindingDay, isUniqueLowestCrawler } from '../rules/grinding'
import { floorCheckDc } from '../rules/floor-checks'
import { rankCap } from '../effects/rank-cap'
import { rollD20, naturalD20, penaltyModifiers } from '../dice/rolls'
import { advanceTime } from '../time'

const t = (key: string, data?: any) => data ? game.i18n.format(`CRAWLSPACE.Grinding.${key}`, data) : game.i18n.localize(`CRAWLSPACE.Grinding.${key}`)
const esc = (value: unknown) => foundry.utils.escapeHTML(String(value))

export async function openGrinding(actors: any[], hours = 1, policy: { advance?: boolean } = {}) {
  if (!game.user.isGM) return
  if (!Number.isSafeInteger(hours) || hours < 1 || hours > 30) throw new Error(t('HoursError'))
  const options = await foundry.applications.api.DialogV2.prompt({
    window: { title: t('Title') }, position: { width: 560 }, classes: ['crawlspace', 'grinding-dialog'], rejectClose: false,
    content: `<p>${t('Hint')}</p><div class="form-group"><label>${t('Aid')}</label><select name="aid"><option value="none">${t('None')}</option><option value="neighborhood">${t('Neighborhood')}</option><option value="borough">${t('Borough')}</option></select></div><label class="upkeep-participant"><input type="checkbox" name="newDay"> ${t('NewDay')}</label>`,
    ok: { callback: (_event: Event, button: any) => ({ aid: button.form.elements.aid.value, newDay: button.form.elements.newDay.checked }) },
  })
  if (!options) return
  const levels = game.actors.filter((actor: any) => actor.type === 'crawler').map((actor: any) => ({ uuid: actor.uuid, level: actor.system.details.level }))
  const prepared: any[] = []
  // Validate the entire party before rolling or changing time.
  for (const actor of actors) {
    let state = normalizeGrinding(actor.getFlag('crawlspace', 'grinding'))
    if (options.newDay) state = nextGrindingDay(state)
    const endurance = actor.items.find((item: any) => item.type === 'skill' && /^endurance$/i.test(item.name.trim()))
    if (state.hoursToday + hours > 30) throw new Error(t('DayError', { name: actor.name }))
    if (state.hoursToday + hours > 5 && !endurance) throw new Error(t('EnduranceError', { name: actor.name }))
    prepared.push({ actor, base: JSON.stringify({ grinding: actor.getFlag('crawlspace', 'grinding'), level: actor.system.details.level, items: actor.items.map((item: any) => [item.id, item.system.rank?.value]) }), state, endurance, fatigue: 0, lines: [], updates: [] })
  }
  for (const entry of prepared) {
    const { actor, endurance } = entry
    let state = entry.state
    for (let hour = 0; hour < hours; hour++) {
      let productive = true
      if (state.hoursToday >= 5) {
        const result = await rollD20(actor, { label: t('Overtime'), kind: 'check', sources: ['Endurance'], modifiers: [...endurance.checkModifiers(), { label: t('Fatigue'), value: -entry.fatigue }], fast: true })
        const natural = naturalD20(result!.roll)
        const dc = floorCheckDc(actor.system.details.floor, 'skill')
        productive = natural === 20 || (natural !== 1 && result!.roll.total >= dc)
        if (!productive) entry.fatigue++
        entry.lines.push(t('HourResult', { hour: state.hoursToday + 1, total: result!.roll.total, dc, result: t(productive ? 'Productive' : 'Failed') }))
      }
      state = creditGrindingHour(state, productive)
    }
    state = creditGrindingAid(state, options.aid)
    const skills = actor.items.filter((item: any) => ['skill', 'spell'].includes(item.type) && item.name.trim())
    const capacity = (item: any) => Math.max(0, Math.max(1, item.system.rank.base) - (state.skillHours[item.id] ?? 0))
    const required = Math.min(state.unassignedHours, skills.reduce((sum: number, item: any) => sum + capacity(item), 0))
    let allocations: Record<string, number> | null = null
    while (!allocations) {
      const answer = await foundry.applications.api.DialogV2.prompt({
        window: { title: `${t('Title')} - ${actor.name}` }, position: { width: 560 }, classes: ['crawlspace', 'grinding-dialog'], rejectClose: false,
        content: `<p>${t('Allocate', { hours: required, banked: state.levelHours })}</p>${skills.map((item: any) => `<div class="form-group"><label>${esc(item.name)} (${t('Progress', { hours: state.skillHours[item.id] ?? 0, rank: item.system.rank.base })})</label><input name="${item.id}" type="number" min="0" max="${capacity(item)}" value="0"></div>`).join('')}`,
        ok: { callback: (_event: Event, button: any) => Object.fromEntries(skills.map((item: any) => [item.id, Number(button.form.elements[item.id].value)])) },
      })
      if (!answer) return
      if (skills.some((item: any) => !Number.isSafeInteger(answer[item.id]) || answer[item.id] < 0 || answer[item.id] > capacity(item)) || Object.values(answer as Record<string, number>).reduce((a, b) => a + b, 0) !== required) {
        ui.notifications.warn(t('AllocateError', { hours: required })); continue
      }
      allocations = answer
    }
    for (const item of skills) {
      const rank = item.system.rank.base
      state.skillHours[item.id] = (state.skillHours[item.id] ?? 0) + allocations![item.id]
      if (state.skillHours[item.id] < Math.max(1, rank) || state.attempted[item.id] === state.day || rank >= rankCap(actor, item.name)) continue
      const result = await rollD20(actor, { label: item.name, kind: 'check', modifiers: [...penaltyModifiers(actor), { label: t('Fatigue'), value: -entry.fatigue }], fast: true })
      const passed = result!.roll.total >= rank
      if (passed) entry.updates.push({ _id: item.id, 'system.rank.value': item.system.rank.value + 1 })
      state.skillHours[item.id] -= Math.max(1, rank)
      state.attempted[item.id] = state.day
      entry.lines.push(t('CheckResult', { name: item.name, total: result!.roll.total, rank, result: t(passed ? 'Advanced' : 'NotAdvanced') }))
    }
    state.unassignedHours = 0
    entry.level = actor.system.details.level
    if (state.levelHours >= entry.level) {
      const others = levels.filter((other: any) => other.uuid !== actor.uuid).map((other: any) => other.level)
      const gained = isUniqueLowestCrawler(entry.level, others) ? (await Roll.create('1d2').evaluate()).total : 1
      entry.level += gained
      state.levelHours = 0
      entry.lines.push(t('LevelResult', { gained, level: entry.level }))
    }
    entry.state = state
  }
  for (const entry of prepared) if (entry.base !== JSON.stringify({ grinding: entry.actor.getFlag('crawlspace', 'grinding'), level: entry.actor.system.details.level, items: entry.actor.items.map((item: any) => [item.id, item.system.rank?.value]) })) throw new Error(t('Changed'))
  if (policy.advance !== false) await advanceTime(hours * 3600)
  for (const entry of prepared) {
    if (entry.updates.length) await entry.actor.updateEmbeddedDocuments('Item', entry.updates)
    await entry.actor.update({ 'flags.crawlspace.grinding': entry.state, 'system.details.level': entry.level })
    for (let index = 0; index < entry.fatigue; index++) await entry.actor.addDebuff('fatigued')
    await ChatMessage.create({ speaker: ChatMessage.getSpeaker({ actor: entry.actor }), content: `<div class="crawlspace chat-card"><h3>${t('Title')}</h3><p>${t('Summary', { hours, productive: entry.state.productiveToday, level: entry.state.levelHours })}</p><ul>${entry.lines.map((line: string) => `<li>${esc(line)}</li>`).join('')}</ul></div>` })
  }
}
