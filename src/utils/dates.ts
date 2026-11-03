/**
 * Calendar dates are plain `YYYY-MM-DD` strings (no time zone drift when
 * compared or used as keys). Mock data is generated relative to today so
 * the prototype always looks current.
 */
export function toISODate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function parseISODate(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y!, m! - 1, d!)
}

export function todayISO(): string {
  return toISODate(new Date())
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function addMonths(iso: string, months: number): string {
  const date = parseISODate(iso)
  date.setMonth(date.getMonth() + months)
  return toISODate(date)
}

export function daysBetween(fromIso: string, toIso: string): number {
  return Math.round((parseISODate(toIso).getTime() - parseISODate(fromIso).getTime()) / 86_400_000)
}

export function startOfWeek(iso: string): string {
  const date = parseISODate(iso)
  return addDays(iso, -((date.getDay() + 6) % 7))
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7)
}

export function isWeekend(iso: string): boolean {
  const day = parseISODate(iso).getDay()
  return day === 0 || day === 6
}

const SHORT = new Intl.DateTimeFormat('en-PH', { month: 'short', day: 'numeric' })
const LONG = new Intl.DateTimeFormat('en-PH', {
  weekday: 'short',
  month: 'short',
  day: 'numeric',
  year: 'numeric',
})
const WEEKDAY = new Intl.DateTimeFormat('en-PH', { weekday: 'long', month: 'long', day: 'numeric' })
const MONTH = new Intl.DateTimeFormat('en-PH', { month: 'long', year: 'numeric' })
const MONTH_SHORT = new Intl.DateTimeFormat('en-PH', { month: 'short' })

/** "Nov 1" */
export function formatShortDate(iso: string): string {
  return SHORT.format(parseISODate(iso.slice(0, 10)))
}

/** "Sun, Nov 1, 2026" */
export function formatLongDate(iso: string): string {
  return LONG.format(parseISODate(iso.slice(0, 10)))
}

/** "Sunday, November 1" */
export function formatWeekdayDate(iso: string): string {
  return WEEKDAY.format(parseISODate(iso))
}

/** "November 2026" from "2026-11" or a full date. */
export function formatMonth(isoOrKey: string): string {
  return MONTH.format(parseISODate(`${isoOrKey.slice(0, 7)}-01`))
}

/** "Nov" */
export function formatMonthShort(isoOrKey: string): string {
  return MONTH_SHORT.format(parseISODate(`${isoOrKey.slice(0, 7)}-01`))
}

/** `18` -> "6 PM", `12` -> "12 PM", `24` -> "12 AM". */
export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24
  const suffix = h < 12 ? 'AM' : 'PM'
  const display = h % 12 === 0 ? 12 : h % 12
  return `${display} ${suffix}`
}

/**
 * A location's hours: "6 AM – 10 PM", "5 PM – 2 AM (next day)", or
 * "Open 24 hours" when the business day covers the whole clock.
 */
export function formatOpeningHours(openHour: number, closeHour: number): string {
  if (closeHour - openHour >= 24) return 'Open 24 hours'
  const nextDay = closeHour > 24 ? ' (next day)' : ''
  return `${formatHour(openHour)} – ${formatHour(closeHour)}${nextDay}`
}

export function formatTimeRange(startHour: number, durationHours: number): string {
  return `${formatHour(startHour)} – ${formatHour(startHour + durationHours)}`
}

/** Relative wording for timestamps: "3h ago", "2d ago", or the date. */
export function formatRelative(isoDateTime: string): string {
  const diff = Date.now() - new Date(isoDateTime).getTime()
  const minutes = Math.round(diff / 60_000)
  if (minutes < 1) return 'just now'
  if (minutes < 60) return `${minutes}m ago`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `${hours}h ago`
  const days = Math.round(hours / 24)
  if (days < 30) return `${days}d ago`
  return formatShortDate(isoDateTime)
}
