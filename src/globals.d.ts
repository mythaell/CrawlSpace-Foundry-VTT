// Foundry V14 has no maintained type package yet, so its runtime globals are declared loosely.
declare const foundry: any
declare const game: any
declare const CONFIG: any
declare const CONST: any
declare const Hooks: any
declare const ui: any
declare const canvas: any
declare const PIXI: any
declare const Roll: any
declare const ChatMessage: any
declare const Actor: any
declare const Item: any
declare const ActiveEffect: any
declare const Combat: any
declare const Combatant: any
declare const TokenDocument: any
declare const Handlebars: any
declare const fromUuid: (uuid: string) => Promise<any>
declare const fromUuidSync: (uuid: string) => any
interface Math {
  /** Added by Foundry. */
  clamp(value: number, min: number, max: number): number
}
