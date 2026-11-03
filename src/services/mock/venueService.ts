import type { Court, Location } from '@/types/venue'
import { newId, slugify } from '@/utils/ids'

import { db, findOrThrow, respond, ServiceError } from './mockDb'
import { assertWithinLimit } from './subscriptionService'

// --- Locations -------------------------------------------------------------

export async function listLocations(tenantId: string): Promise<Location[]> {
  return respond(db.locations.filter((l) => l.tenantId === tenantId))
}

export type LocationInput = Omit<Location, 'id' | 'tenantId' | 'slug'>

export async function saveLocation(
  tenantId: string,
  input: LocationInput,
  id?: string,
): Promise<Location> {
  if (input.closeHour <= input.openHour) {
    throw new ServiceError('Closing time must be after opening time', 'invalid')
  }
  if (id) {
    const location = findOrThrow(db.locations, id, 'Location')
    Object.assign(location, input, { slug: slugify(input.name) })
    return respond(location)
  }
  assertWithinLimit(tenantId, 'locations')
  const location: Location = { ...input, id: newId('loc'), tenantId, slug: slugify(input.name) }
  db.locations.push(location)
  return respond(location)
}

export async function deleteLocation(id: string): Promise<void> {
  const hasUpcoming = db.bookings.some(
    (b) => b.locationId === id && (b.status === 'confirmed' || b.status === 'pending'),
  )
  if (hasUpcoming) {
    throw new ServiceError(
      'This location has upcoming bookings. Cancel or move them, or set it to inactive instead.',
      'conflict',
    )
  }
  db.locations = db.locations.filter((l) => l.id !== id)
  db.courts = db.courts.filter((c) => c.locationId !== id)
  await respond(null)
}

// --- Courts ----------------------------------------------------------------

export async function listCourts(tenantId: string, locationId?: string): Promise<Court[]> {
  return respond(
    db.courts.filter(
      (c) => c.tenantId === tenantId && (!locationId || c.locationId === locationId),
    ),
  )
}

export type CourtInput = Omit<Court, 'id' | 'tenantId'>

export async function saveCourt(tenantId: string, input: CourtInput, id?: string): Promise<Court> {
  if (input.dayRate <= 0 || input.nightRate <= 0) {
    throw new ServiceError('Rates must be more than zero', 'invalid')
  }
  if (id) {
    const court = findOrThrow(db.courts, id, 'Court')
    Object.assign(court, input)
    return respond(court)
  }
  assertWithinLimit(tenantId, 'courts')
  const court: Court = { ...input, id: newId('crt'), tenantId }
  db.courts.push(court)
  return respond(court)
}

export async function deleteCourt(id: string): Promise<void> {
  const hasUpcoming = db.bookings.some(
    (b) => b.courtId === id && (b.status === 'confirmed' || b.status === 'pending'),
  )
  if (hasUpcoming) {
    throw new ServiceError(
      'This court has upcoming bookings. Set it to maintenance or inactive instead.',
      'conflict',
    )
  }
  db.courts = db.courts.filter((c) => c.id !== id)
  await respond(null)
}
