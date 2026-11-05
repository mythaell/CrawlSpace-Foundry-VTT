/** Pure time rules from CrawlSpace effectDurations.ts, partyTimers.ts and UpkeepPopup.ts. */
export const ROUND_SECONDS = 10
export const DAY_SECONDS = 108000

export type TimeParts = { days: number; hours: number; minutes: number; seconds: number }

/** Accept overflow in any field, then normalize using a thirty-hour dungeon day. */
export function timePartsSeconds(parts: TimeParts): number {
  if (Object.values(parts).some((value) => !Number.isSafeInteger(value) || value < 0)) throw new Error('Invalid time fields')
  const total = parts.days * DAY_SECONDS + parts.hours * 3600 + parts.minutes * 60 + parts.seconds
  if (!Number.isSafeInteger(total)) throw new Error('Invalid time fields')
  return total
}

/** Break game seconds into normalized day/hour/minute/second fields. */
export function timeParts(value: number): TimeParts {
  const seconds = Math.max(0, Math.floor(value))
  return { days: Math.floor(seconds / DAY_SECONDS), hours: Math.floor(seconds / 3600) % 30, minutes: Math.floor(seconds / 60) % 60, seconds: seconds % 60 }
}

/** Explicit quantities only; conditional prose stays manual. A dungeon day is thirty hours. */
export function durationSeconds(value: unknown): number | null {
  if (typeof value !== 'string' || value.length > 1000) return null
  const text = value.trim().toLowerCase().replace(/^(?:for |lasts |until (?:the )?end of (?:the )?)/, '').replace(/\.$/, '')
  if (text === 'next round') return ROUND_SECONDS
  if (text.includes(' or ')) {
    const parts = text.split(' or ').map(durationSeconds)
    return parts[0] !== null && parts.every((part) => part === parts[0]) ? parts[0] : null
  }
  const units: Record<string, number> = { d: DAY_SECONDS, day: DAY_SECONDS, days: DAY_SECONDS, h: 3600, hr: 3600, hrs: 3600, hour: 3600, hours: 3600, m: 60, min: 60, mins: 60, minute: 60, minutes: 60, s: 1, sec: 1, secs: 1, second: 1, seconds: 1, round: ROUND_SECONDS, rounds: ROUND_SECONDS }
  let seconds = 0
  let found = false
  const remainder = text.replace(/(\d+(?:\.\d+)?)\s*(days?|d|hours?|hrs?|h|minutes?|mins?|m|seconds?|secs?|s|rounds?)\b/g, (_match, amount: string, unit: string) => {
    seconds += Number(amount) * units[unit]
    found = true
    return ''
  }).replace(/\band\b|[\s,]/g, '')
  return found && !remainder && Number.isFinite(seconds) && seconds >= 0 && seconds <= 108000000 ? Math.floor(seconds) : null
}

/** Event durations use native ActiveEffect expiry events, scoped to the affected actors. */
export function durationEvent(value: unknown): string | null {
  const text = String(value ?? '').trim().toLowerCase().replace(/\.$/, '')
  const events: Record<string, string> = {
    'until end of combat': 'combatEnd',
    'until the end of combat': 'combatEnd',
    'until you enter a saferoom': 'safeRoom',
    'until you enter a safe room': 'safeRoom',
    'until you complete a long rest': 'longRest',
    'until you leave this floor': 'leaveFloor',
    'until you are healed at least 1 health slot': 'healed',
  }
  return events[text] ?? null
}

/** Rest lengths from UpkeepPopup.ts; hourly recovery accepts whole completed hours. */
export function restSeconds(kind: string, hours = 1): number {
  if (!['short', 'long', 'full', 'hourly'].includes(kind)) throw new Error('Invalid rest kind')
  if (kind === 'hourly' && (!Number.isSafeInteger(hours) || hours < 1)) throw new Error('Invalid completed hours')
  return ({ short: 7200, long: 28800, full: DAY_SECONDS } as Record<string, number>)[kind] ?? hours * 3600
}

/** Compact thirty-hour-day display, shared by cooldowns and the GM clock. */
export function formatTime(value: number): string {
  const seconds = Math.max(0, Math.floor(value))
  return [Math.floor(seconds / DAY_SECONDS), Math.floor(seconds / 3600) % 30, Math.floor(seconds / 60) % 60, seconds % 60]
    .map((part) => String(part).padStart(2, '0')).join(':')
}
