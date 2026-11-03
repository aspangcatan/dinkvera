const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

/** Client-side id for records created in the prototype (Postgres uuids later). */
export function newId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`
}

/** Booking reference such as "RP-7K2Q": tenant monogram + 4 unambiguous chars. */
export function bookingReference(monogram: string, random: () => number = Math.random): string {
  let code = ''
  for (let i = 0; i < 4; i++) code += ALPHABET[Math.floor(random() * ALPHABET.length)]
  return `${monogram.toUpperCase()}-${code}`
}

export function slugify(value: string): string {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}
