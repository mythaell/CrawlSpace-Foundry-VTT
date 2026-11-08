/**
 * Hold Shift while hovering a token to read its actor's flavor text (the app's TokenFlavorTooltip): a card above
 * the token when it fits, otherwise below, always kept on screen. It sits on the page, not the canvas, so fog and
 * zoom can't hide or shrink it.
 */
import { flavorText } from '../rules/flavor'

let hovered: any = null
let shift = false
let card: HTMLElement | null = null

function hide() {
  card?.remove()
  card = null
}

function show() {
  const token = hovered
  const text = token?.actor ? flavorText(token.actor.system) : ''
  if (!token || !shift || !text || !token.visible) return hide()
  card ??= document.body.appendChild(Object.assign(document.createElement('div'), { id: 'crawl-flavor-tip', className: 'crawlspace crawl-flavor-tip' }))
  card.innerHTML = `<strong>${foundry.utils.escapeHTML(token.document.name)}</strong><p>${foundry.utils.escapeHTML(text).replace(/\n/g, '<br>')}</p>`
  const box = canvas.app.view.getBoundingClientRect()
  const top = canvas.clientCoordinatesFromCanvas({ x: token.center.x, y: token.document.y })
  const bottom = canvas.clientCoordinatesFromCanvas({ x: token.center.x, y: token.document.y + token.h })
  const width = card.offsetWidth
  const height = card.offsetHeight
  const gap = 10
  const above = box.top + top.y - gap - height
  const below = box.top + bottom.y + gap
  const y = above >= 8 ? above : below + height <= window.innerHeight - 8 ? below : Math.max(8, Math.min(above, window.innerHeight - height - 8))
  const x = Math.max(8, Math.min(box.left + top.x - width / 2, window.innerWidth - width - 8))
  card.style.left = `${x}px`
  card.style.top = `${y}px`
}

export function registerFlavorTooltip() {
  Hooks.on('hoverToken', (token: any, isHovered: boolean) => {
    hovered = isHovered ? token : hovered === token ? null : hovered
    show()
  })
  Hooks.on('canvasPan', () => show())
  Hooks.on('canvasTearDown', () => {
    hovered = null
    hide()
  })
  Hooks.on('updateToken', (document: any) => {
    if (hovered?.document === document) show()
  })
  const onKey = (event: KeyboardEvent) => {
    if (event.key !== 'Shift' || shift === (event.type === 'keydown')) return
    shift = event.type === 'keydown'
    show()
  }
  window.addEventListener('keydown', onKey)
  window.addEventListener('keyup', onKey)
  // Shift released while the window lost focus.
  window.addEventListener('blur', () => {
    shift = false
    hide()
  })
}
