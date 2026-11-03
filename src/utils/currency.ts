/**
 * Money is stored and passed around as integer centavos (1/100 PHP) to
 * avoid floating-point rounding, same as match-pickleball.
 */
const PHP_FORMATTER = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  maximumFractionDigits: 0,
})

const PHP_COMPACT = new Intl.NumberFormat('en-PH', {
  style: 'currency',
  currency: 'PHP',
  notation: 'compact',
  maximumFractionDigits: 1,
})

/** `125000` -> "₱1,250". */
export function formatPHP(centavos: number): string {
  return PHP_FORMATTER.format(centavos / 100)
}

/** `12500000` -> "₱125K". */
export function formatPHPCompact(centavos: number): string {
  return PHP_COMPACT.format(centavos / 100)
}

export function pesos(amount: number): number {
  return Math.round(amount * 100)
}
