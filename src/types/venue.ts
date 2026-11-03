export type LocationStatus = 'active' | 'inactive'

export interface Location {
  id: string
  tenantId: string
  name: string
  slug: string
  address: string
  city: string
  phone: string
  /** Opening hour, 24h clock. */
  openHour: number
  /** Closing hour, 24h clock (exclusive). */
  closeHour: number
  status: LocationStatus
  amenities: string[]
  /** Map pin set by the owner; both null when there's no pin. */
  latitude: number | null
  longitude: number | null
}

export type CourtType = 'indoor' | 'outdoor' | 'covered'
export type CourtStatus = 'active' | 'maintenance' | 'inactive'

export interface Court {
  id: string
  tenantId: string
  locationId: string
  name: string
  type: CourtType
  surface: string
  /** Integer centavos per hour, before night starts. */
  dayRate: number
  /** Integer centavos per hour, from nightStartHour until closing. */
  nightRate: number
  /** Hour (24h; 24+ = after midnight) when the night rate starts. */
  nightStartHour: number
  status: CourtStatus
  features: string[]
}
