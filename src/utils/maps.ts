import type { Location } from '@/types/venue'

export interface LatLng {
  lat: number
  lng: number
}

/** The location's pin, or null when the owner hasn't set one. */
export function locationPin(l: Pick<Location, 'latitude' | 'longitude'>): LatLng | null {
  return l.latitude === null || l.longitude === null ? null : { lat: l.latitude, lng: l.longitude }
}

/** Address on one line, e.g. "Salinas Drive, Cebu IT Park, Cebu City". */
export function fullAddress(l: Pick<Location, 'address' | 'city'>): string {
  return [l.address, l.city]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ')
}

/**
 * Google Maps directions to the location (opens the app on phones). Uses the
 * pin when there is one, otherwise the address. Official Maps URLs; no key.
 */
export function directionsUrl(l: Pick<Location, 'address' | 'city' | 'latitude' | 'longitude'>) {
  const pin = locationPin(l)
  const destination = pin ? `${pin.lat},${pin.lng}` : `${fullAddress(l)}, Philippines`
  return `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(destination)}`
}

/** Rounds to 6 decimals (~10 cm), the precision the database stores. */
export function roundPin(p: LatLng): LatLng {
  const r = (n: number) => Math.round(n * 1e6) / 1e6
  return { lat: r(p.lat), lng: r(p.lng) }
}

/**
 * Finds an address with OpenStreetMap's Nominatim (free; for occasional,
 * person-triggered searches only — never in a loop). Philippines only.
 */
export async function findAddress(query: string): Promise<LatLng | null> {
  const url = new URL('https://nominatim.openstreetmap.org/search')
  url.searchParams.set('format', 'jsonv2')
  url.searchParams.set('limit', '1')
  url.searchParams.set('countrycodes', 'ph')
  url.searchParams.set('q', query)
  const res = await fetch(url, { headers: { Accept: 'application/json' } })
  if (!res.ok) throw new Error('Map search is unavailable right now. Drag the pin instead.')
  const results = (await res.json()) as { lat: string; lon: string }[]
  const first = results[0]
  return first ? roundPin({ lat: Number(first.lat), lng: Number(first.lon) }) : null
}
