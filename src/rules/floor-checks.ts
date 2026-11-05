/** Pure module: floor-scaled skill and stat check difficulties. */
export function floorCheckDc(floor: number | string, kind: 'skill' | 'stat') {
  return 10 + Math.max(0, Math.floor(Number(floor) || 0)) * (kind === 'skill' ? 2 : 1)
}
