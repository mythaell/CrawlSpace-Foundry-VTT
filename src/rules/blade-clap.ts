/** Pure module: Samurai Blade Clap catches edged weapons, and missiles from Rank 5. */
export function bladeClapSkill(actor: any) {
  return actor?.type === 'crawler' ? actor.items.find((item: any) => item.type === 'skill' && item.name.toLowerCase().replace(/[^a-z]/g, '') === 'samuraibladeclap') : null
}

export function bladeClapAllowed(attack: { toHit: number | null; isArea?: boolean; magic?: boolean; ranged?: boolean; damageTypes?: string[] }, rank: number) {
  return attack.toHit !== null && !attack.isArea && !attack.magic && !!attack.damageTypes?.some((type) => ['Slashing', 'Piercing'].includes(type)) && (!attack.ranged || rank >= 5)
}
