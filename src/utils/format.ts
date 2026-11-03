const NUMBER = new Intl.NumberFormat('en-PH')
const COMPACT = new Intl.NumberFormat('en-PH', { notation: 'compact', maximumFractionDigits: 1 })

export function formatNumber(value: number): string {
  return NUMBER.format(value)
}

export function formatCompact(value: number): string {
  return COMPACT.format(value)
}

export function formatPercent(ratio: number, digits = 0): string {
  return `${(ratio * 100).toFixed(digits)}%`
}

/** Signed change between two values as a ratio, or null when there's no base. */
export function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null
  return (current - previous) / previous
}

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]!.toUpperCase())
    .join('')
}

export function titleCase(value: string): string {
  return value.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}
